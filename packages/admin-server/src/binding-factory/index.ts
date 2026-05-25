/**
 * Binding Factory
 *
 * Creates admin server bindings with configurable adapters.
 */

// Types
export type {
  ContentEngine,
  ContentEngineFactory,
  SchemaStoreAdapter,
  SchemaPushAdapter,
  BackupRow,
  BackupStoreAdapter,
  DataTransferAdapter,
  UploadsTransferAdapter,
  TriggerStoreAdapter,
  ApiKeyAuthAdapter,
  AdminServerBindingDeps,
  LimitsChecker,
  LimitsCheckResult,
} from "./types";

// Utilities
export {
  measureJsonBytes,
  getMonthKey,
  formatMonthLabel,
  isRecord,
  countDescriptorFields,
  countDescriptorEntries,
  toServerBackupRecord,
  computeChecksum,
} from "./utils";

// Main factory
export { createAdminServerBinding } from "../binding-factory";
