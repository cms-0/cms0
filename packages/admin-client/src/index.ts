import type {
  AdminUsageSummaryResponse,
  AdminContentMutationInput,
  AdminContentResponse,
  AdminContextResponse,
  AdminHealthResponse,
  AdminMutationSuccessResponse,
  AdminRequestMethod,
  DataTransferImportResponse,
  DataTransferPreflightResponse,
  ManualTriggerExecutionResponse,
  ManualTriggerInput,
  ManualTriggerRecord,
  ManualTriggerRunInput,
  ManualTriggerRunRecord,
  ManualTriggerRunContext,
  ManualTriggerRunsQuery,
  RuntimeBackupArchive,
  RuntimeBackupCreateInput,
  RuntimeBackupRecord,
  SchemaDescriptor,
  SchemaLatestSnapshotResponse,
  SchemaPublishInput,
  SchemaPublishResponse,
  SchemaTypescriptResponse,
  UploadsTransferImportResponse,
  UploadsTransferPreflightResponse,
} from "@cms0/admin-contract";
import {
  serializeGraphQueryOptions,
  type GraphPathQueryOptions,
  type GraphQueryOptions,
} from "@cms0/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

type FetchLike = typeof fetch;

// Query options for granular field-level fetching.
export type QueryOptions = GraphPathQueryOptions;

// Map of path keys (e.g., "testimonials", "testimonials.0.replies") to query options
export type PathQueryOptions = Record<string, QueryOptions>;

export class AdminClientError<TBody = unknown> extends Error {
  readonly status: number;
  readonly body: TBody;
  readonly path: string;

  constructor(input: { status: number; body: TBody; path: string }) {
    super(`Admin request failed with status ${input.status} for ${input.path}`);
    this.name = "AdminClientError";
    this.status = input.status;
    this.body = input.body;
    this.path = input.path;
  }
}

export const buildAdminPath = (segments: string[]) => {
  const normalized = segments.filter(Boolean).map(encodeURIComponent);
  return normalized.length > 0 ? `/${normalized.join("/")}` : "/";
};

export const buildSelfHostedAdminBasePath = () => "/api";

const normalizeRoutePrefix = (value: string | undefined) => {
  if (value === undefined) {
    return "/content";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return normalizePath(trimmed);
};

export const buildAdminBackupsPath = () => "/content/backups";

export const buildAdminBackupPath = (backupId: string) =>
  `${buildAdminBackupsPath()}/${encodeURIComponent(backupId)}`;

export const buildAdminBackupRestorePath = (backupId: string) =>
  `${buildAdminBackupPath(backupId)}/restore`;

export const buildAdminBackupDescriptorPath = (backupId: string) =>
  `${buildAdminBackupPath(backupId)}/descriptor`;

export const buildAdminBackupTypescriptPath = (backupId: string) =>
  `${buildAdminBackupPath(backupId)}/typescript`;

export const buildAdminBackupArchivePath = (backupId: string) =>
  `${buildAdminBackupPath(backupId)}/file`;

export const buildAdminDataTransferImportPath = () => "/content/data-transfer/import";

export const buildAdminDataTransferPreflightPath = () =>
  `${buildAdminDataTransferImportPath()}/preflight`;

export const buildAdminDataTransferExportPath = () =>
  "/content/data-transfer/export";

export const buildAdminUploadsExportPath = () => "/content/uploads/export";

export const buildAdminUploadsImportPath = () => "/content/uploads/import";

export const buildAdminUploadsPreflightPath = () =>
  `${buildAdminUploadsImportPath()}/preflight`;

export const buildAdminManualTriggersPath = () => "/content/triggers";

export const buildAdminManualTriggerPath = (triggerId: string) =>
  `${buildAdminManualTriggersPath()}/${encodeURIComponent(triggerId)}`;

export const buildAdminManualTriggerRunPath = (triggerId: string) =>
  `${buildAdminManualTriggerPath(triggerId)}/run`;

const buildQueryString = (
  entries: Array<[string, string | number | undefined]>,
) => {
  const searchParams = new URLSearchParams();

  for (const [key, value] of entries) {
    if (value === undefined || value === "") {
      continue;
    }

    searchParams.set(key, String(value));
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
};

const buildGraphQueryString = (query?: GraphQueryOptions) => {
  const queryStr = serializeGraphQueryOptions(query).toString();
  return queryStr ? `?${queryStr}` : "";
};

export const buildAdminManualTriggerRunsPath = (
  query: ManualTriggerRunsQuery = {},
) =>
  `/content/triggers/runs${buildQueryString([
    ["limit", query.limit],
    ["triggerId", query.triggerId],
  ])}`;

export const buildAdminUsagePath = () => "/usage";

const normalizePath = (path: string) =>
  path.startsWith("/") ? path : `/${path}`;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/g, "");

const mergeHeaders = (...inputs: Array<HeadersInit | undefined>) => {
  const headers = new Headers();

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    new Headers(input).forEach((value, key) => {
      headers.set(key, value);
    });
  }

  return headers;
};

