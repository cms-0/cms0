/**
 * Schema Backup Operations
 */

import { createHash, randomUUID } from "node:crypto";
import pg from "pg";
import type { SchemaDescriptor } from "@cms0/admin-contract";
import type {
  SchemaBackupSummary,
  SchemaBackupRow,
  BackupPayload,
} from "./types";
import {
  normalizeRow,
  encodePayload,
  decodePayload,
  computeSha256,
  quoteIdent,
} from "./utils";
import {
  resolveDescriptorForBackup,
  collectAllTableRows,
  enforceRetention,
  getRetentionLimit,
  listPublicForeignKeyDependencies,
  orderTablesByDependencies,
} from "./database";
import { normalizeModelRefArchivePayload } from "./model-ref-column-normalizer";

const BACKUP_OPERATION_TABLES = new Set(["schema_backups", "schema_backup_data"]);

async function ensureSchemaBackupDataTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_backup_data (
      backup_id uuid PRIMARY KEY REFERENCES schema_backups(id) ON DELETE CASCADE,
      payload bytea NOT NULL
    )
  `);
}

export async function listSchemaBackups(
  pool: pg.Pool,
  limit = 50,
): Promise<SchemaBackupSummary[]> {
  try {
    const res = await pool.query<SchemaBackupRow>(
      `SELECT * FROM schema_backups ORDER BY created_at DESC LIMIT $1`,
      [limit],
    );
    return res.rows.map(normalizeRow);
  } catch {
    return [];
  }
}

export async function getSchemaBackupRow(
  pool: pg.Pool,
  backupId: string,
): Promise<SchemaBackupRow | null> {
  try {
    const res = await pool.query<SchemaBackupRow>(
      `SELECT * FROM schema_backups WHERE id = $1 LIMIT 1`,
      [backupId],
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function getSchemaBackupDescriptor(
  pool: pg.Pool,
  backupId: string,
): Promise<SchemaDescriptor | null> {
  const row = await getSchemaBackupRow(pool, backupId);
  if (!row) return null;
  return (row.descriptor as SchemaDescriptor) ?? null;
}

export async function getSchemaBackupArchive(
  pool: pg.Pool,
  backupId: string,
): Promise<{ data: Buffer; fileName: string; checksum: string } | null> {
  const row = await getSchemaBackupRow(pool, backupId);
  if (!row) return null;

  try {
    await ensureSchemaBackupDataTable(pool);
    const res = await pool.query<{ payload: Buffer | string }>(
      `SELECT payload FROM schema_backup_data WHERE backup_id = $1 LIMIT 1`,
      [backupId],
    );
    const payloadRaw = res.rows[0]?.payload;
    if (!payloadRaw) return null;
    const data = Buffer.isBuffer(payloadRaw)
      ? payloadRaw
      : Buffer.from(String(payloadRaw), "base64");
    return { data, fileName: row.data_file_name, checksum: row.data_checksum };
  } catch {
    return null;
  }
}

export async function createSchemaBackup(
  pool: pg.Pool,
  input: {
    reason: string;
    descriptor?: SchemaDescriptor;
    fromVersion?: string | null;
    toVersion?: string | null;
    fromChecksum?: string | null;
    toChecksum?: string | null;
    dataFingerprint?: string;
  },
): Promise<SchemaBackupSummary | null> {
  try {
    await ensureSchemaBackupDataTable(pool);
    const descriptorInfo = await resolveDescriptorForBackup(
      pool,
      input.descriptor,
    );
    const tables = await collectAllTableRows(pool, {
      includeTable: (tableName) => !BACKUP_OPERATION_TABLES.has(tableName),
    });
    const payload: BackupPayload = {
      format: "cms0-db-backup-v3",
      createdAt: new Date().toISOString(),
      descriptor: descriptorInfo.descriptor,
      descriptorChecksum: descriptorInfo.checksum,
      tables,
    };
    const archiveBuffer = encodePayload(payload);
    const dataChecksum = computeSha256(archiveBuffer);
    const backupId = randomUUID();
    const dataFileName = `backup-${backupId}.json.gz`;
    const rowCounts: Record<string, number> = Object.fromEntries(
      tables.map((t) => [t.name, t.rows.length]),
    );
    const tableCount = tables.length;
    const sizeBytes = archiveBuffer.byteLength;
    const dataFingerprint = input.dataFingerprint ?? dataChecksum;
    const createdAt = new Date().toISOString();

    await pool.query(
      `INSERT INTO schema_backups
       (id, reason, status, from_version, to_version, from_checksum, to_checksum,
        descriptor, descriptor_checksum, data_fingerprint, data_file_name, data_checksum,
        row_counts, table_count, size_bytes, restored_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        backupId,
        input.reason,
        "ready",
        input.fromVersion ?? descriptorInfo.version,
        input.toVersion ?? descriptorInfo.version,
        input.fromChecksum ?? descriptorInfo.checksum,
        input.toChecksum ?? descriptorInfo.checksum,
        JSON.stringify(descriptorInfo.descriptor),
        descriptorInfo.checksum,
        dataFingerprint,
        dataFileName,
        dataChecksum,
        JSON.stringify(rowCounts),
        tableCount,
        sizeBytes,
        null,
        createdAt,
      ],
    );

    await pool.query(
      `INSERT INTO schema_backup_data (backup_id, payload) VALUES ($1, $2)
       ON CONFLICT (backup_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [backupId, archiveBuffer],
    );

    await enforceRetention(pool, getRetentionLimit());

    const inserted = await getSchemaBackupRow(pool, backupId);
    if (!inserted) return null;
    return normalizeRow(inserted);
  } catch (err) {
    console.error("[createSchemaBackup] Error:", err);
    return null;
  }
}

export async function deleteSchemaBackup(
  pool: pg.Pool,
  backupId: string,
): Promise<boolean> {
  try {
    await ensureSchemaBackupDataTable(pool);
    await pool.query(`DELETE FROM schema_backup_data WHERE backup_id = $1`, [
      backupId,
    ]);
    const res = await pool.query(
      `DELETE FROM schema_backups WHERE id = $1 RETURNING id`,
      [backupId],
    );
    return (res.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function exportDatabaseArchive(
  pool: pg.Pool,
  options?: { includeTable?: (tableName: string) => boolean },
): Promise<{
  fileName: string;
  data: Buffer;
  checksum: string;
  sizeBytes: number;
}> {
  const descriptorInfo = await resolveDescriptorForBackup(pool);
  const tables = await collectAllTableRows(pool, options);
  const payload: BackupPayload = {
    format: "cms0-db-backup-v3",
    createdAt: new Date().toISOString(),
    descriptor: descriptorInfo.descriptor,
    descriptorChecksum: descriptorInfo.checksum,
    tables,
  };
  const data = encodePayload(payload);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    fileName: `cms0-data-export-${stamp}-${randomUUID()}.json.gz`,
    data,
    checksum: computeSha256(data),
    sizeBytes: data.byteLength,
  };
}

export async function restoreDatabaseArchiveBuffer(
  pool: pg.Pool,
  archiveBuffer: Buffer,
  options?: { skipMissingTables?: boolean },
): Promise<{ restoredTables: string[]; skippedTables: string[] }> {
  const payload = decodePayload(archiveBuffer);
  if (!payload) {
    throw new Error("Invalid or unsupported backup archive format.");
  }

  const normalizedArchive = normalizeModelRefArchivePayload(payload);
  const restorePayload = normalizedArchive.payload;

  const { listPublicTables } = await import("./database");
  const available = new Set(await listPublicTables(pool));
  const incomingTables = restorePayload.tables.map((t) => t.name);
  const missing = incomingTables.filter((n) => !available.has(n));

  if (missing.length > 0 && !options?.skipMissingTables) {
    throw new Error(`Backup references missing tables: ${missing.join(", ")}`);
  }

  const candidate = incomingTables.filter((n) => available.has(n));
  const dependencies = await listPublicForeignKeyDependencies(pool);
  const orderedCandidate = orderTablesByDependencies(candidate, dependencies);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (orderedCandidate.length > 0) {
      const truncateTargets = orderedCandidate
        .map((n) => `${quoteIdent("public")}.${quoteIdent(n)}`)
        .join(", ");
      await client.query(
        `TRUNCATE TABLE ${truncateTargets} RESTART IDENTITY CASCADE`,
      );
    }

    const rowsByTable = new Map(
      restorePayload.tables.map((t) => [t.name, t.rows]),
    );

    const restoredTables: string[] = [];
    let pendingTables = orderedCandidate.filter(
      (tableName) => (rowsByTable.get(tableName) ?? []).length > 0,
    );

    while (pendingTables.length > 0) {
      let madeProgress = false;
      const nextPending: string[] = [];

      for (const tableName of pendingTables) {
        const rows = rowsByTable.get(tableName) ?? [];
        if (rows.length === 0) {
          restoredTables.push(tableName);
          madeProgress = true;
          continue;
        }

        const qualified = `${quoteIdent("public")}.${quoteIdent(tableName)}`;
        await client.query(`SAVEPOINT restore_table`);
        try {
          await client.query(
            `INSERT INTO ${qualified} SELECT * FROM json_populate_recordset(NULL::${qualified}, $1::json)`,
            [JSON.stringify(rows)],
          );
          await client.query(`RELEASE SAVEPOINT restore_table`);
          restoredTables.push(tableName);
          madeProgress = true;
        } catch (error) {
          await client.query(`ROLLBACK TO SAVEPOINT restore_table`);
          const errorCode =
            typeof error === "object" && error !== null && "code" in error
              ? String((error as { code?: unknown }).code ?? "")
              : "";

          if (errorCode === "23503") {
            nextPending.push(tableName);
            continue;
          }

          throw error;
        }
      }

      if (!madeProgress) {
        throw new Error(
          `Unable to restore tables due to unresolved foreign-key dependencies or cyclic references: ${nextPending.join(", ")}`,
        );
      }

      pendingTables = nextPending;
    }

    await client.query("COMMIT");
    return { restoredTables, skippedTables: missing };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function restoreSchemaBackupData(
  pool: pg.Pool,
  backupId: string,
): Promise<{ backupId: string; restoredTables: string[] }> {
  await ensureSchemaBackupDataTable(pool);
  const archive = await getSchemaBackupArchive(pool, backupId);
  if (!archive) {
    throw new Error(`Backup '${backupId}' not found.`);
  }

  const result = await restoreDatabaseArchiveBuffer(pool, archive.data);

  try {
    await pool.query(
      `UPDATE schema_backups SET status = 'restored', restored_at = $1 WHERE id = $2`,
      [new Date().toISOString(), backupId],
    );
  } catch {
    // best effort
  }

  return { backupId, restoredTables: result.restoredTables };
}

export async function importDatabaseArchiveBuffer(
  pool: pg.Pool,
  archiveBuffer: Buffer,
  input: {
    reason?: string;
    fromVersion?: string | null;
    toVersion?: string | null;
    fromChecksum?: string | null;
    skipMissingTables?: boolean;
  },
): Promise<{
  importedBackupId: string | null;
  restoredTables: string[];
  skippedTables: string[];
}> {
  await ensureSchemaBackupDataTable(pool);
  const payload = decodePayload(archiveBuffer);
  if (!payload) {
    throw new Error("Invalid or unsupported backup archive format.");
  }

  const result = await restoreDatabaseArchiveBuffer(pool, archiveBuffer, {
    skipMissingTables: input.skipMissingTables,
  });

  const descriptorInfo = await resolveDescriptorForBackup(
    pool,
    payload.descriptor,
  );
  const backupId = randomUUID();
  const dataChecksum = createHash("sha256").update(archiveBuffer).digest("hex");
  const dataFileName = `import-${backupId}.json.gz`;
  const rowCounts: Record<string, number> = Object.fromEntries(
    payload.tables.map((t) => [t.name, t.rows.length]),
  );
  const createdAt = new Date().toISOString();

  let importedBackupId: string | null = null;

  try {
    await pool.query(
      `INSERT INTO schema_backups
       (id, reason, status, from_version, to_version, from_checksum, to_checksum,
        descriptor, descriptor_checksum, data_fingerprint, data_file_name, data_checksum,
        row_counts, table_count, size_bytes, restored_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [
        backupId,
        input.reason ?? "import",
        "restored",
        input.fromVersion ?? null,
        input.toVersion ?? null,
        input.fromChecksum ?? null,
        descriptorInfo.checksum,
        JSON.stringify(descriptorInfo.descriptor),
        descriptorInfo.checksum,
        dataChecksum,
        dataFileName,
        dataChecksum,
        JSON.stringify(rowCounts),
        payload.tables.length,
        archiveBuffer.byteLength,
        createdAt,
        createdAt,
      ],
    );

    await pool.query(
      `INSERT INTO schema_backup_data (backup_id, payload) VALUES ($1, $2)
       ON CONFLICT (backup_id) DO UPDATE SET payload = EXCLUDED.payload`,
      [backupId, archiveBuffer],
    );

    await enforceRetention(pool, getRetentionLimit());
    importedBackupId = backupId;
  } catch {
    // best effort record keeping
  }

  return {
    importedBackupId,
    restoredTables: result.restoredTables,
    skippedTables: result.skippedTables,
  };
}
