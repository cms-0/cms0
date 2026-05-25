declare global {
  // eslint-disable-next-line no-var
  var __CMS0_SCHEMA_DESCRIPTOR__: unknown;
  // eslint-disable-next-line no-var
  var __CMS0_CANVAS_SCHEMA_DESCRIPTOR__: unknown;
  // eslint-disable-next-line no-var
  var __CMS0_READ_PROVENANCE_VALUE_META__:
    | ((value: unknown) => Cms0ProvenanceValueMeta | null)
    | undefined;
  // eslint-disable-next-line no-var
  var __CMS0_LIVE_ROOTS__:
    | Map<string, Set<WeakRef<object> | object>>
    | undefined;
  // eslint-disable-next-line no-var
  var __CMS0_CANVAS_TRANSPORT_ENABLED__: boolean | undefined;
}

export type Cms0ProvenanceConfidence = "exact" | "scope" | "root" | "multi";

export type Cms0ProvenanceMapping = {
  paths?: string[];
  fieldId?: string;
  scopeId?: string;
  rootId?: string;
  candidates?: string[];
  captures?: Cms0ProvenanceCapture[];
  entityIds?: Record<string, string>;
  confidence: Cms0ProvenanceConfidence;
};

type CaptureState = {
  paths: Set<string>;
  captures: Map<string, Cms0ProvenanceCapture>;
};

export type Cms0ProvenanceCapture = {
  path: string;
  rawPath: string;
  value: unknown;
};

export type Cms0ProvenanceValueMeta = {
  path: string;
  rawPath: string;
  entityIds: Record<string, string>;
};

type Cms0CanvasTransportPayload = {
  version: 1;
  rootId: string;
};

const CAPTURE_STACK: CaptureState[] = [];
const ARRAY_METHOD_NAMES = new Set(Object.getOwnPropertyNames(Array.prototype));
const TRACK_IGNORED_OBJECT_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "toJSON",
]);
const CMS0_CANVAS_TRANSPORT_KEY = "__cms0CanvasTransport";
const CMS0_CANVAS_TRANSPORT_DATA_KEY = "data";
const CMS0_CANVAS_COLLECTION_ITEM_ID_KEY = "__cms0CanvasCollectionItemId";

type CloneCanvasTransportOptions = {
  includeCollectionItemId?: boolean;
  attachVisibleProvenance?: boolean;
  transportSerializable?: boolean;
};

type WrapWithProvenanceOptions = {
  transportSerializable?: boolean;
};

let provenanceEnabled = false;
const proxyCache = new WeakMap<object, Map<string, unknown>>();
const proxyMeta = new WeakMap<object, Cms0ProvenanceValueMeta>();
const collectionItemIdentity = new WeakMap<object, string>();

function isCanvasTransportEnabled() {
  return globalThis.__CMS0_CANVAS_TRANSPORT_ENABLED__ === true;
}

export function isCms0CanvasTransportEnabled() {
  return isCanvasTransportEnabled();
}

function isRootRawPath(rawPath: string) {
  return rawPath.length > 0 && !rawPath.includes(".") && !rawPath.includes("[#");
}