const readResponseBody = async (response: Response) => {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
};

export const createAdminClient = (options: {
  baseUrl?: string;
  fetch?: FetchLike;
  defaultHeaders?: HeadersInit;
  routePrefix?: string;
}) => {
  const impl = options.fetch ?? fetch;
  const baseUrl = options.baseUrl ? trimTrailingSlash(options.baseUrl) : "";
  const routePrefix = normalizeRoutePrefix(options.routePrefix);

  const resolveUrl = (path: string) => `${baseUrl}${normalizePath(path)}`;
  const resolveRoute = (path: string) => `${routePrefix}${normalizePath(path)}`;
  const resolveAdminUtilityRoute = (path: string) => {
    if (routePrefix === "/content") {
      return path;
    }

    if (path === "/content") {
      return routePrefix || "/";
    }

    if (path.startsWith("/content/")) {
      return resolveRoute(path.slice("/content".length));
    }

    return resolveRoute(path);
  };

  const resolveContentRoute = (path: string) => {
    const normalizedPath = normalizePath(path);

    if (routePrefix === "/content") {
      return resolveRoute(normalizedPath);
    }

    if (routePrefix === "") {
      return `/content${normalizedPath}`;
    }

    return `${routePrefix}/content${normalizedPath}`;
  };

  const request = async <T>(input: {
    method?: AdminRequestMethod;
    path: string;
    body?: unknown;
    headers?: HeadersInit;
  }): Promise<T> => {
    const path = normalizePath(input.path);
    const response = await impl(resolveUrl(path), {
      method: input.method ?? "GET",
      headers: mergeHeaders(
        input.body === undefined
          ? undefined
          : { "content-type": "application/json" },
        options.defaultHeaders,
        input.headers,
      ),
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new AdminClientError({
        status: response.status,
        body,
        path,
      });
    }

    return body as T;
  };

  const requestForm = async <T>(input: {
    method?: AdminRequestMethod;
    path: string;
    body: FormData;
    headers?: HeadersInit;
  }): Promise<T> => {
    const path = normalizePath(input.path);
    const response = await impl(resolveUrl(path), {
      method: input.method ?? "POST",
      headers: mergeHeaders(options.defaultHeaders, input.headers),
      body: input.body,
    });

    const body = await readResponseBody(response);

    if (!response.ok) {
      throw new AdminClientError({
        status: response.status,
        body,
        path,
      });
    }

    return body as T;
  };

  return {
    request,
    requestForm,
    resolveUrl,
    get: <T>(path: string, headers?: HeadersInit) =>
      request<T>({ path, headers }),
    post: <T>(path: string, body?: unknown, headers?: HeadersInit) =>
      request<T>({ method: "POST", path, body, headers }),
    health: () => request<AdminHealthResponse>({ path: resolveRoute("/health") }),
    context: () =>
      request<AdminContextResponse>({ path: resolveRoute("/context") }),
    schema: {
      latestSnapshot: () =>
        request<SchemaLatestSnapshotResponse>({
          path: resolveRoute("/schema/latestSnapshot"),
        }),
      latestTypescript: () =>
        request<SchemaTypescriptResponse>({
          path: resolveRoute("/schema/typescript/latest"),
        }),
      publish: (body: SchemaPublishInput, headers?: HeadersInit) =>
        request<SchemaPublishResponse>({
          method: "POST",
          path: resolveRoute("/schema"),
          body,
          headers,
        }),
    },
    content: {
      get: (
        path: string,
        query?: {
          page?: number;
          pageSize?: number;
          search?: string;
          expand?: string;
          expandArrays?: string;
          expandObjects?: string;
        },
        headers?: HeadersInit,
      ) =>
        request<AdminContentResponse>({
          path: `${resolveContentRoute(path)}${buildQueryString([
            ["page", query?.page],
            ["pageSize", query?.pageSize],
            ["search", query?.search],
            ["expand", query?.expand],
            ["expandArrays", query?.expandArrays],
            ["expandObjects", query?.expandObjects],
          ])}`,
          headers,
        }),
      create: (
        path: string,
        body: AdminContentMutationInput | FormData,
        headers?: HeadersInit,
      ) =>
        typeof FormData !== "undefined" && body instanceof FormData
          ? requestForm<AdminContentResponse>({
              method: "POST",
              path: resolveContentRoute(path),
              body,
              headers,
            })
          : request<AdminContentResponse>({
              method: "POST",
              path: resolveContentRoute(path),
              body,
              headers,
            }),
      replace: (
        path: string,
        body: AdminContentMutationInput | FormData,
        headers?: HeadersInit,
      ) =>
        typeof FormData !== "undefined" && body instanceof FormData
          ? requestForm<AdminContentResponse>({
              method: "PUT",
              path: resolveContentRoute(path),
              body,
              headers,
            })
          : request<AdminContentResponse>({
              method: "PUT",
              path: resolveContentRoute(path),
              body,
              headers,
            }),
      update: (
        path: string,
        entryId: string,
        body: AdminContentMutationInput | FormData,
        headers?: HeadersInit,
      ) =>
        typeof FormData !== "undefined" && body instanceof FormData
          ? requestForm<AdminContentResponse>({
              method: "PATCH",
              path: `${resolveContentRoute(path)}?id=${encodeURIComponent(entryId)}`,
              body,
              headers,
            })
          : request<AdminContentResponse>({
              method: "PATCH",
              path: `${resolveContentRoute(path)}?id=${encodeURIComponent(entryId)}`,
              body,
              headers,
            }),
      remove: (path: string, entryId: string, headers?: HeadersInit) =>
        request<AdminContentResponse>({
          method: "DELETE",
          path: `${resolveContentRoute(path)}?id=${encodeURIComponent(entryId)}`,
          headers,
        }),
    },
    graph: {
      get: (
        path: string,
        query?: GraphQueryOptions,
        headers?: HeadersInit,
      ) =>
        request<unknown>({
          path: `${resolveRoute(`/_graph${normalizePath(path)}`)}${buildGraphQueryString(query)}`,
          headers,
        }),
      mutate: (
        path: string,
        body: {
          ops: Array<
            | { op: "set"; path: string; value: unknown }
            | { op: "insert"; path: string; value: unknown }
            | { op: "delete"; path: string }
            | { op: "deleteById"; path: string; id: string }
            | { op: "updateById"; path: string; id: string; value: unknown }
          >;
        },
        headers?: HeadersInit,
      ) =>
        request<unknown>({
          method: "POST",
          path: resolveRoute(`/_graph${normalizePath(path)}/_mutate`),
          body,
          headers,
        }),
      /** POST-based query — use when filter complexity exceeds URL limits. */
      query: (
        path: string,
        body?: GraphQueryOptions & {
          filter?: Record<string, unknown>;
        },
        headers?: HeadersInit,
      ) =>
        request<unknown>({
          method: "POST",
          path: resolveRoute(`/_graph${normalizePath(path)}/_query`),
          body,
          headers,
        }),
    },
    usage: {
      summary: (headers?: HeadersInit) =>
        request<AdminUsageSummaryResponse>({
          path: resolveRoute(buildAdminUsagePath()),
          headers,
        }),
    },
    backups: {
      list: (headers?: HeadersInit) =>
        request<RuntimeBackupRecord[]>({
          path: resolveAdminUtilityRoute(buildAdminBackupsPath()),
          headers,
        }),
      create: (body?: RuntimeBackupCreateInput, headers?: HeadersInit) =>
        request<RuntimeBackupRecord>({
          method: "POST",
          path: resolveAdminUtilityRoute(buildAdminBackupsPath()),
          body,
          headers,
        }),
      remove: (backupId: string, headers?: HeadersInit) =>
        request<AdminMutationSuccessResponse>({
          method: "DELETE",
          path: resolveAdminUtilityRoute(buildAdminBackupPath(backupId)),
          headers,
        }),
      restore: (backupId: string, headers?: HeadersInit) =>
        request<RuntimeBackupRecord>({
          method: "POST",
          path: resolveAdminUtilityRoute(buildAdminBackupRestorePath(backupId)),
          headers,
        }),
      descriptor: (backupId: string, headers?: HeadersInit) =>
        request<SchemaDescriptor>({
          path: resolveAdminUtilityRoute(buildAdminBackupDescriptorPath(backupId)),
          headers,
        }),
      descriptorUrl: (backupId: string) =>
        resolveUrl(resolveAdminUtilityRoute(buildAdminBackupDescriptorPath(backupId))),
      typescript: (backupId: string, headers?: HeadersInit) =>
        request<string>({
          path: resolveAdminUtilityRoute(buildAdminBackupTypescriptPath(backupId)),
          headers,
        }),
      typescriptUrl: (backupId: string) =>
        resolveUrl(resolveAdminUtilityRoute(buildAdminBackupTypescriptPath(backupId))),
      archive: (backupId: string, headers?: HeadersInit) =>
        request<RuntimeBackupArchive>({
          path: resolveAdminUtilityRoute(buildAdminBackupArchivePath(backupId)),
          headers,
        }),
      archiveUrl: (backupId: string) =>
        resolveUrl(resolveAdminUtilityRoute(buildAdminBackupArchivePath(backupId))),
    },
    dataTransfer: {
      exportUrl: () =>
        resolveUrl(resolveAdminUtilityRoute(buildAdminDataTransferExportPath())),
      importPreflight: (archive: FormData, headers?: HeadersInit) =>
        requestForm<DataTransferPreflightResponse>({
          path: resolveAdminUtilityRoute(buildAdminDataTransferPreflightPath()),
          body: archive,
          headers,
        }),
      importArchive: (archive: FormData, headers?: HeadersInit) =>
        requestForm<DataTransferImportResponse>({
          path: resolveAdminUtilityRoute(buildAdminDataTransferImportPath()),
          body: archive,
          headers,
        }),
    },
    uploads: {
      exportUrl: () =>
        resolveUrl(resolveAdminUtilityRoute(buildAdminUploadsExportPath())),
      importPreflight: (archive: FormData, headers?: HeadersInit) =>
        requestForm<UploadsTransferPreflightResponse>({
          path: resolveAdminUtilityRoute(buildAdminUploadsPreflightPath()),
          body: archive,
          headers,
        }),
      applyArchive: (archive: FormData, headers?: HeadersInit) =>
        requestForm<UploadsTransferImportResponse>({
          path: resolveAdminUtilityRoute(buildAdminUploadsImportPath()),
          body: archive,
          headers,
        }),
    },
    manualTriggers: {
      list: (headers?: HeadersInit) =>
        request<ManualTriggerRecord[]>({
          path: resolveAdminUtilityRoute(buildAdminManualTriggersPath()),
          headers,
        }),
      listRuns: (query: ManualTriggerRunsQuery = {}, headers?: HeadersInit) =>
        request<ManualTriggerRunRecord[]>({
          path: resolveAdminUtilityRoute(buildAdminManualTriggerRunsPath(query)),
          headers,
        }),
      create: (body: ManualTriggerInput, headers?: HeadersInit) =>
        request<ManualTriggerRecord>({
          method: "POST",
          path: resolveAdminUtilityRoute(buildAdminManualTriggersPath()),
          body,
          headers,
        }),
      update: (
        triggerId: string,
        body: ManualTriggerInput,
        headers?: HeadersInit,
      ) =>
        request<ManualTriggerRecord>({
          method: "PATCH",
          path: resolveAdminUtilityRoute(buildAdminManualTriggerPath(triggerId)),
          body,
          headers,
        }),
      remove: (triggerId: string, headers?: HeadersInit) =>
        request<AdminMutationSuccessResponse>({
          method: "DELETE",
          path: resolveAdminUtilityRoute(buildAdminManualTriggerPath(triggerId)),
          headers,
        }),
      run: (
        triggerId: string,
        body?: ManualTriggerRunInput,
        headers?: HeadersInit,
      ) =>
        request<ManualTriggerExecutionResponse>({
          method: "POST",
          path: resolveAdminUtilityRoute(buildAdminManualTriggerRunPath(triggerId)),
          body,
          headers,
        }),
    },
  };
};

export type AdminClientInstance = ReturnType<typeof createAdminClient>;

type AdminClientHookInput = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  client?: AdminClientInstance;
};

