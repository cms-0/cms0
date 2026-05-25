/**
 * Admin Server Types
 */

import type {
  AdminApiKeyCreateInput,
  AdminApiKeyCreateResponse,
  AdminApiKeyRecord,
  AdminApiKeyUpdateInput,
  AdminContentResponse,
  DataTransferExportArchive,
  DataTransferImportResponse,
  DataTransferPreflightResponse,
  AdminErrorCode,
  AdminErrorResponse,
  AdminRequestInput,
  AdminResponse,
  AdminServerTarget,
  AdminUsageMetrics,
  AdminUsageSurface,
  AdminUsageSummary,
  ManualTriggerExecutionResponse,
  ManualTriggerInput,
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
  SchemaPublishInput,
  SchemaPublishResponse,
  ServerBackupArchive,
  ServerBackupCreateInput,
  ServerBackupRecord,
  UploadsTransferExportArchive,
  UploadsTransferImportResponse,
  UploadsTransferPreflightResponse,
} from "@cms0/admin-contract";
import type { AssetKind, ParsedGraphQueryOptions } from "@cms0/shared";

type MaybePromise<T> = Promise<T> | T;

export type AdminServerUsageMetrics = AdminUsageMetrics;
export type AdminServerUsageSurface = AdminUsageSurface;
export type AdminServerUsageSummary = AdminUsageSummary;

