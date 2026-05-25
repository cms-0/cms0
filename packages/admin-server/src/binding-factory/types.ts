/**
 * Binding Factory Types
 *
 * All adapter interfaces and type definitions for the admin server binding factory.
 */

import type {
  AdminRequestInput,
  AdminServerTarget,
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
  SchemaPublishInput,
  ServerBackupRecord,
  DataTransferExportArchive,
  DataTransferPreflightResponse,
  DataTransferImportResponse,
  UploadsTransferExportArchive,
  UploadsTransferPreflightResponse,
  UploadsTransferImportResponse,
  ManualTriggerRecord,
  ManualTriggerInput,
  ManualTriggerRunRecord,
  ManualTriggerExecutionResponse,
  AdminApiKeyCreateInput,
  AdminApiKeyUpdateInput,
  AdminApiKeyRecord,
  AdminApiKeyCreateResponse,
} from "@cms0/admin-contract";
import type { FullDescriptor } from "@cms0/shared";
import type { UsageTracker } from "../usage-tracker";
import type { RuntimeAssetStore } from "../storage-driver";

/** Content engine with handlers for collections and singletons */
export type ContentEngine = {
  checksum: string | null;
  collectionHandlers: Map<string, any>;
  singletonHandlers: Map<string, any>;
  resourceMap: Map<string, any>;
  snapshot: SchemaDescriptorSnapshot | null;
};

/** Factory for building content engines */
export type ContentEngineFactory = {
  buildEmpty(): ContentEngine;
  buildFromSnapshot(snapshot: SchemaDescriptorSnapshot): Promise<ContentEngine>;
};

/** Adapter for schema snapshot storage and retrieval */
export type SchemaStoreAdapter = {
  loadLatestSnapshot(): Promise<SchemaDescriptorSnapshot | null>;
  saveSnapshot(descriptor: SchemaDescriptor, version: string): Promise<void>;
  loadAppliedChecksum(): Promise<string | null>;
};

/** Adapter for applying schema changes */
export type SchemaPushAdapter = {
  push(descriptor: FullDescriptor): Promise<void>;
};

/** Backup row data structure */
export type BackupRow = {
  id: string;
  reason: string;
  status: string;
  fromVersion: string | null;
  toVersion: string | null;
  fromChecksum: string | null;
  toChecksum: string | null;
  descriptor: SchemaDescriptor;
  rowCounts: Record<string, number>;
  tableCount: number;
  sizeBytes: number;
  createdAt: string;
  restoredAt: string | null;
};

/** Adapter for backup operations */
export type BackupStoreAdapter = {
  list(limit?: number): Promise<BackupRow[]>;
  create(input: {
    descriptor: FullDescriptor;
    fromChecksum: string | null;
    fromVersion: string | null;
    reason: string;
    toChecksum: string;
    toVersion: string;
  }): Promise<BackupRow>;
  delete(backupId: string): Promise<void>;
  getRow(backupId: string): Promise<BackupRow | null>;
  getDescriptor(backupId: string): Promise<SchemaDescriptor | null>;
  getArchive(backupId: string): Promise<{
    data: Buffer;
    fileName: string;
    checksum: string;
    sizeBytes: number;
  } | null>;
  restore(backupId: string): Promise<void>;
};

/** Adapter for data export/import operations */
export type DataTransferAdapter = {
  export(): Promise<DataTransferExportArchive>;
  preflight(archive: Uint8Array): Promise<DataTransferPreflightResponse>;
  import(input: {
    archive: Uint8Array;
    reason?: string;
    skipMissingTables?: boolean;
  }): Promise<DataTransferImportResponse>;
};

/** Adapter for uploads transfer operations */
export type UploadsTransferAdapter = {
  export(): Promise<UploadsTransferExportArchive>;
  preflight(archive: Buffer): Promise<UploadsTransferPreflightResponse>;
  import(archive: Buffer): Promise<UploadsTransferImportResponse>;
};

/** Adapter for manual trigger operations */
export type TriggerStoreAdapter = {
  list(): Promise<ManualTriggerRecord[]>;
  create(input: ManualTriggerInput): Promise<ManualTriggerRecord>;
  update(
    triggerId: string,
    input: ManualTriggerInput,
  ): Promise<ManualTriggerRecord | null>;
  delete(triggerId: string): Promise<void>;
  getById(triggerId: string): Promise<ManualTriggerRecord | null>;
  listRuns(
    limit?: number,
    triggerId?: string,
  ): Promise<ManualTriggerRunRecord[]>;
  getRunById(runId: string): Promise<ManualTriggerRunRecord | null>;
  createRun(input: {
    triggerId: string;
    status: string;
    initiatedBy: string | null;
    resourceContext: Record<string, unknown> | null;
  }): Promise<ManualTriggerRunRecord>;
  updateRun(runId: string, input: Record<string, unknown>): Promise<void>;
  execute(
    trigger: ManualTriggerRecord,
    context: Record<string, unknown> | null,
  ): Promise<{
    success: boolean;
    responseStatus: number | null;
    responseBodyPreview: string | null;
    error: string | null;
    durationMs: number;
  }>;
};

/** Adapter for API key authentication */
export type ApiKeyAuthContext = {
  organizationId?: string | null;
};

export type ApiKeyAuthAdapter = {
  create(
    headers: Headers,
    input: AdminApiKeyCreateInput,
    environmentKey: string,
    context?: ApiKeyAuthContext,
  ): Promise<AdminApiKeyCreateResponse>;
  update(
    headers: Headers,
    keyId: string,
    input: AdminApiKeyUpdateInput,
    environmentKey: string,
    context?: ApiKeyAuthContext,
  ): Promise<AdminApiKeyRecord | null>;
  revoke(
    headers: Headers,
    keyId: string,
    environmentKey: string,
    context?: ApiKeyAuthContext,
  ): Promise<AdminApiKeyRecord | null>;
  list(
    headers: Headers,
    environmentKey: string,
    context?: ApiKeyAuthContext,
  ): Promise<AdminApiKeyRecord[]>;
};

/** Limits check result */
export type LimitsCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: string;
      exceeded: { apiCalls?: boolean; bandwidth?: boolean; storage?: boolean };
    };

/** Limits checker for enforcing usage limits */
export type LimitsChecker = {
  check(request: AdminRequestInput): Promise<LimitsCheckResult>;
};

/** Dependencies required to create an admin server binding */
export type AdminServerBindingDeps = {
  environmentKey: string;
  contentEngineFactory: ContentEngineFactory;
  schemaStore: SchemaStoreAdapter;
  schemaPush: SchemaPushAdapter;
  backupStore: BackupStoreAdapter;
  dataTransfer: DataTransferAdapter;
  uploadsTransfer: UploadsTransferAdapter;
  triggerStore: TriggerStoreAdapter;
  apiKeyAuth: ApiKeyAuthAdapter;
  usageTracker: UsageTracker;
  assetStore?: RuntimeAssetStore;
  limitsChecker?: LimitsChecker; // optional - omitted = unlimited (self-hosted)
};