type MutationCallbacks<TResult> = {
  onError?: (error: Error) => Promise<void> | void;
  onSuccess?: (result: TResult) => Promise<void> | void;
};

const MODEL_REFERENCE_OPTIONS_PAGE_SIZE = 250;

const resolveAdminClient = (input: AdminClientHookInput) =>
  input.client ??
  createAdminClient({
    baseUrl: input.adminBaseUrl,
    routePrefix: input.adminRoutePrefix,
  });

const toAdminClientError = (error: unknown, fallback: string) =>
  error instanceof Error ? error : new Error(fallback);

const invalidateAdminContentQuery = async (
  queryClient: ReturnType<typeof useQueryClient>,
  adminBaseUrl: string,
  apiPath: string,
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: buildAdminContentQueryKey(adminBaseUrl, apiPath),
    }),
    queryClient.invalidateQueries({
      queryKey: ["admin-model-reference", trimTrailingSlash(adminBaseUrl)],
    }),
  ]);

const invalidateAdminBackupsQuery = async (
  queryClient: ReturnType<typeof useQueryClient>,
  adminBaseUrl: string,
) =>
  queryClient.invalidateQueries({
    queryKey: buildAdminBackupsQueryKey(adminBaseUrl),
  });

const invalidateAdminManualTriggersQuery = async (
  queryClient: ReturnType<typeof useQueryClient>,
  adminBaseUrl: string,
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: buildAdminManualTriggersQueryKey(adminBaseUrl),
    }),
    queryClient.invalidateQueries({
      queryKey: buildAdminManualTriggerRunsQueryKey(adminBaseUrl),
    }),
  ]);

