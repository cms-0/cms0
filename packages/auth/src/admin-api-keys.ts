type AdminApiKeyScope = "descriptor-admin" | "read-only" | "read-write";

type AdminApiKeyPermissionMap = Record<string, string[]>;

type AdminApiKeyMetadata = {
  environmentKey?: string;
  notes?: string;
  organizationId?: string;
};

type AdminApiKeyRecord = {
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

type AdminApiKeyCreateInput = {
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

type AdminApiKeyUpdateInput = {
  enabled?: boolean;
  expiresInDays?: string;
  name: string;
  notes?: string;
  permissions?: AdminApiKeyPermissionMap;
  scope?: AdminApiKeyScope;
};

type AdminApiKeyCreateResponse = {
  key: AdminApiKeyRecord;
  secret: string;
  viewPath: string;
};

type BetterAuthApiKeyRecord = {
  configId?: string | null;
  createdAt: Date | string;
  enabled: boolean;
  expiresAt: Date | string | null;
  id: string;
  lastRequest: Date | string | null;
  metadata?: unknown;
  name: string | null;
  permissions?: Record<string, string[]> | null;
  prefix: string | null;
  rateLimitEnabled?: boolean | null;
  rateLimitMax?: number | null;
  rateLimitTimeWindow?: number | null;
  referenceId?: string | null;
  start?: string | null;
  updatedAt: Date | string;
};

type BetterAuthSession = {
  session?: {
    activeOrganizationId?: string | null;
  };
  user?: {
    id?: string | null;
  };
};

type BetterAuthCreateApi = {
  createApiKey: (input: {
    body: {
      expiresIn: number | null;
      metadata: AdminApiKeyMetadata;
      name: string;
      configId?: string;
      organizationId?: string;
      userId?: string;
      permissions: Record<string, string[]>;
      prefix?: string;
      rateLimitEnabled?: boolean;
      rateLimitMax?: number;
      rateLimitTimeWindow?: number;
    };
  }) => Promise<unknown>;
};

type BetterAuthDeleteApi = {
  deleteApiKey: (input: {
    body: {
      configId?: string;
      keyId: string;
    };
    headers: Headers;
  }) => Promise<unknown>;
};

type BetterAuthSessionApi = {
  getSession: (input: { headers: Headers }) => Promise<BetterAuthSession | null>;
};

type BetterAuthPermissionApi = {
  hasPermission: (input: {
    body: {
      organizationId?: string;
      permissions: Record<string, string[]>;
    };
    headers: Headers;
  }) => Promise<{ success?: boolean } | null>;
};

type BetterAuthListApi = {
  listApiKeys: (input: {
    headers: Headers;
    query?: {
      configId?: string;
      organizationId?: string;
    };
  }) => Promise<unknown>;
};

type BetterAuthUpdateApi = {
  updateApiKey: (input: {
    body: {
      configId?: string;
      enabled?: boolean;
      expiresIn: number | null;
      keyId: string;
      metadata: AdminApiKeyMetadata;
      name: string;
      permissions: Record<string, string[]>;
      userId?: string;
    };
  }) => Promise<unknown>;
};

type BetterAuthVerifyApi = {
  verifyApiKey: (input: {
    body: {
      configId?: string;
      key: string;
      permissions: Record<string, string[]>;
    };
  }) => Promise<{ key: unknown; valid: boolean } | null>;
};

type BetterAuthForLifecycle = {
  api: BetterAuthSessionApi &
    BetterAuthListApi &
    BetterAuthCreateApi &
    BetterAuthUpdateApi &
    BetterAuthDeleteApi;
};

type BetterAuthForVerify = {
  api: BetterAuthVerifyApi;
};

type ActiveAuthContext = {
  organizationId: string;
  userId: string;
};

type OrganizationApiKeyContextOptions = {
  organizationId?: string | null;
};

const DEFAULT_ENVIRONMENT_KEY = "self-hosted";
const DEFAULT_API_KEY_CONFIG_ID = "default";

const scopePermissions: Record<AdminApiKeyScope, Record<string, string[]>> = {
  "descriptor-admin": {
    descriptorSchema: ["create", "read", "update", "delete"],
    externalTriggers: ["create", "read", "update", "delete", "execute"],
    generatedModels: ["create", "read", "update", "delete"],
  },
  "read-only": {
    descriptorSchema: ["read"],
    generatedModels: ["read"],
  },
  "read-write": {
    descriptorSchema: ["read"],
    externalTriggers: ["read", "execute"],
    generatedModels: ["create", "read", "update", "delete"],
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const readBoolean = (value: unknown) =>
  typeof value === "boolean" ? value : undefined;

const readNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const toIsoString = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
};

const readExpiresInSeconds = (value: unknown) => {
  const expiresInDays = Number(readString(value));
  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0) {
    return null;
  }

  return Math.round(expiresInDays * 24 * 60 * 60);
};

const computeApiKeyStatus = (
  key: Pick<AdminApiKeyRecord, "enabled" | "expiresAt" | "revokedAt" | "status">,
): AdminApiKeyRecord["status"] => {
  if (key.status === "revoked" || key.revokedAt) {
    return "revoked";
  }

  if (!key.enabled) {
    return "disabled";
  }

  if (!key.expiresAt) {
    return "active";
  }

  const expiresAt = Date.parse(key.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return "active";
  }

  if (expiresAt <= Date.now()) {
    return "expired";
  }

  const sevenDaysFromNow = Date.now() + 7 * 24 * 60 * 60 * 1000;
  return expiresAt <= sevenDaysFromNow ? "expiring" : "active";
};

const normalizePermissionMap = (
  permissions: Record<string, string[]> | null | undefined,
): AdminApiKeyPermissionMap => {
  if (!permissions) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(permissions).map(([resource, actions]) => [
      resource,
      Array.from(
        new Set(actions.filter((entry) => typeof entry === "string")),
      ),
    ]),
  );
};

const flattenPermissions = (
  permissions: Record<string, string[]> | null | undefined,
) => {
  const values = Object.values(normalizePermissionMap(permissions)).flat();
  return Array.from(new Set(values.filter((entry) => typeof entry === "string")));
};

const resolveScopeFromPermissions = (
  permissions: Record<string, string[]> | null | undefined,
): AdminApiKeyScope => {
  const normalized = JSON.stringify(permissions ?? {});
  if (normalized === JSON.stringify(scopePermissions["descriptor-admin"])) {
    return "descriptor-admin";
  }

  if (normalized === JSON.stringify(scopePermissions["read-write"])) {
    return "read-write";
  }

  return "read-only";
};

const parseMetadata = (value: unknown): AdminApiKeyMetadata => {
  if (!isRecord(value)) {
    return {};
  }

  return {
    environmentKey: readString(value.environmentKey) || undefined,
    notes: readString(value.notes) || undefined,
    organizationId: readString(value.organizationId) || undefined,
  };
};

const readListedApiKeys = (value: unknown): BetterAuthApiKeyRecord[] => {
  if (Array.isArray(value)) {
    return value as BetterAuthApiKeyRecord[];
  }

  if (!isRecord(value)) {
    return [];
  }

  const nested = value.apiKeys;
  return Array.isArray(nested) ? (nested as BetterAuthApiKeyRecord[]) : [];
};

const toAdminApiKeyRecord = (input: BetterAuthApiKeyRecord): AdminApiKeyRecord => {
  const metadata = parseMetadata(input.metadata);
  const permissionMap = normalizePermissionMap(input.permissions);
  const base: AdminApiKeyRecord = {
    createdAt: toIsoString(input.createdAt) ?? new Date().toISOString(),
    description: metadata.notes ?? "",
    enabled: input.enabled,
    expiresAt: toIsoString(input.expiresAt),
    id: input.id,
    lastUsedAt: toIsoString(input.lastRequest),
    metadata,
    name: input.name ?? "Untitled key",
    permissions: flattenPermissions(permissionMap),
    permissionsByResource: permissionMap,
    prefix: input.prefix ?? "",
    rateLimitEnabled: readBoolean(input.rateLimitEnabled),
    rateLimitMax: readNumber(input.rateLimitMax) ?? null,
    rateLimitTimeWindow: readNumber(input.rateLimitTimeWindow) ?? null,
    start: input.start ?? null,
    scope: resolveScopeFromPermissions(input.permissions),
    status: "active",
    updatedAt: toIsoString(input.updatedAt) ?? undefined,
  };

  return {
    ...base,
    status: computeApiKeyStatus(base),
  };
};

const requireAuthContext = async (
  auth: { api: BetterAuthSessionApi },
  headers: Headers,
  options?: OrganizationApiKeyContextOptions,
): Promise<ActiveAuthContext> => {
  const session = await auth.api.getSession({ headers });
  const userId = readString(session?.user?.id);
  const organizationId =
    readString(options?.organizationId) ||
    readString(session?.session?.activeOrganizationId);

  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!organizationId) {
    throw new Error("No active organization.");
  }

  return {
    organizationId,
    userId,
  };
};