function isWalkableCanvasTransportValue(
  value: unknown,
): value is Record<string, unknown> | unknown[] {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return true;

  const record = value as Record<string, unknown>;
  if ("$$typeof" in record || "__v_isVNode" in record || "_owner" in record) {
    return false;
  }

  if (typeof (record as { then?: unknown }).then === "function") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneCanvasTransportValue(
  value: unknown,
  seen: WeakMap<object, unknown> = new WeakMap(),
  options: CloneCanvasTransportOptions = {},
): unknown {
  if (!value || typeof value !== "object") return value;
  if (!isWalkableCanvasTransportValue(value)) return undefined;

  const cached = seen.get(value as object);
  if (cached) return cached;

  if (Array.isArray(value)) {
    const clone: unknown[] = [];
    seen.set(value, clone);
    value.forEach((item, index) => {
      clone[index] = cloneCanvasTransportValue(item, seen, options);
    });
    const collectionItemId = readCms0CollectionItemIdentity(value);
    if (collectionItemId) {
      collectionItemIdentity.set(clone, collectionItemId);
    }

    if (options.attachVisibleProvenance) {
      const meta = readCms0ProvenanceValueMeta(value);
      if (meta?.rawPath) {
        const wrapped = attachCms0ProvenanceRoot(clone, meta.rawPath, {
          registerLiveRoot: false,
          transportSerializable: options.transportSerializable,
        });
        seen.set(value, wrapped as object);
        return wrapped;
      }
    }

    return clone;
  }

  const clone: Record<string, unknown> = {};
  seen.set(value, clone);
  Object.entries(value as Record<string, unknown>).forEach(([key, nested]) => {
    clone[key] = cloneCanvasTransportValue(nested, seen, options);
  });
  const collectionItemId = readCms0CollectionItemIdentity(value);
  if (options.includeCollectionItemId !== false && collectionItemId) {
    clone[CMS0_CANVAS_COLLECTION_ITEM_ID_KEY] = collectionItemId;
  }
  if (collectionItemId) {
    collectionItemIdentity.set(clone, collectionItemId);
  }

  if (options.attachVisibleProvenance) {
    const meta = readCms0ProvenanceValueMeta(value);
    if (meta?.rawPath) {
      const wrapped = attachCms0ProvenanceRoot(clone, meta.rawPath, {
        registerLiveRoot: false,
        transportSerializable: options.transportSerializable,
      });
      seen.set(value, wrapped as object);
      return wrapped;
    }
  }

  return clone;
}

function wrapCanvasTransportRoot(value: unknown, rootId: string) {
  return {
    [CMS0_CANVAS_TRANSPORT_KEY]: {
      version: 1,
      rootId,
    } satisfies Cms0CanvasTransportPayload,
    [CMS0_CANVAS_TRANSPORT_DATA_KEY]: cloneCanvasTransportValue(value),
  };
}

export function dehydrateCms0CanvasTransportValue<T>(value: T): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const meta = readCms0ProvenanceValueMeta(value);
  if (meta?.rawPath) {
    return wrapCanvasTransportRoot(value, meta.rawPath);
  }

  return cloneCanvasTransportValue(value, new WeakMap(), {
    includeCollectionItemId: true,
  });
}

export function dehydrateCms0CanvasVisibleValue<T>(value: T): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  return cloneCanvasTransportValue(value, new WeakMap(), {
    attachVisibleProvenance: true,
    includeCollectionItemId: false,
    transportSerializable: false,
  });
}

export type Cms0LiveRoot = {
  rootId: string;
  value: object;
};

function supportsWeakRef(): boolean {
  return typeof WeakRef !== "undefined";
}

function getLiveRootStore() {
  const existing = globalThis.__CMS0_LIVE_ROOTS__;
  if (existing) return existing;
  const created = new Map<string, Set<WeakRef<object> | object>>();
  globalThis.__CMS0_LIVE_ROOTS__ = created;
  return created;
}

function derefLiveRoot(entry: WeakRef<object> | object): object | null {
  if (supportsWeakRef() && entry instanceof WeakRef) {
    return entry.deref() ?? null;
  }
  return entry as object;
}

function pruneDeadLiveRoots(entries: Set<WeakRef<object> | object>) {
  for (const entry of entries) {
    if (!derefLiveRoot(entry)) {
      entries.delete(entry);
    }
  }
}

function registerLiveRoot(rootId: string, value: object) {
  const store = getLiveRootStore();
  const entries = store.get(rootId) ?? new Set<WeakRef<object> | object>();
  pruneDeadLiveRoots(entries);

  for (const entry of entries) {
    if (derefLiveRoot(entry) === value) {
      store.set(rootId, entries);
      return;
    }
  }

  entries.add(supportsWeakRef() ? new WeakRef(value) : value);
  store.set(rootId, entries);
}

export function registerCms0LiveRoot(rootId: string, value: object) {
  const normalizedRoot = typeof rootId === "string" ? rootId.trim() : "";
  if (!normalizedRoot) return;
  registerLiveRoot(normalizedRoot, value);
}

export function registerCms0CollectionItemIdentity(
  value: unknown,
  collectionItemId: string | null | undefined,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const normalizedId =
    typeof collectionItemId === "string" ? collectionItemId.trim() : "";
  if (!normalizedId) return;
  collectionItemIdentity.set(value as object, normalizedId);
}

export function readCms0CollectionItemIdentity(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return collectionItemIdentity.get(value as object) ?? null;
}

function isNumericToken(value: string): boolean {
  return /^\d+$/.test(value);
}

function isItemMarkerToken(value: string): boolean {
  return /^\[#.+\]$/.test(value);
}

function readTrackedEntityId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const rawId = (value as Record<string, unknown>).id;
  return typeof rawId === "string" && rawId.trim().length > 0 ? rawId : null;
}

