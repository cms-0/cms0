export type AdminRequestMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type AdminUsageSurface = "control" | "public";

export type AdminServerTarget = {
  environmentKey: string;
  descriptorVersion?: string;
  organizationId?: string;
  surface?: AdminUsageSurface;
};

export type AdminRuntimeTarget = AdminServerTarget;

export type AdminRequestInput = {
  method: AdminRequestMethod;
  segments: string[];
  headers: Headers;
  searchParams: URLSearchParams;
  body?: unknown;
};

export type SchemaDescriptor = Record<string, unknown>;

export type SchemaDescriptorSnapshot = {
  version: string;
  checksum: string;
  descriptor: SchemaDescriptor;
  publishedAt: string;
};

export type AdminContentResourceKind =
  | "array"
  | "object"
  | "primitive"
  | "modelRef";

export type AdminContentField = {
  descriptor: SchemaDescriptor;
  name: string;
  required: boolean;
  type: string;
};

export type AdminContentResource = {
  apiPath: string;
  descriptor: SchemaDescriptor;
  displayName: string;
  editorDescriptor: SchemaDescriptor;
  fields: AdminContentField[];
  kind: AdminContentResourceKind;
  segments: string[];
};

export type AdminContentEntry = Record<string, unknown> & {
  createdAt: string;
  id: string;
  updatedAt: string;
};

export type AdminContentResponse = {
  ok: true;
  resource: AdminContentResource;
  value: AdminContentEntry[] | unknown;
  mutation?: {
    entryId?: string;
    entryIds?: string[];
    operation: "create" | "delete" | "replace" | "update";
  };
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
};

export type AdminContentMutationInput = {
  value: unknown;
};

export type AdminServerOverviewResponse = {
  ok: true;
  target: AdminServerTarget;
  snapshot: Pick<
    SchemaDescriptorSnapshot,
    "version" | "checksum" | "publishedAt"
  > | null;
  routes: {
    apiKeys: string;
    health: string;
    context: string;
    latestSnapshot: string;
    latestTypescript: string;
    publishSchema: string;
    usage: string;
    content: string;
    backups: string;
    backupRestore: string;
    backupDescriptor: string;
    backupTypescript: string;
    backupArchive: string;
    manualTriggers: string;
    manualTriggerRuns: string;
    manualTriggerRun: string;
    dataTransferExport: string;
    dataTransferImport: string;
    dataTransferPreflight: string;
    uploadsExport: string;
    uploadsImport: string;
    uploadsPreflight: string;
  };
};

export type AdminRuntimeOverviewResponse = AdminServerOverviewResponse;

export type AdminHealthResponse = {
  ok: true;
  server: "cms0-admin-server";
  environmentKey: string;
  descriptorVersion?: string;
};

export type AdminContextResponse = {
  ok: true;
  target: AdminServerTarget;
  snapshot: SchemaDescriptorSnapshot | null;
};

export type AdminUsageMetrics = {
  apiCalls: number;
  bytesIn: number;
  bytesOut: number;
  contentReads: number;
  contentWrites: number;
  lastMutationAt: string | null;
  lastRequestAt: string | null;
  readCalls: number;
  schemaPublishes: number;
  writeCalls: number;
};

export type AdminUsageSummary = {
  content: {
    collectionCount: number;
    collectionEntryCount: number;
    fileBytes: number;
    singletonCount: number;
  };
  environmentKey: string;
  month: {
    controlMetrics: AdminUsageMetrics;
    key: string;
    label: string;
    metrics: AdminUsageMetrics;
    publicMetrics: AdminUsageMetrics;
    totalMetrics: AdminUsageMetrics;
  };
  schema: {
    descriptorBytes: number;
    fieldCount: number;
    modelCount: number;
    publishedAt: string | null;
    rootCount: number;
    version: string | null;
  };
  storage: {
    contentStoreBytes: number;
    schemaSnapshotBytes: number;
    totalBytes: number;
  };
};

export type AdminUsageSummaryResponse = {
  ok: true;
  summary: AdminUsageSummary;
};

export type SchemaLatestSnapshotResponse = {
  ok: true;
  snapshot: SchemaDescriptorSnapshot | null;
};

export type SchemaTypescriptResponse = {
  ok: true;
  code: string;
  snapshot: Pick<SchemaDescriptorSnapshot, "version" | "checksum"> | null;
};

export type SchemaPublishInput = {
  descriptor: SchemaDescriptor;
  version?: string;
};

export type SchemaPublishMigrationSource = "publish" | "restore";