const invalidateAdminServerQueries = async (
  queryClient: ReturnType<typeof useQueryClient>,
  adminBaseUrl: string,
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: buildAdminHealthQueryKey(adminBaseUrl),
    }),
    queryClient.invalidateQueries({
      queryKey: buildAdminContextQueryKey(adminBaseUrl),
    }),
    queryClient.invalidateQueries({
      queryKey: buildAdminLatestSnapshotQueryKey(adminBaseUrl),
    }),
    queryClient.invalidateQueries({
      queryKey: buildAdminLatestTypescriptQueryKey(adminBaseUrl),
    }),
  ]);

const invalidateAdminServerDependents = async (
  queryClient: ReturnType<typeof useQueryClient>,
  adminBaseUrl: string,
) =>
  Promise.all([
    invalidateAdminServerQueries(queryClient, adminBaseUrl),
    invalidateAdminBackupsQuery(queryClient, adminBaseUrl),
    queryClient.invalidateQueries({
      queryKey: ["admin-content", trimTrailingSlash(adminBaseUrl)],
    }),
    queryClient.invalidateQueries({
      queryKey: [
        "admin-model-reference-options",
        trimTrailingSlash(adminBaseUrl),
      ],
    }),
    queryClient.invalidateQueries({
      queryKey: ["admin-model-reference", trimTrailingSlash(adminBaseUrl)],
    }),
  ]);

