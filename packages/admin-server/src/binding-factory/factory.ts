import type {
  AdminErrorResponse,
  AdminRequestInput,
  AdminResponse,
  AdminServerTarget,
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
  SchemaPublishInput,
  ServerBackupRecord,
  ManualTriggerRecord,
  ManualTriggerInput,
  ManualTriggerRunRecord,
  ManualTriggerExecutionResponse,
  AdminApiKeyCreateInput,
  AdminApiKeyUpdateInput,
  AdminApiKeyRecord,
  AdminApiKeyCreateResponse,
} from "@cms0/admin-contract";
import type {
  AdminServerBinding,
  AdminServerUsageSummary,
} from "../admin-server/types";
import type { FullDescriptor } from "@cms0/shared";
import {
  deriveAssetFilenameFromStorageKey,
  deriveAssetKindFromStorageKey,
  inferAssetKindFromFilename,
  type AssetKind,
} from "@cms0/shared";
import type { UsageTracker } from "../usage-tracker";
import { applyGraphMutations } from "../graph-mutation-engine";
import type { ContentEngine, AdminServerBindingDeps, BackupRow } from "./types";
import { buildResolvedReadEngine } from "../route-gen/resolved-read-engine";
import {
  measureJsonBytes,
  getMonthKey,
  formatMonthLabel,
  isRecord,
  countDescriptorFields,
  countDescriptorEntries,
  toServerBackupRecord,
  computeChecksum,
} from "./utils";

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

async function dispatchNestedHandlers(
  singletonHandlers: Map<string, any>,
  collectionHandlers: Map<string, any>,
  parentPath: string,
  value: unknown,
): Promise<void> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, childVal] of Object.entries(value as Record<string, unknown>)) {
    const childPath = `${parentPath}/${key}`;
    if (Array.isArray(childVal)) {
      // Nested array → dispatch to child collection handler's replace
      const childCollHandler = collectionHandlers.get(childPath);
      if (childCollHandler?.replace) {
        await childCollHandler.replace(childVal, undefined);
      }
    } else if (childVal && typeof childVal === "object") {
      // Nested object → dispatch to child singleton handler's patch
      const childSingHandler = singletonHandlers.get(childPath);
      if (childSingHandler) {
        await childSingHandler.patch(childVal, undefined);
        await dispatchNestedHandlers(
          singletonHandlers,
          collectionHandlers,
          childPath,
          childVal,
        );
      }
    }
  }
}

function createResolvedReadEngineForContentEngine(engine: ContentEngine) {
  const tableResourceByName = new Map<string, any>();
  for (const resource of engine.resourceMap.values()) {
    tableResourceByName.set(resource.table.name, resource);
  }

  return buildResolvedReadEngine({
    tableResourceByName,
    collectionHandlersByPath: engine.collectionHandlers,
    singletonHandlersByPath: engine.singletonHandlers,
  });
}

const GRAPH_MUTATION_READ_OPTIONS = {
  locale: "all",
  maxDepth: 30,
  maxPages: 500,
  page: 1,
  pageSize: 500,
  resolveModelRefs: true,
} as const;

function isPaginatedGraphArray(value: unknown): value is { data: unknown[] } {
  return (
    isRecord(value) &&
    Array.isArray(value.data) &&
    isRecord(value.pagination)
  );
}

function unwrapPaginatedGraphArrays(value: unknown): unknown {
  if (isPaginatedGraphArray(value)) {
    return value.data.map((item) => unwrapPaginatedGraphArrays(item));
  }

  if (Array.isArray(value)) {
    return value.map((item) => unwrapPaginatedGraphArrays(item));
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key,
      unwrapPaginatedGraphArrays(child),
    ]),
  );
}

function resolveGraphListPageSize(pageSize: number | "full" | undefined) {
  if (pageSize === "full") return 500;
  if (pageSize === undefined) return 100;
  if (
    typeof pageSize === "number" &&
    Number.isFinite(pageSize) &&
    pageSize > 0
  ) {
    return Math.min(Math.floor(pageSize), 500);
  }
  throw new Error(
    "Graph collection pageSize must be 'full' or a positive finite number.",
  );
}

