/**
 * Schema Generator Types
 */

import type { FieldDescriptor, FullDescriptor } from "@cms0/shared";

export type ForeignKeySpec = {
  name: string;
  columnName: string;
  targetTableExportName: string;
  targetColumnName: string;
  onDelete?: "cascade" | "restrict" | "no action" | "set null" | "set default";
  onUpdate?: "cascade" | "restrict" | "no action" | "set null" | "set default";
};

export type InternalTableSpec = {
  exportName: string;
  tableName: string;
  columns: string[];
  columnNames: Set<string>;
  columnDbNameOwners: Map<string, string>;
  foreignKeys: ForeignKeySpec[];
  foreignKeyNames: Set<string>;
};

export type TableRefColumnSpec = {
  key: string;
  dbName: string;
  added: boolean;
};

export type DirectModelRefColumnAlias = {
  tableExportName: string;
  tableName: string;
  propertyName: string;
  modelName: string;
  canonicalKey: string;
  canonicalDbName: string;
  legacyKey: string;
  legacyDbName: string;
};

export type GeneratedSchemaResult = {
  content: string;
  exportNames: string[];
  tableNames: string[];
  warnings: string[];
  modelRefColumnAliases: DirectModelRefColumnAlias[];
};

export type TableBuilderState = {
  descriptor: FullDescriptor;
  tables: InternalTableSpec[];
  tableMap: Map<string, InternalTableSpec>;
  tableNameOwner: Map<string, string>;
  pathNameMap: Map<string, string>;
  nameCounts: Record<string, number>;
  modelNameToExport: Map<string, string>;
  modelRefColumnAliases: DirectModelRefColumnAlias[];
  warnings: Set<string>;
  parts: string[];
};