export const buildAdminContentQueryKey = (
  adminBaseUrl: string,
  apiPath: string,
  query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    expand?: string;
    expandArrays?: string;
    expandObjects?: string;
  },
) => [
  "admin-content",
  trimTrailingSlash(adminBaseUrl),
  normalizePath(apiPath),
  query?.page ?? null,
  query?.pageSize ?? null,
  query?.search ?? null,
  query?.expand ?? null,
  query?.expandArrays ?? null,
  query?.expandObjects ?? null,
];

export const buildAdminHealthQueryKey = (adminBaseUrl: string) => [
  "admin-health",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminContextQueryKey = (adminBaseUrl: string) => [
  "admin-context",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminLatestSnapshotQueryKey = (adminBaseUrl: string) => [
  "admin-latest-snapshot",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminLatestTypescriptQueryKey = (adminBaseUrl: string) => [
  "admin-latest-typescript",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminModelReferenceQueryKey = (
  adminBaseUrl: string,
  modelName: string,
  query?: {
    expand?: string;
    expandArrays?: string;
    expandObjects?: string;
    page?: number;
    pageSize?: number;
    search?: string;
  },
) => [
  "admin-model-reference",
  trimTrailingSlash(adminBaseUrl),
  modelName,
  query?.page ?? 1,
  query?.pageSize ?? MODEL_REFERENCE_OPTIONS_PAGE_SIZE,
  query?.search ?? null,
  query?.expand ?? null,
  query?.expandArrays ?? null,
  query?.expandObjects ?? null,
];

export const buildAdminBackupsQueryKey = (adminBaseUrl: string) => [
  "admin-backups",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminManualTriggersQueryKey = (adminBaseUrl: string) => [
  "admin-manual-triggers",
  trimTrailingSlash(adminBaseUrl),
];

export const buildAdminManualTriggerRunsQueryKey = (
  adminBaseUrl: string,
  query?: ManualTriggerRunsQuery,
) => [
  "admin-manual-trigger-runs",
  trimTrailingSlash(adminBaseUrl),
  query ?? null,
];

export const useAdminHealthQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: AdminHealthResponse;
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.health(),
    queryKey: buildAdminHealthQueryKey(input.adminBaseUrl),
  });
};

export const useAdminContextQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: AdminContextResponse;
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.context(),
    queryKey: buildAdminContextQueryKey(input.adminBaseUrl),
  });
};

export const useAdminLatestSnapshotQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: SchemaLatestSnapshotResponse;
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.schema.latestSnapshot(),
    queryKey: buildAdminLatestSnapshotQueryKey(input.adminBaseUrl),
  });
};

export const useAdminLatestTypescriptQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: SchemaTypescriptResponse;
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.schema.latestTypescript(),
    queryKey: buildAdminLatestTypescriptQueryKey(input.adminBaseUrl),
  });
};

export const useAdminModelReferenceOptionsQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    modelName: string;
    query?: {
      expand?: string;
      expandArrays?: string;
      expandObjects?: string;
      page?: number;
      pageSize?: number;
      search?: string;
    };
  },
) => {
  const client = resolveAdminClient(input);
  const query = {
    ...input.query,
    page: input.query?.page ?? 1,
    pageSize: input.query?.pageSize ?? MODEL_REFERENCE_OPTIONS_PAGE_SIZE,
  };

  return useQuery({
    enabled: input.enabled ?? input.modelName.trim().length > 0,
    queryFn: () => client.content.get(`/models/${input.modelName}`, query),
    queryKey: buildAdminModelReferenceQueryKey(
      input.adminBaseUrl,
      input.modelName,
      query,
    ),
  });
};

