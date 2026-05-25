/**
 * Admin Server
 *
 * Modular admin server implementation.
 */

// Types
export type {
  AdminServerBinding,
  AdminServerConfig,
  AdminServerTarget,
  AdminServerUsageMetrics,
  AdminServerUsageSummary,
} from "./types";

// Configuration
export {
  configureAdminServer,
  getAdminServerConfig,
  normalizeServerTarget,
  resolveBinding,
  runEnvironmentOperationExclusive,
} from "./config";

// Utilities
export {
  isRecord,
  buildRoute,
  summarizeSnapshot,
  createErrorResponse,
  methodNotAllowed,
  notFound,
  invalidRequest,
  sanitizeDownloadBasename,
  decodePathSegment,
} from "./utils";

// Parsers
export {
  readSchemaPublishInput,
  readBackupCreateInput,
  readManualTriggerRunsQuery,
  readContentMutationInput,
  readApiKeyCreateInput,
  readApiKeyUpdateInput,
  parseListQueryParam,
  readArchiveImportInput,
  readManualTriggerScopeType,
  deriveManualTriggerContextFromPath,
  readManualTriggerRunContext,
} from "./parsers";

// Responses
export {
  createOverviewResponse,
  createHealthResponse,
  createContextResponse,
  createSchemaTypescript,
} from "./responses";

// Content
export { createContentResponse } from "./content";

// Router
export { handleAdminRequest } from "./router";

// Core
export {
  createAdminServer,
  createAdminServerTarget,
  publishSchemaDescriptor,
} from "./core";

// Handlers
export { handleSchemaRequest } from "./handlers/schema";
export { handleContentRequest } from "./handlers/content";
export { handleGraphRequest } from "./handlers/graph";
export { handleBackupsRequest } from "./handlers/backups";
export { handleTriggersRequest } from "./handlers/triggers";
export { handleApiKeysRequest } from "./handlers/api-keys";
export { handleDataTransferRequest } from "./handlers/data-transfer";
export {
  handleUploadAssetRequest,
  handleUploadsRequest,
} from "./handlers/uploads";
