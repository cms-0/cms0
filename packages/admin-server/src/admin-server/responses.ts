/**
 * Admin Server Response Creators
 *
 * Functions that create API responses for various endpoints.
 */

import type {
  AdminServerOverviewResponse,
  AdminHealthResponse,
  AdminContextResponse,
  SchemaTypescriptResponse,
  AdminServerTarget,
} from "@cms0/admin-contract";
import { resolveBinding } from "./config";
import { summarizeSnapshot } from "./utils";
import { stableDescriptorStringify } from "../schema-descriptor-hash";

export async function createOverviewResponse(
  target: AdminServerTarget,
): Promise<AdminServerOverviewResponse> {
  const binding = await resolveBinding(target);
  const snapshot = await binding.getLatestSchemaSnapshot(target);

  return {
    ok: true,
    routes: {
      apiKeys: "/api-keys",
      backupArchive: "/backups/{backupId}/file",
      backupDescriptor: "/backups/{backupId}/descriptor",
      backupRestore: "/backups/{backupId}/restore",
      backups: "/backups",
      backupTypescript: "/backups/{backupId}/typescript",
      content: "/content/{...path}",
      context: "/context",
      dataTransferExport: "/data-transfer/export",
      dataTransferImport: "/data-transfer/import",
      dataTransferPreflight: "/data-transfer/import/preflight",
      health: "/health",
      latestSnapshot: "/schema/latestSnapshot",
      latestTypescript: "/schema/typescript/latest",
      manualTriggerRun: "/triggers/{triggerId}/run",
      manualTriggerRuns: "/triggers/runs",
      manualTriggers: "/triggers",
      publishSchema: "/schema",
      usage: "/usage",
      uploadsExport: "/uploads/export",
      uploadsImport: "/uploads/import",
      uploadsPreflight: "/uploads/import/preflight",
    },
    snapshot: summarizeSnapshot(snapshot),
    target,
  };
}

export async function createHealthResponse(
  target: AdminServerTarget,
): Promise<AdminHealthResponse> {
  const binding = await resolveBinding(target);
  const snapshot = await binding.getLatestSchemaSnapshot(target);
  return {
    descriptorVersion: snapshot?.version ?? target.descriptorVersion,
    environmentKey: target.environmentKey,
    ok: true,
    server: "cms0-admin-server",
  };
}

export async function createContextResponse(
  target: AdminServerTarget,
): Promise<AdminContextResponse> {
  const binding = await resolveBinding(target);
  return {
    ok: true,
    snapshot: await binding.getLatestSchemaSnapshot(target),
    target,
  };
}

export async function createSchemaTypescript(
  target: AdminServerTarget,
): Promise<SchemaTypescriptResponse> {
  const binding = await resolveBinding(target);
  const snapshot = await binding.getLatestSchemaSnapshot(target);

  return {
    code: snapshot
      ? `export const descriptorVersion = ${JSON.stringify(snapshot.version)} as const;\nexport const descriptorChecksum = ${JSON.stringify(snapshot.checksum)} as const;\n\nexport const descriptor = ${stableDescriptorStringify(snapshot.descriptor)} as const;\n`
      : "",
    ok: true,
    snapshot: snapshot
      ? {
          checksum: snapshot.checksum,
          version: snapshot.version,
        }
      : null,
  };
}