export const useAdminContentQuery = (
  input: AdminClientHookInput & {
    apiPath: string;
    page?: number;
    pageSize?: number;
    search?: string;
    expand?: string;
    expandArrays?: string;
    expandObjects?: string;
    enabled?: boolean;
    initialData?: AdminContentResponse;
    staleTime?: number;
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () =>
      client.content.get(input.apiPath, {
        page: input.page,
        pageSize: input.pageSize,
        search: input.search,
        expand: input.expand,
        expandArrays: input.expandArrays,
        expandObjects: input.expandObjects,
      }),
    queryKey: buildAdminContentQueryKey(input.adminBaseUrl, input.apiPath, {
      page: input.page,
      pageSize: input.pageSize,
      search: input.search,
      expand: input.expand,
      expandArrays: input.expandArrays,
      expandObjects: input.expandObjects,
    }),
    staleTime: input.staleTime,
  });
};

export const useAdminReplaceContentMutation = (
  input: AdminClientHookInput &
    MutationCallbacks<AdminContentResponse> & {
      apiPath: string;
    },
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: unknown) =>
      typeof FormData !== "undefined" && value instanceof FormData
        ? client.content.replace(input.apiPath, value)
        : client.content.replace(input.apiPath, { value }),
    onError: (error) =>
      input.onError?.(toAdminClientError(error, "Unable to save content.")),
    onSuccess: async (result) => {
      await invalidateAdminContentQuery(
        queryClient,
        input.adminBaseUrl,
        input.apiPath,
      );
      await input.onSuccess?.(result);
    },
  });
};

export const usePublishAdminSchemaMutation = (
  input: AdminClientHookInput & MutationCallbacks<SchemaPublishResponse>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SchemaPublishInput) => client.schema.publish(body),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to publish the schema descriptor."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminServerDependents(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useAdminCreateContentMutation = (
  input: AdminClientHookInput &
    MutationCallbacks<AdminContentResponse> & {
      apiPath: string;
    },
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: unknown) =>
      typeof FormData !== "undefined" && value instanceof FormData
        ? client.content.create(input.apiPath, value)
        : client.content.create(input.apiPath, { value }),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to create the content entry."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminContentQuery(
        queryClient,
        input.adminBaseUrl,
        input.apiPath,
      );
      await input.onSuccess?.(result);
    },
  });
};

export const useAdminUpdateContentMutation = (
  input: AdminClientHookInput &
    MutationCallbacks<AdminContentResponse> & {
      apiPath: string;
    },
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: { entryId: string; value: unknown }) =>
      typeof FormData !== "undefined" && value.value instanceof FormData
        ? client.content.update(input.apiPath, value.entryId, value.value)
        : client.content.update(input.apiPath, value.entryId, {
            value: value.value,
          }),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to update the content entry."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminContentQuery(
        queryClient,
        input.adminBaseUrl,
        input.apiPath,
      );
      await input.onSuccess?.(result);
    },
  });
};

export const useAdminDeleteContentMutation = (
  input: AdminClientHookInput &
    MutationCallbacks<AdminContentResponse> & {
      apiPath: string;
    },
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) =>
      client.content.remove(input.apiPath, entryId),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to delete the content entry."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminContentQuery(
        queryClient,
        input.adminBaseUrl,
        input.apiPath,
      );
      await input.onSuccess?.(result);
    },
  });
};

export const useAdminBackupsQuery = (
  input: AdminClientHookInput & {
    initialData?: RuntimeBackupRecord[];
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    initialData: input.initialData,
    queryFn: () => client.backups.list(),
    queryKey: buildAdminBackupsQueryKey(input.adminBaseUrl),
  });
};

export const useCreateAdminBackupMutation = (
  input: AdminClientHookInput & MutationCallbacks<RuntimeBackupRecord>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body?: RuntimeBackupCreateInput) =>
      client.backups.create(body),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to create the backup."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminBackupsQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useRestoreAdminBackupMutation = (
  input: AdminClientHookInput & MutationCallbacks<RuntimeBackupRecord>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (backupId: string) => client.backups.restore(backupId),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to restore the backup."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminBackupsQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useDeleteAdminBackupMutation = (
  input: AdminClientHookInput & MutationCallbacks<AdminMutationSuccessResponse>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (backupId: string) => client.backups.remove(backupId),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to delete the backup."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminBackupsQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useAdminManualTriggersQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: ManualTriggerRecord[];
    queryKey?: readonly unknown[];
  },
) => {
  const client = resolveAdminClient(input);

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.manualTriggers.list(),
    queryKey:
      input.queryKey ?? buildAdminManualTriggersQueryKey(input.adminBaseUrl),
  });
};

export const useAdminManualTriggerRunsQuery = (
  input: AdminClientHookInput & {
    enabled?: boolean;
    initialData?: ManualTriggerRunRecord[];
    query?: ManualTriggerRunsQuery;
    refetchInterval?: number;
  },
) => {
  const client = resolveAdminClient(input);
  const query = input.query ?? {};

  return useQuery({
    enabled: input.enabled,
    initialData: input.initialData,
    queryFn: () => client.manualTriggers.listRuns(query),
    queryKey: buildAdminManualTriggerRunsQueryKey(input.adminBaseUrl, query),
    refetchInterval: input.refetchInterval,
  });
};

