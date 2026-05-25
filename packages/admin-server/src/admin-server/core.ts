/**
 * Admin Server Core
 *
 * Main entry points for creating and configuring the admin server.
 */

import type {
  AdminApiKeyCreateInput,
  AdminApiKeyUpdateInput,
  AdminUsageSurface,
  ManualTriggerInput,
  SchemaPublishInput,
  ServerBackupCreateInput,
  AdminRequestInput,
} from "@cms0/admin-contract";
import type { ParsedGraphQueryOptions } from "@cms0/shared";
import type { AdminServerTarget, AdminServerConfig } from "./types";
import {
  normalizeServerTarget,
  resolveBinding,
  runEnvironmentOperationExclusive,
  configureAdminServer as setConfig,
  getAdminServerConfig as getConfig,
} from "./config";
import { createContentResponse } from "./content";
import { handleAdminRequest } from "./router";

// Re-export config functions
export { setConfig as configureAdminServer, getConfig as getAdminServerConfig };

// Create a server target from input
export function createAdminServerTarget(input: {
  descriptorVersion?: string;
  environmentKey: string;
  organizationId?: string;
  surface?: AdminUsageSurface;
}): AdminServerTarget {
  return normalizeServerTarget(input);
}

// Publish a schema descriptor
export async function publishSchemaDescriptor(
  target: AdminServerTarget,
  input: SchemaPublishInput,
) {
  const binding = await resolveBinding(target);
  return runEnvironmentOperationExclusive(target.environmentKey, () =>
    Promise.resolve(binding.publishSchema(target, input)),
  );
}

// Create an admin server instance for a target environment
export function createAdminServer(input: string | AdminServerTarget) {
  const target = normalizeServerTarget(input);

  return {
    createApiKey: (
      input: AdminApiKeyCreateInput,
      context?: { headers: Headers },
    ) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.createApiKey(target, input, context),
      ),
    createBackup: (input?: ServerBackupCreateInput) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.createBackup(target, input),
      ),
    createManualTrigger: (input: ManualTriggerInput) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.createManualTrigger(target, input),
      ),
    deleteBackup: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.deleteBackup(target, backupId),
      ),
    deleteManualTrigger: (triggerId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.deleteManualTrigger(target, triggerId),
      ),
    getBackup: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getBackup(target, backupId),
      ),
    getBackupArchive: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getBackupArchive(target, backupId),
      ),
    getBackupDescriptor: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getBackupDescriptor(target, backupId),
      ),
    getBackupTypescript: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getBackupTypescript(target, backupId),
      ),
    getContentResource: (
      path: string | string[],
      query?: {
        page?: number;
        pageSize?: number;
        search?: string;
        expand?: string[];
        expandArrays?: string[];
        expandObjects?: string[];
      },
    ) =>
      createContentResponse(
        target,
        Array.isArray(path) ? path.join("/") : path,
        query,
      ),
    getGraphValue: (
      path: string,
      options?: ParsedGraphQueryOptions,
    ) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.readGraphValue({ path, target, options }),
      ),
    mutateGraphValue: (
      path: string,
      ops: import("../graph-mutation-engine").GraphMutationOp[],
    ) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.mutateGraphValue({ path, target, ops }),
      ),
    getLatestSchemaSnapshot: () =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getLatestSchemaSnapshot(target),
      ),
    getUsageSummary: () =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.getUsageSummary(target),
      ),
    handleRequest: (request: AdminRequestInput) =>
      handleAdminRequest(target, request),
    importDataTransferArchive: (input: {
      archive: Uint8Array;
      reason?: string;
      skipMissingTables?: boolean;
    }) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.importDataTransferArchive(target, input),
      ),
    importUploadsArchive: (input: { archive: Uint8Array }) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.importUploadsArchive(target, input),
      ),
    listApiKeys: (context?: { headers: Headers }) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.listApiKeys(target, context),
      ),
    listBackups: () =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.listBackups(target),
      ),
    listManualTriggerRuns: (triggerId?: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.listManualTriggerRuns(target, triggerId),
      ),
    listManualTriggers: () =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.listManualTriggers(target),
      ),
    publishSchema: (input: SchemaPublishInput) =>
      publishSchemaDescriptor(target, input),
    restoreBackup: (backupId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        runEnvironmentOperationExclusive(target.environmentKey, () =>
          Promise.resolve(binding.restoreBackup(target, backupId)),
        ),
      ),
    revokeApiKey: (keyId: string, context?: { headers: Headers }) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.revokeApiKey(target, keyId, context),
      ),
    runManualTrigger: (triggerId: string) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.runManualTrigger(target, triggerId),
      ),
    updateApiKey: (
      keyId: string,
      input: AdminApiKeyUpdateInput,
      context?: { headers: Headers },
    ) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.updateApiKey(target, keyId, input, context),
      ),
    target,
    updateManualTrigger: (triggerId: string, input: ManualTriggerInput) =>
      Promise.resolve(resolveBinding(target)).then((binding) =>
        binding.updateManualTrigger(target, triggerId, input),
      ),
  };
}
