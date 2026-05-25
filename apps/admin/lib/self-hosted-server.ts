import type {
  AdminServerBinding,
  AdminServerUsageSummary,
} from "@cms0/admin-server";
import type {
  AdminRequestInput,
  AdminResponse,
  SchemaPublishInput,
  SchemaPublishResponse,
} from "@cms0/admin-contract";
import { createSelfHostedAdminBinding } from "./binding-adapters";

const SELF_HOSTED_ENV_KEY = "self-hosted";
let bindingCache: AdminServerBinding | null = null;

function getBinding(): AdminServerBinding {
  if (!bindingCache) {
    bindingCache = createSelfHostedAdminBinding(SELF_HOSTED_ENV_KEY);
  }
  return bindingCache;
}

export const resetSelfHostedContentEngineCache = () => {
  bindingCache = null;
};

export const warmSelfHostedContentEngine = async () => {
  await getBinding().getLatestSchemaSnapshot({
    environmentKey: SELF_HOSTED_ENV_KEY,
  });
};

export const recordSelfHostedServerUsage = async (input: {
  request: AdminRequestInput;
  response: AdminResponse;
}) => {
  const binding = getBinding();
  if (binding.recordRequestUsage) {
    await binding.recordRequestUsage({
      request: input.request,
      response: input.response,
      target: { environmentKey: SELF_HOSTED_ENV_KEY },
    });
  }
};

export const getSelfHostedServerUsageSummary =
  async (): Promise<AdminServerUsageSummary> => {
    return getBinding().getUsageSummary({
      environmentKey: SELF_HOSTED_ENV_KEY,
    });
  };

export const publishSelfHostedSchema = async (
  input: SchemaPublishInput,
): Promise<SchemaPublishResponse> => {
  return getBinding().publishSchema(
    { environmentKey: SELF_HOSTED_ENV_KEY },
    input,
  );
};

export const selfHostedServerBinding: AdminServerBinding = {
  getLatestSchemaSnapshot: (target) =>
    getBinding().getLatestSchemaSnapshot(target),
  publishSchema: (target, input) => getBinding().publishSchema(target, input),
  readGraphValue: (input) => getBinding().readGraphValue(input),
  mutateGraphValue: (input) => getBinding().mutateGraphValue(input),
  readContentValue: (input) => getBinding().readContentValue(input),
  createContentEntry: (input) => getBinding().createContentEntry(input),
  updateContentEntry: (input) => getBinding().updateContentEntry(input),
  deleteContentEntry: (input) => getBinding().deleteContentEntry(input),
  patchContentSingleton: (input) => getBinding().patchContentSingleton(input),
  replaceContentSingleton: (input) =>
    getBinding().replaceContentSingleton(input),
  listBackups: (target) => getBinding().listBackups(target),
  createBackup: (target, input) => getBinding().createBackup(target, input),
  deleteBackup: (target, backupId) =>
    getBinding().deleteBackup(target, backupId),
  getBackup: (target, backupId) => getBinding().getBackup(target, backupId),
  getBackupArchive: (target, backupId) =>
    getBinding().getBackupArchive(target, backupId),
  getBackupDescriptor: (target, backupId) =>
    getBinding().getBackupDescriptor(target, backupId),
  getBackupTypescript: (target, backupId) =>
    getBinding().getBackupTypescript(target, backupId),
  restoreBackup: (target, backupId) =>
    getBinding().restoreBackup(target, backupId),
  exportDataTransferArchive: (target) =>
    getBinding().exportDataTransferArchive(target),
  exportUploadsArchive: (target) => getBinding().exportUploadsArchive(target),
  getUploadAsset: (target, input) => getBinding().getUploadAsset(target, input),
  preflightDataTransferImport: (target, input) =>
    getBinding().preflightDataTransferImport(target, input),
  preflightUploadsImport: (target, input) =>
    getBinding().preflightUploadsImport(target, input),
  importDataTransferArchive: (target, input) =>
    getBinding().importDataTransferArchive(target, input),
  importUploadsArchive: (target, input) =>
    getBinding().importUploadsArchive(target, input),
  listManualTriggers: (target) => getBinding().listManualTriggers(target),
  createManualTrigger: (target, input) =>
    getBinding().createManualTrigger(target, input),
  updateManualTrigger: (target, triggerId, input) =>
    getBinding().updateManualTrigger(target, triggerId, input),
  deleteManualTrigger: (target, triggerId) =>
    getBinding().deleteManualTrigger(target, triggerId),
  listManualTriggerRuns: (target, triggerId) =>
    getBinding().listManualTriggerRuns(target, triggerId),
  runManualTrigger: (target, triggerId, context) =>
    getBinding().runManualTrigger(target, triggerId, context),
  createApiKey: (target, input, context) =>
    getBinding().createApiKey(target, input, context),
  updateApiKey: (target, keyId, input, context) =>
    getBinding().updateApiKey(target, keyId, input, context),
  revokeApiKey: (target, keyId, context) =>
    getBinding().revokeApiKey(target, keyId, context),
  listApiKeys: (target, context) => getBinding().listApiKeys(target, context),
  getUsageSummary: (target) => getBinding().getUsageSummary(target),
  recordRequestUsage: (input) => getBinding().recordRequestUsage?.(input),
};