export type AdminServerBinding = {
  checkLimits?: (
    request: AdminRequestInput,
  ) => MaybePromise<AdminResponse<AdminErrorResponse> | null>;
  createApiKey: (
    target: AdminServerTarget,
    input: AdminApiKeyCreateInput,
    context?: { headers: Headers },
  ) => MaybePromise<AdminApiKeyCreateResponse>;
  createBackup: (
    target: AdminServerTarget,
    input?: ServerBackupCreateInput,
  ) => MaybePromise<ServerBackupRecord | null>;
  createContentEntry: (input: {
    descriptor: SchemaDescriptor;
    path: string;
    target: AdminServerTarget;
    value: unknown;
  }) => MaybePromise<unknown>;
  createManualTrigger: (
    target: AdminServerTarget,
    input: ManualTriggerInput,
  ) => MaybePromise<ManualTriggerRecord>;
  deleteBackup: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<void>;
  exportDataTransferArchive: (
    target: AdminServerTarget,
  ) => MaybePromise<DataTransferExportArchive>;
  exportUploadsArchive: (
    target: AdminServerTarget,
  ) => MaybePromise<UploadsTransferExportArchive>;
  getUploadAsset: (
    target: AdminServerTarget,
    input: {
      filename: string;
      kind: AssetKind;
    },
  ) => MaybePromise<{
    data: Buffer;
  } | null>;
  deleteContentEntry: (input: {
    entryId: string;
    path: string;
    target: AdminServerTarget;
  }) => MaybePromise<void>;
  deleteManualTrigger: (
    target: AdminServerTarget,
    triggerId: string,
  ) => MaybePromise<void>;
  getBackup: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<ServerBackupArchive | null>;
  getBackupArchive: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<{
    checksum: string;
    data: Buffer;
    fileName: string;
    sizeBytes: number;
  } | null>;
  getBackupDescriptor: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<SchemaDescriptor | null>;
  getBackupTypescript: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<string | null>;
  getLatestSchemaSnapshot: (
    target: AdminServerTarget,
  ) => MaybePromise<SchemaDescriptorSnapshot | null>;
  getUsageSummary: (
    target: AdminServerTarget,
  ) => MaybePromise<AdminServerUsageSummary>;
  importDataTransferArchive: (
    target: AdminServerTarget,
    input: {
      archive: Uint8Array;
      reason?: string;
      skipMissingTables?: boolean;
    },
  ) => MaybePromise<DataTransferImportResponse>;
  importUploadsArchive: (
    target: AdminServerTarget,
    input: {
      archive: Uint8Array;
    },
  ) => MaybePromise<UploadsTransferImportResponse>;
  listApiKeys: (
    target: AdminServerTarget,
    context?: { headers: Headers },
  ) => MaybePromise<AdminApiKeyRecord[]>;
  listBackups: (
    target: AdminServerTarget,
  ) => MaybePromise<ServerBackupRecord[]>;
  listManualTriggerRuns: (
    target: AdminServerTarget,
    triggerId?: string,
  ) => MaybePromise<ManualTriggerRunRecord[]>;
  listManualTriggers: (
    target: AdminServerTarget,
  ) => MaybePromise<ManualTriggerRecord[]>;
  publishSchema: (
    target: AdminServerTarget,
    input: SchemaPublishInput,
  ) => MaybePromise<SchemaPublishResponse>;
  preflightDataTransferImport: (
    target: AdminServerTarget,
    input: {
      archive: Uint8Array;
      skipMissingTables?: boolean;
    },
  ) => MaybePromise<DataTransferPreflightResponse>;
  preflightUploadsImport: (
    target: AdminServerTarget,
    input: {
      archive: Uint8Array;
    },
  ) => MaybePromise<UploadsTransferPreflightResponse>;
  readContentValue: (input: {
    descriptor: SchemaDescriptor;
    kind: AdminContentResponse["resource"]["kind"];
    options?: {
      expand?: string[];
      expandArrays?: string[];
      expandObjects?: string[];
      locale?: string;
    };
    path: string;
    target: AdminServerTarget;
  }) => MaybePromise<AdminContentResponse["value"]>;
  readGraphValue: (input: {
    path: string;
    target: AdminServerTarget;
    options?: ParsedGraphQueryOptions;
  }) => MaybePromise<unknown>;
  mutateGraphValue: (input: {
    path: string;
    target: AdminServerTarget;
    ops: import("../graph-mutation-engine").GraphMutationOp[];
    /** When set, targets a single item inside a collection by its UUID. */
    itemId?: string;
  }) => MaybePromise<unknown>;
  patchContentSingleton: (input: {
    path: string;
    target: AdminServerTarget;
    value: unknown;
  }) => MaybePromise<void>;
  recordRequestUsage?: (input: {
    request: AdminRequestInput;
    response: AdminResponse;
    target: AdminServerTarget;
  }) => MaybePromise<void>;
  replaceContentSingleton: (input: {
    descriptor: SchemaDescriptor;
    path: string;
    target: AdminServerTarget;
    value: unknown;
  }) => MaybePromise<void>;
  restoreBackup: (
    target: AdminServerTarget,
    backupId: string,
  ) => MaybePromise<ServerBackupArchive | null>;
  runManualTrigger: (
    target: AdminServerTarget,
    triggerId: string,
    context?: Record<string, unknown>,
  ) => MaybePromise<ManualTriggerExecutionResponse | null>;
  updateContentEntry: (input: {
    descriptor: SchemaDescriptor;
    entryId: string;
    path: string;
    target: AdminServerTarget;
    value: unknown;
  }) => MaybePromise<void>;
  updateApiKey: (
    target: AdminServerTarget,
    keyId: string,
    input: AdminApiKeyUpdateInput,
    context?: { headers: Headers },
  ) => MaybePromise<AdminApiKeyRecord | null>;
  updateManualTrigger: (
    target: AdminServerTarget,
    triggerId: string,
    input: ManualTriggerInput,
  ) => MaybePromise<ManualTriggerRecord | null>;
  revokeApiKey: (
    target: AdminServerTarget,
    keyId: string,
    context?: { headers: Headers },
  ) => MaybePromise<AdminApiKeyRecord | null>;
};

export type AdminServerConfig = {
  authorizeRequest?: (input: {
    request: AdminRequestInput;
    route: string;
    target: AdminServerTarget;
  }) => MaybePromise<AdminResponse | null>;
  resolveBinding: (
    target: AdminServerTarget,
  ) => MaybePromise<AdminServerBinding>;
};

export type { AdminRequestInput, AdminResponse, AdminServerTarget };