function readTrackedCollectionItemId(value: unknown): string | null {
  return readCms0CollectionItemIdentity(value) ?? readTrackedEntityId(value);
}

function normalizeTrackedToken(
  target: object,
  property: string,
  value: unknown,
): string | null {
  const token = property.trim();
  if (!token) return null;

  if (Array.isArray(target)) {
    if (isNumericToken(token)) {
      const entityId = readTrackedCollectionItemId(value);
      return entityId ? `[#${entityId}]` : token;
    }
    if (token === "length") return null;
    if (ARRAY_METHOD_NAMES.has(token)) return null;
    return null;
  }

  if (TRACK_IGNORED_OBJECT_KEYS.has(token)) return null;
  return token;
}

function recordPath(pathTokens: string[]) {
  const activeCapture = CAPTURE_STACK[CAPTURE_STACK.length - 1];
  if (!activeCapture) return;

  const normalizedTokens = pathTokens.filter((token) => token.length > 0);
  if (normalizedTokens.length === 0) return;
  activeCapture.paths.add(normalizedTokens.join("."));
}

function recordCapture(pathTokens: string[], value: unknown) {
  const activeCapture = CAPTURE_STACK[CAPTURE_STACK.length - 1];
  if (!activeCapture) return;

  const normalizedTokens = pathTokens.filter((token) => token.length > 0);
  if (normalizedTokens.length === 0) return;

  const rawPath = normalizedTokens.join(".");
  const path = canonicalizePath(rawPath);
  if (!path) return;

  if (!activeCapture.captures.has(rawPath)) {
    activeCapture.captures.set(rawPath, {
      path,
      rawPath,
      value,
    });
  }
}

function canonicalizePath(path: string): string {
  return path
    .split(".")
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 0 &&
        !isNumericToken(token) &&
        !isItemMarkerToken(token),
    )
    .join(".");
}

function collectCanonicalLeaves(paths: Iterable<string>): string[] {
  const leaves = new Set<string>();
  for (const rawPath of paths) {
    const canonicalPath = canonicalizePath(rawPath);
    if (!canonicalPath) continue;
    leaves.add(canonicalPath);
  }

  const ordered = Array.from(leaves).sort((a, b) => {
    const depthA = a.split(".").length;
    const depthB = b.split(".").length;
    if (depthA !== depthB) return depthB - depthA;
    return a.localeCompare(b);
  });

  const filtered: string[] = [];
  for (const path of ordered) {
    const isAncestorOfKnownLeaf = filtered.some(
      (known) => known === path || known.startsWith(`${path}.`),
    );
    if (isAncestorOfKnownLeaf) continue;
    filtered.push(path);
  }

  return filtered.sort((a, b) => a.localeCompare(b));
}

function expandCandidates(paths: Iterable<string>): string[] {
  const candidates = new Set<string>();

  for (const rawPath of paths) {
    const canonicalPath = canonicalizePath(rawPath);
    if (!canonicalPath) continue;
    const tokens = canonicalPath.split(".");
    for (let index = 1; index <= tokens.length; index += 1) {
      candidates.add(tokens.slice(0, index).join("."));
    }
  }

  return Array.from(candidates).sort((a, b) => {
    const depthA = a.split(".").length;
    const depthB = b.split(".").length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });
}

function longestCommonPrefix(paths: string[]): string | undefined {
  if (paths.length === 0) return undefined;

  const tokensList = paths.map((path) => path.split("."));
  const first = tokensList[0];
  if (!first) return undefined;

  const prefix: string[] = [];
  for (let index = 0; index < first.length; index += 1) {
    const token = first[index];
    if (!token) break;
    const matchesAll = tokensList.every((tokens) => tokens[index] === token);
    if (!matchesAll) break;
    prefix.push(token);
  }

  return prefix.length ? prefix.join(".") : undefined;
}

function buildMapping(paths: Set<string>): Cms0ProvenanceMapping | null {
  const leaves = collectCanonicalLeaves(paths);
  const expanded = expandCandidates(leaves);
  if (expanded.length === 0) return null;

  const rootCandidates = new Set<string>();
  expanded.forEach((candidate) => {
    const [root] = candidate.split(".");
    if (root) rootCandidates.add(root);
  });

  const rootId = rootCandidates.size === 1 ? Array.from(rootCandidates)[0] : undefined;
  const fieldId = leaves.length === 1 ? leaves[0] : undefined;

  let scopeId: string | undefined;
  if (!fieldId && leaves.length > 1) {
    const prefix = longestCommonPrefix(leaves);
    if (prefix && prefix.includes(".")) {
      scopeId = prefix;
    }
  }

  const candidates = expanded.length > 1 ? expanded : undefined;

  if (fieldId) {
    return {
      paths: leaves,
      fieldId,
      scopeId,
      rootId,
      candidates,
      confidence: "exact",
    };
  }
  if (scopeId) {
    return { paths: leaves, fieldId, scopeId, rootId, candidates, confidence: "scope" };
  }
  if (rootId) {
    return { paths: leaves, fieldId, scopeId, rootId, candidates, confidence: "root" };
  }

  return {
    paths: leaves,
    fieldId,
    scopeId,
    rootId,
    candidates: expanded,
    confidence: "multi",
  };
}