export const useCreateAdminManualTriggerMutation = (
  input: AdminClientHookInput & MutationCallbacks<ManualTriggerRecord>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ManualTriggerInput) =>
      client.manualTriggers.create(body),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to create the trigger."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminManualTriggersQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useUpdateAdminManualTriggerMutation = (
  input: AdminClientHookInput & MutationCallbacks<ManualTriggerRecord>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (value: { body: ManualTriggerInput; triggerId: string }) =>
      client.manualTriggers.update(value.triggerId, value.body),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to update the trigger."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminManualTriggersQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useDeleteAdminManualTriggerMutation = (
  input: AdminClientHookInput & MutationCallbacks<AdminMutationSuccessResponse>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (triggerId: string) => client.manualTriggers.remove(triggerId),
    onError: (error) =>
      input.onError?.(
        toAdminClientError(error, "Unable to delete the trigger."),
      ),
    onSuccess: async (result) => {
      await invalidateAdminManualTriggersQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

export const useRunAdminManualTriggerMutation = (
  input: AdminClientHookInput &
    MutationCallbacks<ManualTriggerExecutionResponse>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (
      value:
        | string
        | {
            context?: ManualTriggerRunContext;
            triggerId: string;
          },
    ) =>
      typeof value === "string"
        ? client.manualTriggers.run(value)
        : client.manualTriggers.run(value.triggerId, {
            context: value.context,
          }),
    onError: (error) =>
      input.onError?.(toAdminClientError(error, "Unable to run the trigger.")),
    onSuccess: async (result) => {
      await invalidateAdminManualTriggersQuery(queryClient, input.adminBaseUrl);
      await input.onSuccess?.(result);
    },
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// Graph API React Query hooks
// ──────────────────────────────────────────────────────────────────────────────

export const buildAdminGraphQueryKey = (
  adminBaseUrl: string,
  path: string,
  query?: GraphQueryOptions,
) =>
  [
    "admin",
    "graph",
    adminBaseUrl,
    path,
    query?.fields,
    query?.exclude,
    query?.page,
    query?.pageSize,
    query?.search,
    query?.orderBy,
    query?.orderDir,
    query?.resolveModelRefs ?? null,
    query?.paths ? JSON.stringify(query.paths) : undefined,
  ].filter(Boolean) as unknown as readonly ["admin", "graph", string, string];

export const invalidateAdminGraphQuery = async (
  queryClient: QueryClient,
  adminBaseUrl: string,
  path: string,
) => {
  await queryClient.invalidateQueries({
    queryKey: buildAdminGraphQueryKey(adminBaseUrl, path),
  });
};

export type AdminGraphQueryInput = AdminClientHookInput & {
  path: string;
  enabled?: boolean;
  fields?: string;
  exclude?: string;
  staleTime?: number;
  page?: number;
  pageSize?: GraphPathQueryOptions["pageSize"];
  orderBy?: string;
  orderDir?: "asc" | "desc";
  search?: string;
  resolveModelRefs?: boolean;
  initialData?: unknown;
  /**
   * Per-path query options for nested arrays.
   * Key is the field name (e.g., "testimonials", "features").
   * Value contains pagination options for that specific field.
   */
  paths?: Record<string, GraphPathQueryOptions>;
};

export const useAdminGraphQuery = (input: AdminGraphQueryInput) => {
  const client = resolveAdminClient(input);
  return useQuery({
    queryKey: buildAdminGraphQueryKey(input.adminBaseUrl, input.path, {
      fields: input.fields,
      exclude: input.exclude,
      page: input.page,
      pageSize: input.pageSize,
      search: input.search,
      orderBy: input.orderBy,
      orderDir: input.orderDir,
      resolveModelRefs: input.resolveModelRefs,
      paths: input.paths,
    }),
    queryFn: () =>
      client.graph.get(input.path, {
        fields: input.fields,
        exclude: input.exclude,
        page: input.page,
        pageSize: input.pageSize,
        orderBy: input.orderBy,
        orderDir: input.orderDir,
        search: input.search,
        resolveModelRefs: input.resolveModelRefs,
        paths: input.paths,
      }),
    enabled: input.enabled,
    initialData: input.initialData,
    staleTime: input.staleTime,
  });
};

export type AdminGraphMutateInput = AdminClientHookInput & {
  path: string;
};

export type AdminGraphMutateOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "insert"; path: string; value: unknown }
  | { op: "delete"; path: string }
  | { op: "deleteById"; path: string; id: string }
  | { op: "updateById"; path: string; id: string; value: unknown };

export type AdminGraphMutateFnInput = {
  ops: AdminGraphMutateOp[];
};

export const useAdminGraphMutate = (
  input: AdminGraphMutateInput & MutationCallbacks<unknown>,
) => {
  const client = resolveAdminClient(input);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ops }: AdminGraphMutateFnInput) =>
      client.graph.mutate(input.path, { ops }),
    onError: (error) =>
      input.onError?.(toAdminClientError(error, "Graph mutation failed.")),
    onSuccess: async (result) => {
      await invalidateAdminGraphQuery(
        queryClient,
        input.adminBaseUrl,
        input.path,
      );
      await input.onSuccess?.(result);
    },
  });
};

