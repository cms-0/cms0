/**
 * Schema Backup
 *
 * Database backup and restore operations.
 */

export type {
  SchemaBackupSummary,
  BackupPayload,
  SchemaBackupRow,
} from "./types";
export { BACKUP_FORMAT_VERSION } from "./types";

export {
  computeSha256,
  encodePayload,
  decodePayload,
  normalizeRow,
  quoteIdent,
} from "./utils";

export {
  listPublicTables,
  listPublicForeignKeyDependencies,
  orderTablesByDependencies,
  collectAllTableRows,
  resolveDescriptorForBackup,
  enforceRetention,
  getRetentionLimit,
} from "./database";

export {
  listSchemaBackups,
  getSchemaBackupRow,
  getSchemaBackupDescriptor,
  getSchemaBackupArchive,
  createSchemaBackup,
  deleteSchemaBackup,
  exportDatabaseArchive,
  restoreDatabaseArchiveBuffer,
  restoreSchemaBackupData,
  importDatabaseArchiveBuffer,
} from "./operations";

export {
  normalizeModelRefArchivePayload,
  type ModelRefArchiveColumnChange,
  type ModelRefArchiveNormalizationResult,
} from "./model-ref-column-normalizer";