function attachCaptures(
  mapping: Cms0ProvenanceMapping | null,
  captures: Map<string, Cms0ProvenanceCapture>,
) {
  if (!mapping || captures.size === 0) return mapping;

  const entityIds: Record<string, string> = {};
  for (const capture of captures.values()) {
    const meta = readCms0ProvenanceValueMeta(capture.value);
    if (!meta?.entityIds) continue;
    for (const [rawPath, entityId] of Object.entries(meta.entityIds)) {
      if (typeof entityId !== "string" || entityId.trim().length === 0) continue;
      entityIds[rawPath] = entityId;
    }
  }

  return {
    ...mapping,
    captures: Array.from(captures.values()).sort((left, right) => {
      const depthDelta =
        left.rawPath.split(".").length - right.rawPath.split(".").length;
      if (depthDelta !== 0) return depthDelta;
      return left.rawPath.localeCompare(right.rawPath);
    }),
    entityIds: Object.keys(entityIds).length > 0 ? entityIds : undefined,
  };
}

function buildEntityLineage(
  inheritedEntityIds: Readonly<Record<string, string>>,
  rawPath: string,
  value: unknown,
) {
  const entityId = readTrackedEntityId(value);
  if (!entityId) {
    return inheritedEntityIds;
  }

  return {
    ...inheritedEntityIds,
    [rawPath]: entityId,
  };
}

function wrapWithProvenance<T>(
  value: T,
  pathTokens: string[],
  inheritedEntityIds: Readonly<Record<string, string>> = {},
  options: WrapWithProvenanceOptions = {},
): T {
  if (!provenanceEnabled) return value;
  if (!value || typeof value !== "object") return value;

  const objectValue = value as object;
  const pathKey = pathTokens.join(".");
  const currentEntityIds = buildEntityLineage(
    inheritedEntityIds,
    pathKey,
    objectValue,
  );
  const cachedByPath = proxyCache.get(objectValue);
  if (cachedByPath?.has(pathKey)) {
    return cachedByPath.get(pathKey) as T;
  }

  const proxy = new Proxy(objectValue as Record<PropertyKey, unknown>, {
    get(target, property, receiver) {
      if (
        property === "toJSON" &&
        options.transportSerializable !== false &&
        isCanvasTransportEnabled() &&
        isRootRawPath(pathKey)
      ) {
        return () => wrapCanvasTransportRoot(target, pathKey);
      }

      const result = Reflect.get(target, property, receiver);
      if (typeof property !== "string") return result;

      const trackedToken = normalizeTrackedToken(target, property, result);
      if (!trackedToken) return result;

      const nextPath = [...pathTokens, trackedToken];
      const wrappedResult = wrapWithProvenance(
        result,
        nextPath,
        buildEntityLineage(currentEntityIds, nextPath.join("."), result),
        options,
      );
      recordPath(nextPath);
      recordCapture(nextPath, wrappedResult);
      return wrappedResult;
    },
  });

  const map = cachedByPath ?? new Map<string, unknown>();
  map.set(pathKey, proxy);
  if (!cachedByPath) {
    proxyCache.set(objectValue, map);
  }
  const collectionItemId = readCms0CollectionItemIdentity(objectValue);
  if (collectionItemId) {
    collectionItemIdentity.set(proxy, collectionItemId);
  }
  const rawPath = pathKey;
  proxyMeta.set(proxy, {
    path: canonicalizePath(rawPath),
    rawPath,
    entityIds: currentEntityIds,
  });

  return proxy as T;
}

export function enableCms0ProvenanceTracking(enabled = true) {
  provenanceEnabled = enabled;
}

export function activateCms0CanvasTransport(enabled = true) {
  globalThis.__CMS0_CANVAS_TRANSPORT_ENABLED__ = enabled;
}