export type SchemaPublishMigration = {
  adapter: string;
  appliedAt: string;
  createdTables: string[];
  descriptorChecksum: string;
  descriptorVersion: string;
  existingTables: string[];
  fieldCount: number;
  modelCount: number;
  publicationId: string;
  resourceCount: number;
  retiredResources: string[];
  rootCount: number;
  source: SchemaPublishMigrationSource;
};

export type SchemaPublishResponse = {
  ok: true;
  changed: boolean;
  migration: SchemaPublishMigration | null;
  snapshot: SchemaDescriptorSnapshot;
};

export type AdminMutationSuccessResponse = {
  ok: true;
};

export type AdminApiKeyScope = "descriptor-admin" | "read-only" | "read-write";

export type AdminApiKeyPermissionMap = Record<string, string[]>;

export type AdminApiKeyMetadata = {
  environmentKey?: string;
  notes?: string;
  organizationId?: string;
};

export type AdminApiKeyRecord = {
  createdAt: string;
  description: string;
  enabled: boolean;
  expiresAt: string | null;
  id: string;
  lastUsedAt: string | null;
  metadata?: AdminApiKeyMetadata;
  name: string;
  permissions: string[];
  permissionsByResource: AdminApiKeyPermissionMap;
  prefix: string;
  rateLimitEnabled?: boolean;
  rateLimitMax?: number | null;
  rateLimitTimeWindow?: number | null;
  revokedAt?: string | null;
  scope: AdminApiKeyScope;
  start?: string | null;
  status: "active" | "disabled" | "expired" | "expiring" | "revoked";
  updatedAt?: string;
};

export type AdminApiKeyCreateInput = {
  expiresInDays?: string;
  name: string;
  notes?: string;
  permissions?: AdminApiKeyPermissionMap;
  prefix?: string;
  rateLimitEnabled?: boolean;
  rateLimitMax?: number;
  rateLimitTimeWindow?: number;
  scope?: AdminApiKeyScope;
};

export type AdminApiKeyUpdateInput = {
  enabled?: boolean;
  expiresInDays?: string;
  name: string;
  notes?: string;
  permissions?: AdminApiKeyPermissionMap;
  scope?: AdminApiKeyScope;
};

export type AdminApiKeyCreateResponse = {
  key: AdminApiKeyRecord;
  secret: string;
  viewPath: string;
};

export type DataTransferPreflightResponse = {
  archiveType: "json-snapshot" | "pg-dump";
  canImportBestEffort: boolean;
  canImportStrict: boolean;
  compatibilityWarnings: string[];
  missingTables: string[];
  ok: true;
  tableCount: number;
};

export type DataTransferImportResponse = {
  importedBackupId: string;
  ok: true;
  restoredTables: string[];
  safetyBackupId: string;
  skippedMissingTables: boolean;
  skippedTables: string[];
};

export type DataTransferExportArchive = {
  checksum: string;
  data: Uint8Array;
  fileName: string;
  sizeBytes: number;
};

export type UploadsTransferSummary = {
  conflicts: string[];
  excluded: string[];
  fileCount: number;
  toCreate: number;
  toReplace: number;
  toSkipConflict: number;
  toSkipExcluded: number;
  totalBytes: number;
};

export type UploadsTransferPreflightResponse = UploadsTransferSummary & {
  ok: true;
};

export type UploadsTransferImportResponse = UploadsTransferSummary & {
  created: string[];
  ok: true;
  replaced: string[];
  skippedConflict: string[];
  skippedExcluded: string[];
};

export type UploadsTransferExportArchive = {
  checksum: string;
  data: Uint8Array;
  fileCount: number;
  fileName: string;
  sizeBytes: number;
};

export type ServerBackupRecord = {
  createdAt: string;
  description: string;
  fromChecksum: string | null;
  fromVersion: string | null;
  id: string;
  reason: string;
  restoredAt: string | null;
  rowCounts: Record<string, number>;
  sizeBytes: number;
  status: "archived" | "ready";
  tableCount: number;
  toChecksum: string | null;
  toVersion: string | null;
};

export type RuntimeBackupRecord = ServerBackupRecord;

export type ServerBackupArchive = ServerBackupRecord & {
  payload: Record<string, unknown>;
  snapshot: SchemaDescriptorSnapshot | null;
};

export type RuntimeBackupArchive = ServerBackupArchive;

export type ServerBackupCreateInput = {
  description?: string;
  reason?: string;
};

export type RuntimeBackupCreateInput = ServerBackupCreateInput;

export type ManualTriggerScopeType = "global" | "root" | "model";
export type ManualTriggerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ManualTriggerTarget = "editor" | "canvas" | "both";

