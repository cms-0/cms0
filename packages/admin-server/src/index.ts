/**
 * Admin Server
 *
 * Centralized admin server for managing CMS content, schemas, backups, and more.
 */

// Core Admin Server Types and Functions
export type {
  AdminServerBinding,
  AdminServerConfig,
  AdminServerTarget,
  AdminServerUsageMetrics,
  AdminServerUsageSummary,
} from "./admin-server/types";

export {
  configureAdminServer,
  getAdminServerConfig,
  createAdminServerTarget,
  createAdminServer,
  handleUploadAssetRequest,
  handleAdminRequest,
  publishSchemaDescriptor,
} from "./admin-server";

// Auth Policy
export {
  resolveAdminServerApiKeyPermissions,
  resolveAdminServerPolicyAction,
  resolveAdminServerSessionPermissionCheck,
} from "./auth-policy";

// Schema Descriptor Hash
export {
  checksumDescriptor,
  stableDescriptorStringify,
} from "./schema-descriptor-hash";

// Content Resource
export { resolveContentResource } from "./content-resource";

// Graph Mutation Engine
export {
  applyGraphMutations,
  parseGraphMutationInput,
  type GraphMutationInput,
  type GraphMutationOp,
} from "./graph-mutation-engine";

// Usage Tracker
export {
  createDbUsageTracker,
  type UsageTracker,
  type UsageTrackerMonth,
} from "./usage-tracker";

// Storage Driver
export {
  createLocalStorageDriver,
  createScopedStorageDriver,
  createS3StorageDriver,
  createRuntimeAssetStore,
  resolveStorageDriver,
  type RuntimeAssetStore,
  type StorageDriverAdapter,
  type StorageFileInfo,
  type S3StorageConfig,
} from "./storage-driver";

// Uploads Transfer
export { createUploadsTransferAdapter } from "./uploads-transfer";
export type { UploadsTransferAdapter } from "./uploads-transfer";

// Route Generation
export { buildResources } from "./route-gen/resource-builder";
export { buildCollectionHandlers } from "./route-gen/collection-handlers";
export { buildSingletonHandlers } from "./route-gen/singleton-handlers";
export { buildResourceSchemas } from "./route-gen/schema-builder";
export type { Resource, ResourceSchemas, TableSpec } from "./route-gen/types";

// Schema Generator
export {
  generateContentTables,
  generateRuntimeSchemaCode,
  generateEsmSchemaCode,
} from "./schema-generator";

export type {
  ForeignKeySpec,
  InternalTableSpec,
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

export {
  createTableBuilder,
  type TableBuilder,
} from "./schema-generator/table-builder";
export { createFieldProcessor } from "./schema-generator/field-processor";

// Schema Store
export {
  loadLatestSchemaSnapshotRecord,
  saveSchemaSnapshot,
  loadAppliedSchemaChecksum,
  type SchemaSnapshotRecord,
} from "./schema-store";

// Schema Backup
export {
  listSchemaBackups,
  getSchemaBackupRow,
  getSchemaBackupDescriptor,
  getSchemaBackupArchive,
  createSchemaBackup,
  deleteSchemaBackup,
  exportDatabaseArchive,
  importDatabaseArchiveBuffer,
  restoreSchemaBackupData,
  BACKUP_FORMAT_VERSION,
} from "./schema-backup";

export type {
  SchemaBackupSummary,
  BackupPayload,
  SchemaBackupRow,
} from "./schema-backup/types";

// Manual Triggers
export {
  listManualTriggers,
  getManualTriggerById,
  createManualTrigger,
  updateManualTrigger,
  deleteManualTrigger,
  createManualTriggerRun,
  updateManualTriggerRun,
  listManualTriggerRuns,
  getManualTriggerRunById,
} from "./manual-triggers";

export type {
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerInput,
  ManualTriggerContext,
  ManualTriggerTarget,
  ManualTriggerScopeType,
} from "./manual-triggers/types";

// Manual Triggers Core
export {
  MANUAL_TRIGGER_SCOPE_TYPES,
  MANUAL_TRIGGER_TARGETS,
  MANUAL_TRIGGER_METHODS,
  parseStringRecord,
  normalizeManualTriggerInput,
  matchesManualTriggerScope,
  renderTemplate,
  buildTemplateContext,
} from "./manual-triggers-core";

export type {
  ManualTriggerMethod,
  ManualTriggerInput as CoreManualTriggerInput,
} from "./manual-triggers-core";

// Manual Triggers Runner
export {
  runManualTrigger,
  detectSemanticFailureFromBody,
  type ManualTriggerExecutionPayload,
  type ManualTriggerStoreCallbacks,
} from "./manual-triggers-runner";

// Next.js Helpers
export {
  CORS_HEADERS,
  addCorsHeaders,
  readBody,
  toHttpResponse,
  handleCorsPreflight,
  createContentHandler,
  type NextRequest,
  type RequestBody,
  type ServerResult,
  type ContentServer,
  type ContentHandlerConfig,
} from "./nextjs-helpers";

// Binding Factory
export {
  createAdminServerBinding,
  type ContentEngine,
  type ContentEngineFactory,
  type SchemaStoreAdapter,
  type SchemaPushAdapter,
  type BackupStoreAdapter,
  type BackupRow,
  type DataTransferAdapter,
  type TriggerStoreAdapter,
  type ApiKeyAuthAdapter,
  type AdminServerBindingDeps,
  type LimitsChecker,
  type LimitsCheckResult,
} from "./binding-factory";

// Adapters
export {
  createSelfHostedAdapters,
  createSchemaStoreAdapter,
  createApiKeyAuthAdapter,
  createBackupStoreAdapter,
  createContentEngineFactory,
  createTriggerStoreAdapter,
  createSchemaPushAdapter,
  createDataTransferAdapter,
  type AdapterConfig,
  type SelfHostedConfig,
} from "./adapters";
