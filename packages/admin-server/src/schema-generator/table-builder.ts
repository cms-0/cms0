/**
 * Schema Generator Table Builder
 */

import { camelCase, snakeCase } from "lodash";
import type { ModelDescriptor } from "@cms0/shared";
import type {
  ForeignKeySpec,
  InternalTableSpec,
  TableBuilderState,
  TableRefColumnSpec,
} from "./types";
import {
  resolveUniquePgTableName,
  resolveUniquePgColumnName,
  resolveUniquePgForeignKeyName,
} from "./utils";

export function createTableBuilder(state: TableBuilderState) {
  const { tableMap, tableNameOwner, pathNameMap, nameCounts, tables } = state;

  const registerModelNameAlias = (
    modelNameToExport: Map<string, string>,
    alias: string,
    exportName: string,
  ) => {
    if (!alias) return;
    if (!modelNameToExport.has(alias)) {
      modelNameToExport.set(alias, exportName);
    }
  };

  const reserveName = (pathSegments: string[], explicitBase?: string) => {
    const key = pathSegments.join(".");
    const cached = pathNameMap.get(key);
    if (cached) return cached;
    const base = explicitBase ?? camelCase(pathSegments.join(" "));
    const count = nameCounts[base] ?? 0;
    nameCounts[base] = count + 1;
    const name = count === 0 ? base : `${base}${count + 1}`;
    pathNameMap.set(key, name);
    return name;
  };

  const addColumn = (
    table: InternalTableSpec,
    line: string,
    key?: string,
    dbName?: string,
    ownerKey?: string,
  ) => {
    if (key && table.columnNames.has(key)) return false;
    if (dbName) {
      const owner = table.columnDbNameOwners.get(dbName);
      const expectedOwner = ownerKey ?? key ?? dbName;
      if (owner && owner !== expectedOwner) return false;
      table.columnDbNameOwners.set(dbName, expectedOwner);
    }
    table.columns.push(line);
    if (key) table.columnNames.add(key);
    return true;
  };

  const getTable = (pathSegments: string[], explicitBase?: string) => {
    const exportName = reserveName(pathSegments, explicitBase);
    const existing = tableMap.get(exportName);
    if (existing) return existing;
    const tableName = resolveUniquePgTableName(exportName, tableNameOwner);
    const spec: InternalTableSpec = {
      exportName,
      tableName,
      columns: [],
      columnNames: new Set<string>(),
      columnDbNameOwners: new Map<string, string>(),
      foreignKeys: [],
      foreignKeyNames: new Set<string>(),
    };
    addColumn(
      spec,
      `  id: uuid("id").defaultRandom().primaryKey().notNull(),`,
      "id",
      "id",
    );
    tableMap.set(exportName, spec);
    tableNameOwner.set(tableName, exportName);
    tables.push(spec);
    return spec;
  };

  const getTableByExportName = (exportName: string) => {
    return tableMap.get(exportName) ?? null;
  };

  const addForeignKey = (
    table: InternalTableSpec,
    columnName: string,
    targetTable: InternalTableSpec,
    targetColumnName: string,
    opts?: {
      onDelete?: ForeignKeySpec["onDelete"];
      onUpdate?: ForeignKeySpec["onUpdate"];
    },
  ) => {
    const fkName = resolveUniquePgForeignKeyName(
      table,
      `${table.tableName}_${columnName}_fkey`,
    );
    if (table.foreignKeyNames.has(fkName)) return;
    table.foreignKeyNames.add(fkName);
    table.foreignKeys.push({
      name: fkName,
      columnName,
      targetTableExportName: targetTable.exportName,
      targetColumnName,
      onDelete: opts?.onDelete,
      onUpdate: opts?.onUpdate,
    });
  };

  const addParentRef = (
    table: InternalTableSpec,
    parent: InternalTableSpec,
    opts?: { unique?: boolean },
  ) => {
    const colName = `${parent.exportName}Id`;
    const colDbName = resolveUniquePgColumnName(
      table,
      snakeCase(colName),
      colName,
    );
    const uniqueConstraint = opts?.unique ? ".unique()" : "";
    addColumn(
      table,
      `  ${colName}: uuid("${colDbName}").notNull()${uniqueConstraint},`,
      colName,
      colDbName,
      colName,
    );
    addForeignKey(table, colName, parent, "id", {
      onDelete: "cascade",
      onUpdate: "cascade",
    });
  };

  const addOrderIndex = (table: InternalTableSpec) => {
    const colDbName = resolveUniquePgColumnName(
      table,
      "order_index",
      "orderIndex",
    );
    addColumn(
      table,
      `  orderIndex: integer("${colDbName}"),`,
      "orderIndex",
      colDbName,
      "orderIndex",
    );
  };

  const addTableRefColumn = (
    table: InternalTableSpec,
    colName: string,
    target: InternalTableSpec,
    opts?: { notNull?: boolean },
  ): TableRefColumnSpec => {
    const key = `${colName}Id`;
    const colDbName = resolveUniquePgColumnName(table, snakeCase(key), key);
    const notNull = opts?.notNull ?? false;
    const notNullConstraint = notNull ? ".notNull()" : "";
    const added = addColumn(
      table,
      `  ${key}: uuid("${colDbName}")${notNullConstraint},`,
      key,
      colDbName,
      key,
    );
    if (added) {
      addForeignKey(table, key, target, "id");
    }
    return { key, dbName: colDbName, added };
  };

  const buildModelTable = (
    modelName: string,
    modelDesc: ModelDescriptor,
    modelNameToExport: Map<string, string>,
  ) => {
    const table = getTable([modelName], camelCase(modelName));
    registerModelNameAlias(modelNameToExport, modelName, table.exportName);
    registerModelNameAlias(
      modelNameToExport,
      camelCase(modelName),
      table.exportName,
    );
    registerModelNameAlias(
      modelNameToExport,
      snakeCase(modelName),
      table.exportName,
    );
    registerModelNameAlias(
      modelNameToExport,
      modelName.toLowerCase(),
      table.exportName,
    );
    addOrderIndex(table);
    // Fields are processed by the field processor
    return table;
  };

  return {
    getTable,
    getTableByExportName,
    addColumn,
    addForeignKey,
    addParentRef,
    addOrderIndex,
    addTableRefColumn,
    buildModelTable,
    reserveName,
  };
}

export type TableBuilder = ReturnType<typeof createTableBuilder>;