export function createAdminServerBinding(
  deps: AdminServerBindingDeps,
): AdminServerBinding {
  const {
    environmentKey,
    contentEngineFactory,
    schemaStore,
    schemaPush,
    backupStore,
    dataTransfer,
    uploadsTransfer,
    triggerStore,
    apiKeyAuth,
    usageTracker,
    assetStore,
    limitsChecker,
  } = deps;

  const engineCache = new Map<string, ContentEngine>();

  async function ensureContentEngine(): Promise<ContentEngine> {
    const cached = engineCache.get(environmentKey);
    if (cached) {
      // Check if snapshot changed
      const latest = await schemaStore.loadLatestSnapshot();
      if (cached.checksum === latest?.checksum) return cached;
    }

    const snapshot = await schemaStore.loadLatestSnapshot();
    if (!snapshot) {
      const empty = contentEngineFactory.buildEmpty();
      engineCache.set(environmentKey, empty);
      return empty;
    }

    const engine = await contentEngineFactory.buildFromSnapshot(snapshot);
    engineCache.set(environmentKey, engine);
    return engine;
  }

  function resetEngineCache() {
    engineCache.delete(environmentKey);
  }

  async function checkLimits(
    request: AdminRequestInput,
  ): Promise<AdminResponse<AdminErrorResponse> | null> {
    if (!limitsChecker) return null;
    const check = await limitsChecker.check(request);
    if (check.allowed) return null;
    return {
      body: {
        code: "limit_exceeded",
        message: check.reason,
        ok: false,
        route: request.segments.join("/"),
      },
      status: 402,
    };
  }

  function enrichAssetUrls<T>(value: T, depth = 0): T {
    if (depth > 16 || value == null) return value;

    if (Array.isArray(value)) {
      return value.map((entry) => enrichAssetUrls(entry, depth + 1)) as T;
    }

    if (!isRecord(value)) return value;

    const source = value as Record<string, unknown>;
    const storageKey =
      typeof source.storageKey === "string" && source.storageKey.trim().length > 0
        ? source.storageKey.trim()
        : undefined;
    const filename =
      typeof source.filename === "string" && source.filename.trim().length > 0
        ? source.filename.trim()
        : storageKey
          ? deriveAssetFilenameFromStorageKey(storageKey)
          : undefined;

    const looksLikeAsset =
      Boolean(filename || storageKey) &&
      (typeof source.mimeType === "string" ||
        typeof source.extension === "string" ||
        typeof source.size === "number" ||
        typeof source.width === "number" ||
        typeof source.height === "number" ||
        typeof source.length === "number");

    const next: Record<string, unknown> = { ...source };

    if (assetStore && looksLikeAsset && filename) {
      const kind =
        (storageKey ? deriveAssetKindFromStorageKey(storageKey) : undefined) ??
        inferAssetKindFromFilename(filename);
      const resolvedStorageKey =
        storageKey ?? assetStore.getStorageKey(kind, filename);
      const existingUrl =
        typeof source.url === "string" && source.url.trim().length > 0
          ? source.url.trim()
          : undefined;

      next.filename = filename;
      next.storageKey = resolvedStorageKey;
      next.url = existingUrl ?? assetStore.getPublicUrl(kind, filename);
    }

    for (const [key, entry] of Object.entries(next)) {
      if (entry && typeof entry === "object") {
        next[key] = enrichAssetUrls(entry, depth + 1);
      }
    }

    return next as T;
  }

  return {
    checkLimits,
    getLatestSchemaSnapshot: async (_target: AdminServerTarget) =>
      schemaStore.loadLatestSnapshot(),

    publishSchema: async (
      _target: AdminServerTarget,
      input: SchemaPublishInput,
    ) => {
      const limitsError = await checkLimits({
        method: "POST",
        segments: ["schema"],
        headers: new Headers(),
        searchParams: new URLSearchParams(),
        body: input,
      });
      if (limitsError) throw limitsError;

      const current = await schemaStore.loadLatestSnapshot();
      const checksum = computeChecksum(input.descriptor);

      if (current && current.checksum === checksum) {
        return {
          changed: false,
          migration: null,
          ok: true,
          snapshot: current,
        };
      }

      const version = input.version ?? new Date().toISOString();
      const snapshot: SchemaDescriptorSnapshot = {
        checksum,
        descriptor: input.descriptor,
        publishedAt: new Date().toISOString(),
        version,
      };

      await schemaPush.push(input.descriptor as FullDescriptor);
      await schemaStore.saveSnapshot(input.descriptor, version);
      resetEngineCache();
      await ensureContentEngine();

      return {
        changed: true,
        migration: {
          adapter: "postgres-generated-schema",
          appliedAt: new Date().toISOString(),
          createdTables: [],
          descriptorChecksum: checksum,
          descriptorVersion: version,
          existingTables: [],
          fieldCount: countDescriptorFields(snapshot),
          modelCount: countDescriptorEntries(snapshot, "models"),
          publicationId: version,
          resourceCount: 0,
          retiredResources: [],
          rootCount: countDescriptorEntries(snapshot, "roots"),
          source: "publish",
        },
        ok: true,
        snapshot,
      };
    },

    readGraphValue: async ({
      path,
      options,
    }: {
      path: string;
      target: AdminServerTarget;
      options?: any;
    }) => {
      const limitsError = await checkLimits({
        method: "GET",
        segments: ["content", path],
        headers: new Headers(),
        searchParams: new URLSearchParams(),
      });
      if (limitsError) throw limitsError;

      const engine = await ensureContentEngine();
      const resolvedReadEngine = createResolvedReadEngineForContentEngine(engine);

      const collectionHandler = engine.collectionHandlers.get(path);
      if (collectionHandler) {
        const collectionResource = engine.resourceMap.get(path);
        if (collectionResource?.kind === "collection") {
          return enrichAssetUrls(
            await resolvedReadEngine.resolveCollection(collectionResource, {
              fields: options?.fields,
              exclude: options?.exclude,
              locale: options?.locale ?? "all",
              maxDepth: options?.maxDepth,
              page: options?.page,
              pageSize: options?.pageSize,
              orderBy: options?.orderBy,
              orderDir: options?.orderDir,
              search: options?.search,
              paths: options?.paths,
              resolveModelRefs: options?.resolveModelRefs,
              filter: options?.filter,
            }),
          );
        }

        if (options?.pageSize === "full") {
          const items: unknown[] = [];
          let total = 0;
          const pageSize = resolveGraphListPageSize(options.pageSize);
          for (let page = 0; page < 500; page += 1) {
            const result = await collectionHandler.list(undefined, {
              locale: options?.locale ?? "all",
              page,
              pageSize,
              filter: options?.filter,
            });
            const pageItems = Array.isArray(result.items) ? result.items : [];
            if (!pageItems.length) break;
            items.push(...pageItems);
            total = Number(result.total ?? items.length);
            if (items.length >= total || pageItems.length < pageSize) break;
          }
          const resolvedTotal = total || items.length;
          return enrichAssetUrls({
            data: items,
            pagination: {
              page: 1,
              pageSize: resolvedTotal,
              total: resolvedTotal,
              pageCount: 1,
            },
          });
        }

        const pageSize = resolveGraphListPageSize(options?.pageSize);
        const result = await collectionHandler.list(undefined, {
          locale: options?.locale ?? "all",
          page: (options?.page ?? 1) - 1,
          pageSize,
          filter: options?.filter,
        });
        return enrichAssetUrls({
          data: result.items,
          pagination: {
            page: options?.page ?? 1,
            pageSize,
            total: result.total,
            pageCount: Math.ceil(result.total / pageSize) || 1,
          },
        });
      }
      const singletonHandler = engine.singletonHandlers.get(path);
      if (singletonHandler) {
        const singletonResource = engine.resourceMap.get(path);
        if (singletonResource?.kind === "singleton") {
          return enrichAssetUrls(
            await resolvedReadEngine.resolveRoot(singletonResource, {
              fields: options?.fields,
              exclude: options?.exclude,
              locale: options?.locale ?? "all",
              maxDepth: options?.maxDepth,
              page: options?.page,
              pageSize: options?.pageSize,
              orderBy: options?.orderBy,
              orderDir: options?.orderDir,
              search: options?.search,
              paths: options?.paths,
              resolveModelRefs: options?.resolveModelRefs,
            }),
          );
        }

        return enrichAssetUrls(
          await singletonHandler.get(undefined, {
            locale: options?.locale ?? "all",
          }),
        );
      }
      throw new Error(`No handler found for path: ${path}`);
    },

    mutateGraphValue: async ({
      path,
      ops,
      itemId,
    }: {
      path: string;
      target: AdminServerTarget;
      ops: any[];
      itemId?: string;
    }) => {
      const limitsError = await checkLimits({
        method: "POST",
        segments: ["content", path],
        headers: new Headers(),
        searchParams: new URLSearchParams(),
        body: { ops },
      });
      if (limitsError) throw limitsError;

      const engine = await ensureContentEngine();
      const resolvedReadEngine = createResolvedReadEngineForContentEngine(engine);

      // ── Per-item collection mutate: _graph/{collection}/{id}/_mutate ──────
      if (itemId) {
        const collHandler = engine.collectionHandlers.get(path);
        if (!collHandler) {
          throw new Error(`No collection handler for path: ${path}`);
        }
        const collectionResource = engine.resourceMap.get(path);
        if (!collectionResource || collectionResource.kind !== "collection") {
          throw new Error(`No collection resource for path: ${path}`);
        }

        const resolved = await resolvedReadEngine.resolveCollection(
          collectionResource,
          GRAPH_MUTATION_READ_OPTIONS,
        );
        const items = Array.isArray((resolved as any)?.data)
          ? (resolved as any).data
          : [];
        const currentItem =
          (items as any[]).find((i: any) => String(i.id) === itemId) ?? {};
        const mutationResult = applyGraphMutations(
          unwrapPaginatedGraphArrays(currentItem),
          { ops },
        );
        if (!mutationResult.ok) {
          throw new Error(`Graph mutation failed: ${mutationResult.error}`);
        }
        await collHandler.update(itemId, mutationResult.value, undefined);
        const afterResolved = await resolvedReadEngine.resolveCollection(
          collectionResource,
          GRAPH_MUTATION_READ_OPTIONS,
        );
        const after = Array.isArray((afterResolved as any)?.data)
          ? (afterResolved as any).data
          : [];
        return (after as any[]).find((i: any) => String(i.id) === itemId) ?? null;
      }

      const collectionHandler = engine.collectionHandlers.get(path);
      const singletonHandler = engine.singletonHandlers.get(path);
      if (!collectionHandler && !singletonHandler) {
        throw new Error(`No handler found for path: ${path}`);
      }
      let currentValue: unknown;
      if (collectionHandler) {
        const collectionResource = engine.resourceMap.get(path);
        if (collectionResource?.kind === "collection") {
          const result = await resolvedReadEngine.resolveCollection(
            collectionResource,
            GRAPH_MUTATION_READ_OPTIONS,
          );
          currentValue = Array.isArray((result as any)?.data)
            ? (result as any).data
            : [];
        } else {
          const result = await collectionHandler.list(undefined, {
            locale: "all",
            page: 0,
            pageSize: 10000,
          });
          currentValue = result.items;
        }
      } else {
        const singletonResource = engine.resourceMap.get(path);
        currentValue =
          singletonResource?.kind === "singleton"
            ? await resolvedReadEngine.resolveRoot(
                singletonResource,
                GRAPH_MUTATION_READ_OPTIONS,
              )
            : await singletonHandler.get(undefined, { locale: "all" });
      }
      const mutationInputValue = unwrapPaginatedGraphArrays(currentValue);
      const mutationResult = applyGraphMutations(mutationInputValue, { ops });
      if (!mutationResult.ok) {
        throw new Error(`Graph mutation failed: ${mutationResult.error}`);
      }
      if (collectionHandler) {
        if (!collectionHandler.replace) {
          throw new Error(
            `Collection handler for "${path}" does not support replace — _mutate on bare collection paths is not yet supported.`,
          );
        }
        await collectionHandler.replace(mutationResult.value, undefined);
        const collectionResource = engine.resourceMap.get(path);
        if (collectionResource?.kind === "collection") {
          const refreshed = await resolvedReadEngine.resolveCollection(
            collectionResource,
            GRAPH_MUTATION_READ_OPTIONS,
          );
          return (refreshed as any)?.data ?? [];
        }
        const refreshed = await collectionHandler.list(undefined, {
          locale: "all",
          page: 0,
          pageSize: 10000,
        });
        return refreshed.items;
      } else {
        await singletonHandler.patch(mutationResult.value, undefined);
        // Dispatch nested objects (→ child singleton handlers) and nested arrays
        // (→ child collection handlers) so every table gets a targeted write.
        await dispatchNestedHandlers(
          engine.singletonHandlers,
          engine.collectionHandlers,
          path,
          mutationResult.value,
        );
        // Return DB-confirmed state — not the in-memory mutation result — so
        // callers get a truthful view of what was actually persisted.
        const singletonResource = engine.resourceMap.get(path);
        return singletonResource?.kind === "singleton"
          ? await resolvedReadEngine.resolveRoot(
              singletonResource,
              GRAPH_MUTATION_READ_OPTIONS,
            )
          : await singletonHandler.get(undefined, { locale: "all" });
      }
    },

    readContentValue: async ({
      path,
      descriptor,
      kind,
      options,
    }: {
      path: string;
      descriptor: SchemaDescriptor;
      kind: "array" | "object" | "primitive" | "modelRef";
      options?: {
        expand?: string[];
        expandArrays?: string[];
        expandObjects?: string[];
        locale?: string;
      };
      target: AdminServerTarget;
    }) => {
      const engine = await ensureContentEngine();
      const collectionHandler = engine.collectionHandlers.get(path);
      if (collectionHandler) {
        const result = await collectionHandler.list(undefined, {
          expand: options?.expand,
          expandArrays: options?.expandArrays,
          expandObjects: options?.expandObjects,
          locale: options?.locale ?? "all",
          page: 0,
          pageSize: 1000,
        });
        return enrichAssetUrls(result.items);
      }
      const handler = engine.singletonHandlers.get(path);
      if (!handler) throw new Error(`No handler for: ${path}`);
      return enrichAssetUrls(
        await handler.get(undefined, {
          expandArrays: options?.expandArrays,
          locale: options?.locale ?? "all",
        }),
      );
    },

    createContentEntry: async ({
      path,
      value,
    }: {
      path: string;
      value: unknown;
      target: AdminServerTarget;
    }) => {
      const engine = await ensureContentEngine();
      const handler = engine.collectionHandlers.get(path);
      if (!handler) throw new Error(`No collection handler for: ${path}`);
      return handler.create(value, undefined);
    },

    updateContentEntry: async ({
      path,
      entryId,
      value,
    }: {
      path: string;
      entryId: string;
      value: unknown;
      target: AdminServerTarget;
    }) => {
      const engine = await ensureContentEngine();
      const handler = engine.collectionHandlers.get(path);
      if (!handler) throw new Error(`No collection handler for: ${path}`);
      await handler.update(entryId, value, undefined);
    },

    deleteContentEntry: async ({
      path,
      entryId,
    }: {
      path: string;
      entryId: string;
      target: AdminServerTarget;
    }) => {
      const engine = await ensureContentEngine();
      const handler = engine.collectionHandlers.get(path);
      if (!handler) throw new Error(`No collection handler for: ${path}`);
      await handler.delete(entryId, undefined);
    },

    replaceContentSingleton: async ({
      path,
      value,
    }: {
      path: string;
      value: unknown;
      target: AdminServerTarget;
    }) => {
      const engine = await ensureContentEngine();
      const handler = engine.singletonHandlers.get(path);
      if (!handler) throw new Error(`No singleton handler for: ${path}`);
      await handler.patch(value, undefined);
    },

    patchContentSingleton: async ({
      path,
      value,
    }: {
      path: string;
      value: unknown;
      target: AdminServerTarget;
    }) => {
      // Partial singleton update — same as replace but semantically distinct.
      // The singleton patch handler already only writes provided fields.
      const engine = await ensureContentEngine();
      const handler = engine.singletonHandlers.get(path);
      if (!handler) throw new Error(`No singleton handler for: ${path}`);
      await handler.patch(value, undefined);
    },

    listBackups: async (_target: AdminServerTarget) => {
      const backups = await backupStore.list(50);
      return backups.map(toServerBackupRecord);
    },

    createBackup: async (
      _target: AdminServerTarget,
      input?: { reason?: string; description?: string },
    ) => {
      const snapshot = await schemaStore.loadLatestSnapshot();
      if (!snapshot) return null;
      const backup = await backupStore.create({
        descriptor: snapshot.descriptor as FullDescriptor,
        fromChecksum: snapshot.checksum,
        fromVersion: snapshot.version,
        reason: input?.reason ?? input?.description ?? "manual",
        toChecksum: snapshot.checksum,
        toVersion: snapshot.version,
      });
      return toServerBackupRecord(backup);
    },

    deleteBackup: async (_target: AdminServerTarget, backupId: string) => {
      await backupStore.delete(backupId);
    },

    getBackup: async (_target: AdminServerTarget, backupId: string) => {
      const [row, archive] = await Promise.all([
        backupStore.getRow(backupId),
        backupStore.getArchive(backupId),
      ]);
      if (!row || !archive) return null;
      const descriptor = await backupStore.getDescriptor(backupId);
      return {
        ...toServerBackupRecord(row),
        payload: {},
        snapshot:
          descriptor && row.toVersion
            ? {
                checksum: row.toChecksum ?? computeChecksum(descriptor),
                descriptor,
                publishedAt: row.createdAt,
                version: row.toVersion,
              }
            : null,
      };
    },

    getBackupArchive: async (_target: AdminServerTarget, backupId: string) => {
      return backupStore.getArchive(backupId);
    },

    getBackupDescriptor: async (
      _target: AdminServerTarget,
      backupId: string,
    ) => {
      return backupStore.getDescriptor(backupId);
    },

    getBackupTypescript: async (
      _target: AdminServerTarget,
      backupId: string,
    ) => {
      const descriptor = await backupStore.getDescriptor(backupId);
      const backups = await backupStore.list(200);
      const backup = backups.find((b) => b.id === backupId) ?? null;
      if (!descriptor || !backup?.toVersion) return null;
      const checksum = backup.toChecksum ?? computeChecksum(descriptor);
      return `export const descriptorVersion = ${JSON.stringify(backup.toVersion)} as const;\nexport const descriptorChecksum = ${JSON.stringify(checksum)} as const;\n\nexport const descriptor = ${JSON.stringify(descriptor)} as const;\n`;
    },

    restoreBackup: async (_target: AdminServerTarget, backupId: string) => {
      const row = await backupStore.getRow(backupId);
      if (!row) return null;
      await backupStore.restore(backupId);
      resetEngineCache();
      await ensureContentEngine();
      const descriptor = await backupStore.getDescriptor(backupId);
      return {
        ...toServerBackupRecord(row),
        restoredAt: new Date().toISOString(),
        payload: {},
        snapshot:
          descriptor && row.toVersion
            ? {
                checksum: row.toChecksum ?? computeChecksum(descriptor),
                descriptor,
                publishedAt: row.createdAt,
                version: row.toVersion,
              }
            : null,
      };
    },

    exportDataTransferArchive: async (_target: AdminServerTarget) => {
      const exported = await dataTransfer.export();
      return {
        checksum: exported.checksum,
        data: exported.data,
        fileName: exported.fileName,
        sizeBytes: exported.sizeBytes,
        mimeType: "application/gzip",
      };
    },

    exportUploadsArchive: async (_target: AdminServerTarget) => {
      const exported = await uploadsTransfer.export();
      return {
        checksum: exported.checksum,
        data: exported.data,
        fileCount: exported.fileCount,
        fileName: exported.fileName,
        sizeBytes: exported.sizeBytes,
        mimeType: "application/gzip",
      };
    },

    getUploadAsset: async (
      _target: AdminServerTarget,
      input: {
        filename: string;
        kind: AssetKind;
      },
    ) => {
      if (!assetStore) {
        return null;
      }
      try {
        return {
          data: await assetStore.read(input.kind, input.filename),
        };
      } catch {
        return null;
      }
    },

    preflightDataTransferImport: async (
      _target: AdminServerTarget,
      input: { archive: Uint8Array },
    ) => {
      return dataTransfer.preflight(input.archive);
    },

    preflightUploadsImport: async (
      _target: AdminServerTarget,
      input: { archive: Uint8Array },
    ) => {
      const buf = Buffer.isBuffer(input.archive)
        ? input.archive
        : Buffer.from(input.archive);
      return uploadsTransfer.preflight(buf);
    },

    importDataTransferArchive: async (
      _target: AdminServerTarget,
      input: {
        archive: Uint8Array;
        reason?: string;
        skipMissingTables?: boolean;
      },
    ) => {
      const result = await dataTransfer.import({
        archive: input.archive,
        reason: input.reason,
        skipMissingTables: input.skipMissingTables,
      });
      resetEngineCache();
      return result;
    },

    importUploadsArchive: async (
      _target: AdminServerTarget,
      input: { archive: Uint8Array },
    ) => {
      const buf = Buffer.isBuffer(input.archive)
        ? input.archive
        : Buffer.from(input.archive);
      return uploadsTransfer.import(buf);
    },

    listManualTriggers: async (_target: AdminServerTarget) => {
      const triggers = await triggerStore.list();
      return triggers;
    },

    createManualTrigger: async (
      _target: AdminServerTarget,
      input: ManualTriggerInput,
    ) => {
      return triggerStore.create(input);
    },

    updateManualTrigger: async (
      _target: AdminServerTarget,
      triggerId: string,
      input: ManualTriggerInput,
    ) => {
      return triggerStore.update(triggerId, input);
    },

    deleteManualTrigger: async (
      _target: AdminServerTarget,
      triggerId: string,
    ) => {
      await triggerStore.delete(triggerId);
    },

    listManualTriggerRuns: async (
      _target: AdminServerTarget,
      triggerId?: string,
    ) => {
      const runs = await triggerStore.listRuns(100, triggerId);
      return runs;
    },

    runManualTrigger: async (
      _target: AdminServerTarget,
      triggerId: string,
      context?: Record<string, unknown>,
    ) => {
      const trigger = await triggerStore.getById(triggerId);
      if (!trigger || !trigger.enabled) return null;

      const run = await triggerStore.createRun({
        triggerId,
        status: "pending",
        initiatedBy: null,
        resourceContext: context ?? null,
      });

      try {
        await triggerStore.updateRun(run.id, { status: "running" });
        const result = await triggerStore.execute(trigger, context ?? null);
        await triggerStore.updateRun(run.id, {
          status: result.success ? "success" : "error",
          responseStatus: result.responseStatus ?? null,
          responseBodyPreview: result.responseBodyPreview ?? null,
          errorMessage: result.error ?? null,
          finishedAt: new Date().toISOString(),
          durationMs: result.durationMs,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await triggerStore.updateRun(run.id, {
          status: "error",
          errorMessage: msg,
          finishedAt: new Date().toISOString(),
        });
      }

      const [updatedRun, updatedTrigger] = await Promise.all([
        triggerStore.getRunById(run.id),
        triggerStore.getById(triggerId),
      ]);
      if (!updatedRun || !updatedTrigger) return null;

      return {
        ok: true,
        run: updatedRun,
        trigger: updatedTrigger,
      } satisfies ManualTriggerExecutionResponse;
    },

    createApiKey: async (
      target: AdminServerTarget,
      input: AdminApiKeyCreateInput,
      context?: { headers?: Headers },
    ) => {
      if (!context?.headers)
        throw new Error("Missing request headers for API key creation.");
      return apiKeyAuth.create(context.headers, input, target.environmentKey, {
        organizationId: target.organizationId,
      });
    },

    updateApiKey: async (
      target: AdminServerTarget,
      keyId: string,
      input: AdminApiKeyUpdateInput,
      context?: { headers?: Headers },
    ) => {
      if (!context?.headers) return null;
      return apiKeyAuth.update(
        context.headers,
        keyId,
        input,
        target.environmentKey,
        { organizationId: target.organizationId },
      );
    },

    revokeApiKey: async (
      target: AdminServerTarget,
      keyId: string,
      context?: { headers?: Headers },
    ) => {
      if (!context?.headers) return null;
      return apiKeyAuth.revoke(context.headers, keyId, target.environmentKey, {
        organizationId: target.organizationId,
      });
    },

    listApiKeys: async (
      target: AdminServerTarget,
      context?: { headers?: Headers },
    ) => {
      if (!context?.headers) return [];
      return apiKeyAuth.list(context.headers, target.environmentKey, {
        organizationId: target.organizationId,
      });
    },

    getUsageSummary: async (_target: AdminServerTarget) => {
      const engine = await ensureContentEngine();
      const monthKey = getMonthKey(new Date());
      const usageMonth = await usageTracker.getMonth(environmentKey, monthKey);

      const collectionResources = Array.from(
        engine.resourceMap.values(),
      ).filter((r: any) => r.kind === "collection");

      let collectionEntryCount = 0;
      for (const resource of collectionResources) {
        try {
          const handler = engine.collectionHandlers.get(resource.path);
          if (handler) {
            const result = await handler.list(undefined, {
              locale: "all",
              page: 0,
              pageSize: 1,
            });
            collectionEntryCount += result.pagination?.total ?? 0;
          }
        } catch {
          // table may not exist yet
        }
      }

      const descriptorBytes = measureJsonBytes(
        engine.snapshot?.descriptor ?? {},
      );

      return {
        content: {
          collectionCount: collectionResources.length,
          collectionEntryCount,
          fileBytes: 0,
          singletonCount: Array.from(engine.resourceMap.values()).filter(
            (r: any) => r.kind === "singleton",
          ).length,
        },
        environmentKey,
        month: {
          controlMetrics: usageMonth.controlMetrics,
          key: monthKey,
          label: formatMonthLabel(monthKey),
          metrics: usageMonth.metrics,
          publicMetrics: usageMonth.publicMetrics,
          totalMetrics: usageMonth.totalMetrics,
        },
        schema: {
          descriptorBytes,
          fieldCount: countDescriptorFields(engine.snapshot),
          modelCount: countDescriptorEntries(engine.snapshot, "models"),
          publishedAt: engine.snapshot?.publishedAt ?? null,
          rootCount: countDescriptorEntries(engine.snapshot, "roots"),
          version: engine.snapshot?.version ?? null,
        },
        storage: {
          contentStoreBytes: 0,
          schemaSnapshotBytes: descriptorBytes,
          totalBytes: descriptorBytes,
        },
      } satisfies AdminServerUsageSummary;
    },

    recordRequestUsage: async ({
      request,
      response,
    }: {
      request: AdminRequestInput;
      response: AdminResponse;
      target: AdminServerTarget;
    }) => {
      await usageTracker.record(request, response, environmentKey);
    },
  };
}