const isScopedToOrganization = (
  key: BetterAuthApiKeyRecord,
  context: ActiveAuthContext,
  environmentKey: string,
) => {
  const metadata = parseMetadata(key.metadata);
  const referenceId = readString(key.referenceId);
  return (
    (metadata.organizationId === context.organizationId ||
      referenceId === context.organizationId) &&
    (metadata.environmentKey ?? DEFAULT_ENVIRONMENT_KEY) === environmentKey
  );
};

export const readApiKeyFromHeaders = (headers: Headers) => {
  const direct = headers.get("x-api-key")?.trim();
  if (direct) {
    return direct;
  }

  const authorization = headers.get("authorization")?.trim();
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
};

export const apiKeyPermissionsToStatements = (permissions: string[]) =>
  permissions.reduce<Record<string, string[]>>((statementSet, permission) => {
    if (permission === "content:read") {
      statementSet.generatedModels = ["read"];
    } else if (permission === "content:write") {
      statementSet.generatedModels = ["create", "read", "update", "delete"];
    } else if (permission === "schema:read") {
      statementSet.descriptorSchema = ["read"];
    } else {
      statementSet.descriptorSchema = ["create", "read", "update", "delete"];
    }
    return statementSet;
  }, {});

export const verifyOrganizationApiKey = async (
  auth: BetterAuthForVerify,
  apiKey: string,
  permissions: Record<string, string[]>,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
) => {
  const verification = await auth.api.verifyApiKey({
    body: {
      configId: DEFAULT_API_KEY_CONFIG_ID,
      key: apiKey,
      permissions,
    },
  });

  if (!verification?.valid || !verification.key) {
    return null;
  }

  const key = verification.key as BetterAuthApiKeyRecord;
  const metadata = parseMetadata(key.metadata);
  if ((metadata.environmentKey ?? DEFAULT_ENVIRONMENT_KEY) !== environmentKey) {
    return null;
  }

  if (!metadata.organizationId) {
    return null;
  }

  return {
    key,
    metadata,
  };
};