export function isCms0ProvenanceTrackingEnabled() {
  return provenanceEnabled;
}

export function attachCms0ProvenanceRoot<T>(
  value: T,
  rootId: string,
  options?: {
    registerLiveRoot?: boolean;
    transportSerializable?: boolean;
  },
): T {
  if (!provenanceEnabled) return value;
  const normalizedRoot = typeof rootId === "string" ? rootId.trim() : "";
  if (!normalizedRoot) return value;
  const wrapped = wrapWithProvenance(value, [normalizedRoot], {}, {
    transportSerializable: options?.transportSerializable,
  });
  if (
    options?.registerLiveRoot !== false &&
    wrapped &&
    typeof wrapped === "object"
  ) {
    registerLiveRoot(normalizedRoot, wrapped as object);
  }
  return wrapped;
}

export function readCms0ProvenanceValueMeta(value: unknown): Cms0ProvenanceValueMeta | null {
  if (!value || typeof value !== "object") return null;
  return proxyMeta.get(value as object) ?? null;
}

export function unwrapCms0CanvasTransportValue<T>(value: T): {
  rootId: string;
  value: unknown;
} | null {
  if (!value || typeof value !== "object") return null;

  const marker = (value as Record<string, unknown>)[CMS0_CANVAS_TRANSPORT_KEY];
  const payload = (value as Record<string, unknown>)[CMS0_CANVAS_TRANSPORT_DATA_KEY];

  if (!marker || typeof marker !== "object") return null;

  const rootId = (marker as Record<string, unknown>).rootId;
  const version = (marker as Record<string, unknown>).version;
  if (version !== 1 || typeof rootId !== "string" || rootId.trim().length === 0) {
    return null;
  }

  return {
    rootId: rootId.trim(),
    value: payload,
  };
}

export function readCms0CanvasTransportCollectionItemId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[CMS0_CANVAS_COLLECTION_ITEM_ID_KEY];
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim()
    : null;
}

function restoreCanvasTransportMetadataInternal(
  value: unknown,
  visited: WeakSet<object>,
) {
  if (!value || typeof value !== "object") return;
  if (visited.has(value as object)) return;
  visited.add(value as object);

  if (Array.isArray(value)) {
    value.forEach((entry) =>
      restoreCanvasTransportMetadataInternal(entry, visited),
    );
    return;
  }

  const record = value as Record<string, unknown>;
  const collectionItemId = record[CMS0_CANVAS_COLLECTION_ITEM_ID_KEY];
  if (typeof collectionItemId === "string" && collectionItemId.trim().length > 0) {
    registerCms0CollectionItemIdentity(record, collectionItemId);
  }
  delete record[CMS0_CANVAS_COLLECTION_ITEM_ID_KEY];

  Object.values(record).forEach((entry) =>
    restoreCanvasTransportMetadataInternal(entry, visited),
  );
}

export function restoreCms0CanvasTransportMetadata<T>(value: T): T {
  restoreCanvasTransportMetadataInternal(value, new WeakSet<object>());
  return value;
}

export function readCms0LiveRoots(rootId?: string): Cms0LiveRoot[] {
  const store = globalThis.__CMS0_LIVE_ROOTS__;
  if (!store) return [];

  const rootIds =
    typeof rootId === "string" && rootId.trim().length > 0
      ? [rootId.trim()]
      : Array.from(store.keys());

  const results: Cms0LiveRoot[] = [];
  for (const id of rootIds) {
    const entries = store.get(id);
    if (!entries) continue;
    pruneDeadLiveRoots(entries);
    for (const entry of entries) {
      const value = derefLiveRoot(entry);
      if (!value) continue;
      results.push({ rootId: id, value });
    }
    if (entries.size === 0) {
      store.delete(id);
    }
  }

  return results;
}

globalThis.__CMS0_READ_PROVENANCE_VALUE_META__ = readCms0ProvenanceValueMeta;

export function captureCms0Provenance<T>(evaluate: () => T): {
  value: T;
  mapping: Cms0ProvenanceMapping | null;
} {
  if (!provenanceEnabled) {
    return { value: evaluate(), mapping: null };
  }

  const capture: CaptureState = {
    paths: new Set<string>(),
    captures: new Map<string, Cms0ProvenanceCapture>(),
  };
  CAPTURE_STACK.push(capture);

  try {
    const value = evaluate();
    return {
      value,
      mapping: attachCaptures(buildMapping(capture.paths), capture.captures),
    };
  } finally {
    CAPTURE_STACK.pop();
  }
}
