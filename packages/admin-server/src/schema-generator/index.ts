/**
 * Schema Generator
 *
 * Generates Drizzle ORM table definitions from content descriptors.
 */

export type {
  ForeignKeySpec,
  InternalTableSpec,
  TableRefColumnSpec,
  DirectModelRefColumnAlias,
  GeneratedSchemaResult,
  TableBuilderState,
} from "./types";

export {
  PG_IDENTIFIER_MAX_LENGTH,
  PRIMITIVE_DESCRIPTOR_TYPES,
  resolveScalarDescriptorType,
  toPgIdentifier,
  toHashedPgTableName,
  resolveUniquePgTableName,
  resolveUniquePgColumnName,
} from "./utils";

export { createTableBuilder } from "./table-builder";
export type { TableBuilder } from "./table-builder";

export { createFieldProcessor } from "./field-processor";

export {
  generateContentTables,
  collectDirectModelRefColumnAliases,
  generateRuntimeSchemaCode,
  generateEsmSchemaCode,
} from "./generator";
