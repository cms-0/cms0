import { createHash } from "node:crypto";
import pg from "pg";
import type { SchemaDescriptor } from "@cms0/admin-contract";

export type SchemaSnapshotRecord = {
  id: string;
  version: string | null;
  descriptor: SchemaDescriptor;
  checksum: string | null;
  createdAt: string | null;
  publishedAt: string | null;
};

export type SchemaMetaRecord = {
  currentVersion: string | null;
  id: string;
};

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function checksumDescriptor(descriptor: unknown): string {
  const raw =
    typeof descriptor === "string" ? descriptor : JSON.stringify(descriptor);
  return createHash("sha256").update(raw).digest("hex");
}

export function normalizeSchemaSnapshotChecksum(
  checksum: string | null | undefined,
  descriptor: unknown,
): string {
  const value = typeof checksum === "string" ? checksum.trim() : "";
  if (SHA256_HEX_PATTERN.test(value)) {
    return value.toLowerCase();
  }
  return checksumDescriptor(descriptor);
}

function isMissingTableError(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = (err as any)?.message ?? "";
  return (
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("schema_snapshots") ||
    msg.includes("schema_meta")
  );
}

export async function loadLatestSchemaSnapshotRecord(
  pool: pg.Pool,
): Promise<SchemaSnapshotRecord | null> {
  try {
    const res = await pool.query<{
      id: string;
      version: string | null;
      descriptor: unknown;
      checksum: string | null;
      created_at: string | null;
    }>(`
      SELECT id, version, descriptor, checksum, created_at
      FROM schema_snapshots
      ORDER BY created_at DESC NULLS LAST
      LIMIT 1
    `);

    const row = res.rows[0];
    if (!row) {
      const metaRes = await pool.query<{
        id: string;
        current_version: string | null;
      }>(`
        SELECT id, current_version
        FROM schema_meta
        ORDER BY id DESC
        LIMIT 1
      `);
      const meta = metaRes.rows[0];
      if (!meta?.current_version) return null;

      const byVersion = await pool.query<{
        id: string;
        version: string | null;
        descriptor: unknown;
        checksum: string | null;
        created_at: string | null;
      }>(
        `SELECT id, version, descriptor, checksum, created_at
         FROM schema_snapshots
         WHERE version = $1
         LIMIT 1`,
        [meta.current_version],
      );
      const vRow = byVersion.rows[0];
      if (!vRow) return null;
      return {
        id: vRow.id,
        version: vRow.version ?? null,
        descriptor: vRow.descriptor as SchemaDescriptor,
        checksum: normalizeSchemaSnapshotChecksum(
          vRow.checksum,
          vRow.descriptor,
        ),
        createdAt: vRow.created_at ?? null,
        publishedAt: vRow.created_at ?? null,
      };
    }

    return {
      id: row.id,
      version: row.version ?? null,
      descriptor: row.descriptor as SchemaDescriptor,
      checksum: normalizeSchemaSnapshotChecksum(row.checksum, row.descriptor),
      createdAt: row.created_at ?? null,
      publishedAt: row.created_at ?? null,
    };
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function loadSchemaMetaRecord(
  pool: pg.Pool,
): Promise<SchemaMetaRecord | null> {
  try {
    const res = await pool.query<{
      id: string;
      current_version: string | null;
    }>(`SELECT id, current_version FROM schema_meta ORDER BY id DESC LIMIT 1`);
    const row = res.rows[0];
    if (!row) return null;
    return { id: row.id, currentVersion: row.current_version ?? null };
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function setCurrentSchemaVersion(
  version: string | null,
  pool: pg.Pool,
): Promise<void> {
  const existing = await loadSchemaMetaRecord(pool);
  if (!existing) {
    await pool.query(`INSERT INTO schema_meta (current_version) VALUES ($1)`, [
      version,
    ]);
    return;
  }
  await pool.query(
    `UPDATE schema_meta SET current_version = $1 WHERE id = $2`,
    [version, existing.id],
  );
}

export async function saveSchemaSnapshot(
  descriptor: unknown,
  version: string,
  pool: pg.Pool,
): Promise<void> {
  const checksum = checksumDescriptor(descriptor);
  const last = await loadLatestSchemaSnapshotRecord(pool);
  if (last?.checksum === checksum) return;

  await pool.query(
    `INSERT INTO schema_snapshots (version, descriptor, checksum, created_at)
     VALUES ($1, $2, $3, $4)`,
    [version, JSON.stringify(descriptor), checksum, new Date().toISOString()],
  );
  await setCurrentSchemaVersion(version, pool);
}

export async function loadAppliedSchemaChecksum(
  pool: pg.Pool,
): Promise<string | null> {
  const meta = await loadSchemaMetaRecord(pool);
  const version = meta?.currentVersion?.trim() ?? "";
  if (!version) return null;

  try {
    const res = await pool.query<{
      checksum: string | null;
      descriptor: unknown;
    }>(
      `SELECT checksum, descriptor
       FROM schema_snapshots
       WHERE version = $1
       ORDER BY created_at DESC NULLS LAST
       LIMIT 1`,
      [version],
    );
    const row = res.rows[0];
    if (!row) return null;
    return normalizeSchemaSnapshotChecksum(row.checksum, row.descriptor);
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}