const resolveRequestedPermissions = (
  input:
    | Pick<AdminApiKeyCreateInput, "permissions" | "scope">
    | Pick<AdminApiKeyUpdateInput, "permissions" | "scope">,
): AdminApiKeyPermissionMap => {
  const explicitPermissions = normalizePermissionMap(input.permissions);
  if (Object.keys(explicitPermissions).length > 0) {
    return explicitPermissions;
  }

  const scope = readString(input.scope) as AdminApiKeyScope;
  const scopedPermissions = scope ? scopePermissions[scope] : undefined;
  if (scopedPermissions) {
    return scopedPermissions;
  }

  return scopePermissions["read-only"];
};

export const getOrganizationApiKeyAccess = async (
  auth: { api: BetterAuthSessionApi & BetterAuthPermissionApi },
  headers: Headers,
  options?: OrganizationApiKeyContextOptions,
) => {
  const context = await requireAuthContext(auth, headers, options);

  const check = async (action: "create" | "read" | "update" | "delete") => {
    try {
      const result = await auth.api.hasPermission({
        body: {
          organizationId: context.organizationId,
          permissions: {
            apiKey: [action],
          },
        },
        headers,
      });
      return Boolean(result?.success);
    } catch {
      return false;
    }
  };

  const [canCreate, canRead, canUpdate, canDelete] = await Promise.all([
    check("create"),
    check("read"),
    check("update"),
    check("delete"),
  ]);

  return {
    canCreate,
    canDelete,
    canRead,
    canUpdate,
  };
};

