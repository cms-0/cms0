/**
 * Schema Backup Database Operations
 */

import pg from "pg";
import type { SchemaDescriptor } from "@cms0/admin-contract";
import {
  checksumDescriptor,
  loadLatestSchemaSnapshotRecord,
} from "../schema-store";
import { quoteIdent } from "./utils";

export async function listPublicTables(pool: pg.Pool): Promise<string[]> {
  const res = await pool.query<{ table_name: string }>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
    ORDER BY table_name ASC
  `);
  return res.rows.map((r) => r.table_name).filter(Boolean);
}

export async function listPublicForeignKeyDependencies(
  pool: pg.Pool,
): Promise<Map<string, Set<string>>> {
  const res = await pool.query<{
    depends_on: string;
    table_name: string;
  }>(`
    SELECT child.relname AS table_name, parent.relname AS depends_on
    FROM pg_constraint constraint_ref
    JOIN pg_class child
      ON child.oid = constraint_ref.conrelid
    JOIN pg_namespace child_ns
      ON child_ns.oid = child.relnamespace
    JOIN pg_class parent
      ON parent.oid = constraint_ref.confrelid
    JOIN pg_namespace parent_ns
      ON parent_ns.oid = parent.relnamespace
    WHERE constraint_ref.contype = 'f'
      AND child_ns.nspname = 'public'
      AND parent_ns.nspname = 'public'
  `);

  const dependencies = new Map<string, Set<string>>();

  for (const row of res.rows) {
    const tableName = row.table_name;
    const dependsOn = row.depends_on;
    if (!tableName || !dependsOn || tableName === dependsOn) {
      continue;
    }
    const existing = dependencies.get(tableName) ?? new Set<string>();
    existing.add(dependsOn);
    dependencies.set(tableName, existing);
  }

  return dependencies;
}

export function orderTablesByDependencies(
  tableNames: string[],
  dependencies: Map<string, Set<string>>,
): string[] {
  const candidates = new Set(tableNames);
  const incomingCounts = new Map<string, number>();
  const dependents = new Map<string, Set<string>>();

  for (const tableName of tableNames) {
    const deps = [...(dependencies.get(tableName) ?? new Set<string>())].filter(
      (dependency) => candidates.has(dependency) && dependency !== tableName,
    );
    incomingCounts.set(tableName, deps.length);

    for (const dependency of deps) {
      const existing = dependents.get(dependency) ?? new Set<string>();
      existing.add(tableName);
      dependents.set(dependency, existing);
    }
  }

  const ready = tableNames
    .filter((tableName) => (incomingCounts.get(tableName) ?? 0) === 0)
    .sort((left, right) => left.localeCompare(right));
  const ordered: string[] = [];

  while (ready.length > 0) {
    const tableName = ready.shift()!;
    ordered.push(tableName);

    for (const dependent of dependents.get(tableName) ?? []) {
      const nextCount = (incomingCounts.get(dependent) ?? 0) - 1;
      incomingCounts.set(dependent, nextCount);
      if (nextCount === 0) {
        ready.push(dependent);
        ready.sort((left, right) => left.localeCompare(right));
      }
    }
  }

  const unresolved = tableNames
    .filter((tableName) => !ordered.includes(tableName))
    .sort((left, right) => left.localeCompare(right));

  return [...ordered, ...unresolved];
}

export async function collectAllTableRows(
  pool: pg.Pool,
  options?: { includeTable?: (tableName: string) => boolean },
): Promise<{ name: string; rows: Record<string, unknown>[] }[]> {
  const tableNames = await listPublicTables(pool);
  const filteredTableNames = options?.includeTable
    ? tableNames.filter((tableName) => options.includeTable?.(tableName))
    : tableNames;
  const dependencies = await listPublicForeignKeyDependencies(pool);
  const orderedTableNames = orderTablesByDependencies(
    filteredTableNames,
    dependencies,
  );
  const tables: { name: string; rows: Record<string, unknown>[] }[] = [];
  for (const tableName of orderedTableNames) {
    const qualified = `${quoteIdent("public")}.${quoteIdent(tableName)}`;
    const res = await pool.query(`SELECT * FROM ${qualified}`);
    tables.push({ name: tableName, rows: res.rows ?? [] });
  }
  return tables;
}

export async function resolveDescriptorForBackup(
  pool: pg.Pool,
  explicitDescriptor?: SchemaDescriptor,
): Promise<{
  descriptor: SchemaDescriptor;
  checksum: string;
  version: string | null;
}> {
  if (explicitDescriptor) {
    return {
      descriptor: explicitDescriptor,
      checksum: checksumDescriptor(explicitDescriptor),
      version: null,
    };
  }
  const latest = await loadLatestSchemaSnapshotRecord(pool);
  if (latest?.descriptor) {
    return {
      descriptor: latest.descriptor,
      checksum: latest.checksum ?? checksumDescriptor(latest.descriptor),
      version: latest.version ?? null,
    };
  }
  const empty: SchemaDescriptor = { roots: {} };
  return {
    descriptor: empty,
    checksum: checksumDescriptor(empty),
    version: null,
  };
}

export async function enforceRetention(
  pool: pg.Pool,
  limit: number,
): Promise<void> {
  if (limit <= 0) return;
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM schema_backups ORDER BY created_at DESC`,
  );
  const toRemove = res.rows.slice(limit);
  for (const row of toRemove) {
    await pool.query(`DELETE FROM schema_backups WHERE id = $1`, [row.id]);
  }
}

export function getRetentionLimit(): number {
  const raw = process.env.CMS0_BACKUP_RETENTION_LIMIT ?? "";
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
}
