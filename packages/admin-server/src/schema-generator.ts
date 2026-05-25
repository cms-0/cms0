/**
 * Schema Generator Barrel File
 */

export type {
  ForeignKeySpec,
  InternalTableSpec,
  TableRefColumnSpec,
  DirectModelRefColumnAlias,
  GeneratedSchemaResult,
  TableBuilderState,
} from "./schema-generator/types";

export {
  PG_IDENTIFIER_MAX_LENGTH,
  PRIMITIVE_DESCRIPTOR_TYPES,
  resolveScalarDescriptorType,
  toPgIdentifier,
  toHashedPgTableName,
  resolveUniquePgTableName,
  resolveUniquePgColumnName,
} from "./schema-generator/utils";

export { createTableBuilder } from "./schema-generator/table-builder";
export type { TableBuilder } from "./schema-generator/table-builder";

export { createFieldProcessor } from "./schema-generator/field-processor";

export {
  generateContentTables,
  collectDirectModelRefColumnAliases,
  generateRuntimeSchemaCode,
  generateEsmSchemaCode,
} from "./schema-generator/generator";