export const listOrganizationApiKeys = async (
  auth: BetterAuthForLifecycle,
  headers: Headers,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
  options?: OrganizationApiKeyContextOptions,
): Promise<AdminApiKeyRecord[]> => {
  const context = await requireAuthContext(auth, headers, options);
  const response = await auth.api.listApiKeys({
    headers,
    query: {
      configId: DEFAULT_API_KEY_CONFIG_ID,
      organizationId: context.organizationId,
    },
  });
  const keys = readListedApiKeys(response);

  return keys
    .filter((key) => isScopedToOrganization(key, context, environmentKey))
    .map(toAdminApiKeyRecord)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
};

export const getOrganizationApiKey = async (
  auth: BetterAuthForLifecycle,
  headers: Headers,
  keyId: string,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
  options?: OrganizationApiKeyContextOptions,
): Promise<AdminApiKeyRecord | null> => {
  const keys = await listOrganizationApiKeys(
    auth,
    headers,
    environmentKey,
    options,
  );
  return keys.find((key) => key.id === keyId) ?? null;
};

export const createOrganizationApiKey = async (
  auth: BetterAuthForLifecycle,
  headers: Headers,
  input: AdminApiKeyCreateInput,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
  options?: OrganizationApiKeyContextOptions,
): Promise<AdminApiKeyCreateResponse> => {
  const context = await requireAuthContext(auth, headers, options);
  const name = readString(input.name);
  if (name.length < 2) {
    throw new Error("Key name must be at least 2 characters.");
  }
  const selectedPermissions = resolveRequestedPermissions(input);

  const metadata: AdminApiKeyMetadata = {
    environmentKey,
    notes: readString(input.notes),
    organizationId: context.organizationId,
  };

  const created = (await auth.api.createApiKey({
    body: {
      configId: DEFAULT_API_KEY_CONFIG_ID,
      expiresIn: readExpiresInSeconds(input.expiresInDays),
      metadata,
      name,
      organizationId: context.organizationId,
      permissions: selectedPermissions,
      prefix: readString(input.prefix) || undefined,
      rateLimitEnabled: input.rateLimitEnabled === true,
      rateLimitMax: readNumber(input.rateLimitMax),
      rateLimitTimeWindow: readNumber(input.rateLimitTimeWindow),
      userId: context.userId,
    },
  })) as BetterAuthApiKeyRecord & { key: string };

  const record = toAdminApiKeyRecord(created);
  return {
    key: record,
    secret: created.key,
    viewPath: `/settings/api-keys/${record.id}`,
  };
};

export const updateOrganizationApiKey = async (
  auth: BetterAuthForLifecycle,
  headers: Headers,
  keyId: string,
  input: AdminApiKeyUpdateInput,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
  options?: OrganizationApiKeyContextOptions,
): Promise<AdminApiKeyRecord | null> => {
  const context = await requireAuthContext(auth, headers, options);
  const current = await getOrganizationApiKey(
    auth,
    headers,
    keyId,
    environmentKey,
    options,
  );
  if (!current || current.status === "revoked") {
    return null;
  }
  const selectedPermissions = resolveRequestedPermissions(input);

  const updated = (await auth.api.updateApiKey({
    body: {
      configId: DEFAULT_API_KEY_CONFIG_ID,
      enabled: input.enabled,
      expiresIn: readExpiresInSeconds(input.expiresInDays),
      keyId,
      metadata: {
        ...(current.metadata ?? {}),
        environmentKey,
        notes: readString(input.notes),
        organizationId: context.organizationId,
      },
      name: readString(input.name),
      permissions: selectedPermissions,
      userId: context.userId,
    },
  })) as BetterAuthApiKeyRecord;

  return toAdminApiKeyRecord(updated);
};

export const revokeOrganizationApiKey = async (
  auth: BetterAuthForLifecycle,
  headers: Headers,
  keyId: string,
  environmentKey = DEFAULT_ENVIRONMENT_KEY,
  options?: OrganizationApiKeyContextOptions,
): Promise<AdminApiKeyRecord | null> => {
  const existing = await getOrganizationApiKey(
    auth,
    headers,
    keyId,
    environmentKey,
    options,
  );
  if (!existing) {
    return null;
  }

  await auth.api.deleteApiKey({
    body: {
      configId: DEFAULT_API_KEY_CONFIG_ID,
      keyId,
    },
    headers,
  });

  return {
    ...existing,
    revokedAt: new Date().toISOString(),
    status: "revoked",
  };
};