export type ManualTriggerRecord = {
  attempts: number | null;
  backoffMs: number | null;
  bodyTemplate: string | null;
  buttonLabel: string;
  createdAt: string;
  enabled: boolean;
  extraWaitMs: number | null;
  headersJson: Record<string, string> | null;
  id: string;
  method: ManualTriggerMethod;
  name: string;
  queryParamsJson: Record<string, string> | null;
  scopeName: string | null;
  scopeType: ManualTriggerScopeType;
  successMessage: string | null;
  target: ManualTriggerTarget;
  timeoutMs: number | null;
  updatedAt: string;
  url: string;
};

export type ManualTriggerRunRecord = {
  createdAt: string;
  errorMessage: string | null;
  finishedAt: string | null;
  id: string;
  responseStatus: number | null;
  status: "error" | "success";
  triggerId: string;
};

export type ManualTriggerInput = Omit<
  ManualTriggerRecord,
  "createdAt" | "id" | "updatedAt"
>;

export type ManualTriggerRunContext = {
  pathname?: string | null;
  resourceId?: string | null;
  resourceName?: string | null;
  resourcePath?: string | null;
  resourceType?: Exclude<ManualTriggerScopeType, "global"> | null;
  [key: string]: unknown;
};

export type ManualTriggerRunInput = {
  context?: ManualTriggerRunContext;
};

export type ManualTriggerExecutionResponse = {
  ok: true;
  run: ManualTriggerRunRecord;
  trigger: ManualTriggerRecord;
};

export type ManualTriggerRunsQuery = {
  limit?: number;
  triggerId?: string;
};

export type ParseManualTriggerInputResult =
  | {
      ok: false;
      error: string;
    }
  | {
      ok: true;
      value: ManualTriggerInput;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const readBoolean = (value: unknown) => value !== false;

const readStringRecord = (value: unknown) => {
  if (!isRecord(value)) {
    return null;
  }

  const entries = Object.entries(value)
    .filter(([key]) => key.trim().length > 0)
    .map(([key, item]) => [key.trim(), String(item)] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : null;
};

const readManualTriggerScopeType = (value: unknown): ManualTriggerScopeType =>
  value === "root" || value === "model" ? value : "global";

const readManualTriggerMethod = (value: unknown): ManualTriggerMethod => {
  if (
    value === "DELETE" ||
    value === "GET" ||
    value === "PATCH" ||
    value === "PUT"
  ) {
    return value;
  }

  return "POST";
};

const readManualTriggerTarget = (value: unknown): ManualTriggerTarget =>
  value === "canvas" || value === "both" ? value : "editor";

export const parseManualTriggerInput = (
  value: unknown,
): ParseManualTriggerInputResult => {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Trigger payload must be a JSON object.",
    };
  }

  const name = readString(value.name);
  const buttonLabel = readString(value.buttonLabel) || name;
  const scopeType = readManualTriggerScopeType(value.scopeType);
  const scopeName = readString(value.scopeName);
  const url = readString(value.url);

  if (name.length < 2) {
    return {
      ok: false,
      error: "Trigger name must be at least 2 characters.",
    };
  }

  if (!url) {
    return {
      ok: false,
      error: "Trigger URL is required.",
    };
  }

  try {
    new URL(url);
  } catch {
    return {
      ok: false,
      error: "Trigger URL must be a valid absolute URL.",
    };
  }

  if (scopeType !== "global" && scopeName.length < 1) {
    return {
      ok: false,
      error: "Scope name is required for root and model triggers.",
    };
  }

  return {
    ok: true,
    value: {
      attempts: readNullableNumber(value.attempts),
      backoffMs: readNullableNumber(value.backoffMs),
      bodyTemplate: readString(value.bodyTemplate) || null,
      buttonLabel,
      enabled: readBoolean(value.enabled),
      extraWaitMs: readNullableNumber(value.extraWaitMs),
      headersJson: readStringRecord(value.headersJson),
      method: readManualTriggerMethod(value.method),
      name,
      queryParamsJson: readStringRecord(value.queryParamsJson),
      scopeName: scopeType === "global" ? null : scopeName,
      scopeType,
      successMessage: readString(value.successMessage) || null,
      target: readManualTriggerTarget(value.target),
      timeoutMs: readNullableNumber(value.timeoutMs),
      url,
    },
  };
};

export type AdminErrorCode =
  | "invalid_request"
  | "method_not_allowed"
  | "not_found"
  | "limit_exceeded";

export type AdminErrorResponse = {
  ok: false;
  code: AdminErrorCode;
  message: string;
  route: string;
};

export type AdminResponse<TBody = unknown> = {
  status: number;
  headers?: Record<string, string>;
  body: TBody;
};