// ──────────────────────────────────────────────────────────────────────────────
// CMS0 convenience layer (admin UI / e2e helpers)
// ──────────────────────────────────────────────────────────────────────────────

export type AdminRuntimeAuthMode = "authorization" | "x-api-key";

export type AdminRuntimeConfig = {
  adminBaseUrl: string;
  schemaPath?: string;
  apiKey?: string;
  authMode?: AdminRuntimeAuthMode;
  routePrefix?: string;
};

export type AdminRuntimeClientOptions = {
  apiKey?: string;
  authMode?: AdminRuntimeAuthMode;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  routePrefix?: string;
};

export type AdminTargetConfig = Pick<AdminRuntimeConfig, "adminBaseUrl">;

export type AdminRuntimeRequestOptions = AdminRuntimeClientOptions &
  AdminTargetConfig;

export type AdminPublishOptions = AdminRuntimeRequestOptions & {
  descriptor: SchemaDescriptor;
  version?: string;
};

export const defineAdminRuntimeConfig = <const T extends AdminRuntimeConfig>(
  config: T,
) => config;

const normalizeText = (value: string | null | undefined) => {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
};

export const normalizeAdminRuntimeAuthMode = (
  value: string | null | undefined,
): AdminRuntimeAuthMode =>
  value === "x-api-key" ? "x-api-key" : "authorization";

export const createRuntimeAuthHeaders = (
  apiKey: string,
  mode: AdminRuntimeAuthMode = "authorization",
): HeadersInit =>
  mode === "x-api-key"
    ? { "x-api-key": apiKey }
    : { authorization: `Bearer ${apiKey}` };

export const resolveAdminBaseUrl = (config: AdminTargetConfig) => {
  return trimTrailingSlash(config.adminBaseUrl);
};

export const resolveAdminTargetConfig = (
  config: AdminTargetConfig,
  overrides: Partial<AdminTargetConfig> = {},
): AdminTargetConfig => ({
  adminBaseUrl: trimTrailingSlash(
    overrides.adminBaseUrl ?? config.adminBaseUrl,
  ),
});

export const createAdminRuntimeClient = (
  config: AdminTargetConfig,
  options: AdminRuntimeClientOptions = {},
) =>
  createAdminClient({
    baseUrl: resolveAdminBaseUrl(resolveAdminTargetConfig(config)),
    defaultHeaders:
      options.apiKey || options.headers
        ? mergeHeaders(
            options.headers,
            options.apiKey
              ? createRuntimeAuthHeaders(options.apiKey, options.authMode)
              : undefined,
          )
        : undefined,
    fetch: options.fetch,
    routePrefix: options.routePrefix,
  });

export const getAdminHealth = (input: AdminRuntimeRequestOptions) =>
  createAdminRuntimeClient(input, input).health();

export const getAdminContext = (input: AdminRuntimeRequestOptions) =>
  createAdminRuntimeClient(input, input).context();

export const getAdminLatestSnapshot = (input: AdminRuntimeRequestOptions) =>
  createAdminRuntimeClient(input, input).schema.latestSnapshot();

export const getAdminLatestTypescript = (input: AdminRuntimeRequestOptions) =>
  createAdminRuntimeClient(input, input).schema.latestTypescript();

export const getAdminContentResource = (
  input: AdminRuntimeRequestOptions & {
    path: string;
    query?: {
      page?: number;
      pageSize?: number;
      search?: string;
      expand?: string;
      expandArrays?: string;
      expandObjects?: string;
    };
  },
) => createAdminRuntimeClient(input, input).content.get(input.path, input.query);

export const publishAdminSchema = (input: AdminPublishOptions) =>
  createAdminRuntimeClient(input, input).schema.publish({
    descriptor: input.descriptor,
    version: normalizeText(input.version),
  });

export type AdminHealthResult = Promise<AdminHealthResponse>;
export type AdminContextResult = Promise<AdminContextResponse>;
export type AdminLatestSnapshotResult = Promise<SchemaLatestSnapshotResponse>;
export type AdminLatestTypescriptResult = Promise<SchemaTypescriptResponse>;
export type AdminContentResourceResult = Promise<AdminContentResponse>;
export type AdminPublishResult = Promise<SchemaPublishResponse>;
