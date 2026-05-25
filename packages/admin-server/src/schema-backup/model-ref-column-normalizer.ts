import type { FullDescriptor } from "@cms0/shared";
import {
  collectDirectModelRefColumnAliases,
  type DirectModelRefColumnAlias,
} from "../schema-generator";
import type { BackupPayload } from "./types";

export type ModelRefArchiveColumnChange = {
  tableName: string;
  propertyName: string;
  modelName: string;
  legacyDbName: string;
  canonicalDbName: string;
  rowCount: number;
};

export type ModelRefArchiveNormalizationResult = {
  payload: BackupPayload;
  changes: ModelRefArchiveColumnChange[];
  warnings: string[];
};

function hasOwn(row: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(row, key);
}

function aliasKey(alias: DirectModelRefColumnAlias): string {
  return `${alias.tableName}:${alias.legacyDbName}`;
}

function isCanonicalAlias(alias: DirectModelRefColumnAlias): boolean {
  return alias.canonicalDbName === alias.legacyDbName;
}

function groupAliases(
  aliases: DirectModelRefColumnAlias[],
): Map<string, DirectModelRefColumnAlias[]> {
  const groups = new Map<string, DirectModelRefColumnAlias[]>();
  for (const alias of aliases) {
    if (isCanonicalAlias(alias)) continue;
    const key = aliasKey(alias);
    const existing = groups.get(key) ?? [];
    existing.push(alias);
    groups.set(key, existing);
  }
  return groups;
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

function buildAmbiguityWarnings(
  aliases: DirectModelRefColumnAlias[],
  allAliases: DirectModelRefColumnAlias[],
  payload: BackupPayload,
): string[] {
  const warnings: string[] = [];
  const aliasesByLegacy = groupAliases(aliases);
  const tablesByName = new Map(payload.tables.map((table) => [table.name, table]));

  for (const [key, groupedAliases] of aliasesByLegacy) {
    const [tableName, legacyDbName] = key.split(":");
    if (!tableName || !legacyDbName) continue;
    const table = tableName ? tablesByName.get(tableName) : null;
    if (!table) continue;

    const ambiguousAliases = groupedAliases.filter(
      (alias) => !isUnambiguousLegacyAlias(alias, allAliases),
    );
    if (!ambiguousAliases.length) continue;

    const hasRowsNeedingCopy = table.rows.some((row) =>
      ambiguousAliases.some(
        (alias) =>
          hasOwn(row, legacyDbName) &&
          row[legacyDbName] != null &&
          (!hasOwn(row, alias.canonicalDbName) ||
            row[alias.canonicalDbName] == null),
      ),
    );
    if (!hasRowsNeedingCopy) continue;

    const fields = ambiguousAliases
      .map((alias) => `${alias.propertyName} -> ${alias.canonicalDbName}`)
      .join(", ");
    warnings.push(
      `Legacy modelRef column ${tableName}.${legacyDbName} is ambiguous and will not be copied automatically for: ${fields}.`,
    );
  }

  return warnings;
}

export function normalizeModelRefArchivePayload(
  payload: BackupPayload,
): ModelRefArchiveNormalizationResult {
  const allAliases = collectDirectModelRefColumnAliases(
    payload.descriptor as FullDescriptor,
  );
  const aliases = allAliases.filter(
    (alias) => alias.canonicalDbName !== alias.legacyDbName,
  );

  if (!aliases.length) {
    return { payload, changes: [], warnings: [] };
  }

  const aliasesByTable = new Map<string, DirectModelRefColumnAlias[]>();
  for (const alias of aliases) {
    const existing = aliasesByTable.get(alias.tableName) ?? [];
    existing.push(alias);
    aliasesByTable.set(alias.tableName, existing);
  }

  const changesByColumn = new Map<string, ModelRefArchiveColumnChange>();
  let changed = false;

  const tables = payload.tables.map((table) => {
    const tableAliases = aliasesByTable.get(table.name) ?? [];
    if (!tableAliases.length) return table;

    let tableChanged = false;
    const normalizedRows = table.rows.map((row) => {
      let nextRow = row;

      for (const alias of tableAliases) {
        if (!isUnambiguousLegacyAlias(alias, allAliases)) continue;
        if (hasOwn(row, alias.canonicalDbName) && row[alias.canonicalDbName] != null) {
          continue;
        }
        if (!hasOwn(row, alias.legacyDbName) || row[alias.legacyDbName] == null) {
          continue;
        }

        if (nextRow === row) {
          nextRow = { ...row };
        }
        nextRow[alias.canonicalDbName] = row[alias.legacyDbName];
        changed = true;
        tableChanged = true;

        const changeKey = `${table.name}:${alias.legacyDbName}:${alias.canonicalDbName}`;
        const current = changesByColumn.get(changeKey);
        if (current) {
          current.rowCount += 1;
        } else {
          changesByColumn.set(changeKey, {
            tableName: table.name,
            propertyName: alias.propertyName,
            modelName: alias.modelName,
            legacyDbName: alias.legacyDbName,
            canonicalDbName: alias.canonicalDbName,
            rowCount: 1,
          });
        }
      }

      return nextRow;
    });

    return tableChanged ? { ...table, rows: normalizedRows } : table;
  });

  return {
    payload: changed ? { ...payload, tables } : payload,
    changes: Array.from(changesByColumn.values()),
    warnings: buildAmbiguityWarnings(aliases, allAliases, payload),
  };
}
