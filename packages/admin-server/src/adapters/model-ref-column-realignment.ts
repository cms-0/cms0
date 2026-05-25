import type pg from "pg";
import type { FullDescriptor } from "@cms0/shared";
import {
  collectDirectModelRefColumnAliases,
  type DirectModelRefColumnAlias,
} from "../schema-generator";
import { quoteIdent } from "../schema-backup/utils";

export type ModelRefColumnRealignmentResult = {
  renamedColumns: Array<{
    tableName: string;
    from: string;
    to: string;
    propertyName: string;
  }>;
  copiedColumns: Array<{
    tableName: string;
    from: string;
    to: string;
    propertyName: string;
    rowCount: number;
  }>;
  warnings: string[];
};

function isCanonicalAlias(alias: DirectModelRefColumnAlias): boolean {
  return alias.canonicalDbName === alias.legacyDbName;
}

function isUnambiguousLegacyAlias(
  alias: DirectModelRefColumnAlias,
  allAliases: DirectModelRefColumnAlias[],
): boolean {
  const related = allAliases.filter(
    (candidate) =>
      candidate.tableName === alias.tableName &&
      candidate.legacyDbName === alias.legacyDbName,
  );
  return related.length === 1;
}

async function listPublicColumns(
  client: pg.PoolClient,
  tableNames: string[],
): Promise<Map<string, Set<string>>> {
  if (!tableNames.length) return new Map();

  const res = await client.query<{ table_name: string; column_name: string }>(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC, ordinal_position ASC
    `,
    [tableNames],
  );

  const columnsByTable = new Map<string, Set<string>>();
  for (const row of res.rows) {
    const existing = columnsByTable.get(row.table_name) ?? new Set<string>();
    existing.add(row.column_name);
    columnsByTable.set(row.table_name, existing);
  }
  return columnsByTable;
}

function formatAmbiguousWarning(alias: DirectModelRefColumnAlias): string {
  return `Skipped legacy modelRef column realignment for ${alias.tableName}.${alias.legacyDbName} -> ${alias.canonicalDbName}; the legacy column is ambiguous for descriptor field "${alias.propertyName}".`;
}

export async function realignDirectModelRefColumns(
  pool: pg.Pool,
  descriptor: FullDescriptor,
): Promise<ModelRefColumnRealignmentResult> {
  const allAliases = collectDirectModelRefColumnAliases(descriptor);
  const aliases = allAliases.filter((alias) => !isCanonicalAlias(alias));

  const result: ModelRefColumnRealignmentResult = {
    renamedColumns: [],
    copiedColumns: [],
    warnings: [],
  };

  if (!aliases.length) return result;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const tableNames = Array.from(
      new Set(allAliases.map((alias) => alias.tableName)),
    );
    const columnsByTable = await listPublicColumns(client, tableNames);
    const emittedWarnings = new Set<string>();

    for (const alias of aliases) {
      const tableColumns = columnsByTable.get(alias.tableName);
      if (!tableColumns?.has(alias.legacyDbName)) continue;

      const canonicalExists = tableColumns.has(alias.canonicalDbName);
      const unambiguous = isUnambiguousLegacyAlias(alias, allAliases);

      if (!unambiguous) {
        if (!canonicalExists) {
          const warning = formatAmbiguousWarning(alias);
          if (!emittedWarnings.has(warning)) {
            result.warnings.push(warning);
            emittedWarnings.add(warning);
          }
        }
        continue;
      }

      const qualified = `${quoteIdent("public")}.${quoteIdent(alias.tableName)}`;
      const legacyColumn = quoteIdent(alias.legacyDbName);
      const canonicalColumn = quoteIdent(alias.canonicalDbName);

      if (canonicalExists) {
        const copyResult = await client.query(
          `UPDATE ${qualified}
           SET ${canonicalColumn} = ${legacyColumn}
           WHERE ${canonicalColumn} IS NULL
             AND ${legacyColumn} IS NOT NULL`,
        );
        const rowCount = copyResult.rowCount ?? 0;
        if (rowCount > 0) {
          result.copiedColumns.push({
            tableName: alias.tableName,
            from: alias.legacyDbName,
            to: alias.canonicalDbName,
            propertyName: alias.propertyName,
            rowCount,
          });
        }
        continue;
      }

      await client.query(
        `ALTER TABLE ${qualified}
         RENAME COLUMN ${legacyColumn} TO ${canonicalColumn}`,
      );
      tableColumns.delete(alias.legacyDbName);
      tableColumns.add(alias.canonicalDbName);
      result.renamedColumns.push({
        tableName: alias.tableName,
        from: alias.legacyDbName,
        to: alias.canonicalDbName,
        propertyName: alias.propertyName,
      });
    }

    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
