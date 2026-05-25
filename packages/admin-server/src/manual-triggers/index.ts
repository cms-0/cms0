/**
 * Manual Triggers
 *
 * Database operations for manual triggers and trigger runs.
 */

export type {
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerInput,
  ManualTriggerContext,
  ManualTriggerTarget,
  ManualTriggerScopeType,
  TriggerRow,
  TriggerRunRow,
} from "./types";

export {
  normalizeStringRecord,
  normalizeTarget,
  normalizeScopeType,
  normalizeTriggerRow,
  normalizeTriggerRunRow,
  isMissingTableError,
} from "./utils";

export {
  listManualTriggers,
  getManualTriggerById,
  createManualTrigger,
  updateManualTrigger,
  deleteManualTrigger,
  createManualTriggerRun,
  updateManualTriggerRun,
  getManualTriggerRunById,
  listManualTriggerRuns,
} from "./operations";
