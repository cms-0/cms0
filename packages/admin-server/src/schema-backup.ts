/**
 * Schema Backup Barrel File
 */

export type {
  SchemaBackupSummary,
  BackupPayload,
  SchemaBackupRow,
} from "./schema-backup/types";
export { BACKUP_FORMAT_VERSION } from "./schema-backup/types";

export {
  computeSha256,
  encodePayload,
  decodePayload,
  normalizeRow,
  quoteIdent,
} from "./schema-backup/utils";

export {
  listPublicTables,
  collectAllTableRows,
  resolveDescriptorForBackup,
  enforceRetention,
  getRetentionLimit,
} from "./schema-backup/database";

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
} from "./schema-backup/operations";

export {
  normalizeModelRefArchivePayload,
  type ModelRefArchiveColumnChange,
  type ModelRefArchiveNormalizationResult,
} from "./schema-backup/model-ref-column-normalizer";
