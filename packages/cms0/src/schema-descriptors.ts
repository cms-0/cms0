import type { FullDescriptor } from "@cms0/shared";
import { schemaDescriptor as bundledSchemaDescriptor } from "@cms0/cms0/generated/schema-descriptor";
import {
  getCms0DescriptorSidecarEventsUrl,
  getCms0DescriptorSidecarUrl,
} from "./descriptor-sidecar.js";

type NodeFsModule = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: "utf8"): string;
  statSync(path: string): { mtimeMs: number };
};

type NodePathModule = {
  dirname(path: string): string;
  join(...paths: string[]): string;
  resolve(...paths: string[]): string;
};

type NodeUrlModule = {
  fileURLToPath(url: string | URL): string;
};

type CachedLocalDescriptor = {
  descriptor: FullDescriptor;
  mtimeMs: number;
  path: string;
};

const LOCAL_DESCRIPTOR_RELATIVE_SEGMENTS = [
  ".cms0",
  "generated",
  "schema-descriptor.json",
] as const;

let cachedLocalDescriptor: CachedLocalDescriptor | null = null;
const browserDescriptorPromiseCache = new Map<string, Promise<FullDescriptor>>();
const browserDescriptorSubscriptionCache = new Map<
  string,
  {
    listeners: Set<() => void>;
    source: EventSource;
  }
>();

export const schemaDescriptor = bundledSchemaDescriptor;

function setSchemaDescriptorGlobals(descriptor: FullDescriptor) {
  const globals = globalThis as typeof globalThis & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };

  globals.__CMS0_SCHEMA_DESCRIPTOR__ = descriptor;
  globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = descriptor;
  return descriptor;
}

function createMissingBrowserDescriptorError() {
  return new Error(
    "cms0: no browser schema descriptor is active. Start the cms0 sidecar so the browser can load the descriptor generated from .cms0. Bundled package descriptors are not used at runtime.",
  );
}

function createMissingLocalDescriptorError() {
  return new Error(
    "cms0: no local schema descriptor was found. Expected .cms0/generated/schema-descriptor.json near the current project root. Run cms0 dev or cms0 build before calling cms0().",
  );
}

function getBuiltinModule<T = unknown>(specifier: string): T | null {
  const runtimeProcess = globalThis.process as
    | (NodeJS.Process & {
        getBuiltinModule?: (name: string) => unknown;
      })
    | undefined;

  if (typeof runtimeProcess?.getBuiltinModule === "function") {
    try {
      return runtimeProcess.getBuiltinModule(specifier) as T;
    } catch {
      // Ignore missing builtins and fall through.
    }
  }

  try {
    const runtimeRequire = Function(
      "try { return require; } catch { return undefined; }",
    )() as ((name: string) => T) | undefined;
    if (runtimeRequire) {
      return runtimeRequire(specifier);
    }
  } catch {
    // Ignore runtime require failures outside Node/CommonJS.
  }

  return null;
}

function getNodeFs() {
  return (
    getBuiltinModule<NodeFsModule>("node:fs") ??
    getBuiltinModule<NodeFsModule>("fs")
  );
}

function getNodePath() {
  return (
    getBuiltinModule<NodePathModule>("node:path") ??
    getBuiltinModule<NodePathModule>("path")
  );
}

function getNodeUrl() {
  return (
    getBuiltinModule<NodeUrlModule>("node:url") ??
    getBuiltinModule<NodeUrlModule>("url")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isFullDescriptor(value: unknown): value is FullDescriptor {
  return isRecord(value) && isRecord(value.models) && isRecord(value.roots);
}

function dedupePaths(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function parseStackFramePath(line: string): string | null {
  const urlModule = getNodeUrl();
  const directMatch =
    line.match(/\((file:\/\/[^)]+|\/[^)]+):\d+:\d+\)$/) ??
    line.match(/at (file:\/\/\S+|\/\S+):\d+:\d+$/);
  const rawPath = directMatch?.[1];
  if (!rawPath) return null;

  if (rawPath.startsWith("file://")) {
    if (urlModule) {
      try {
        return urlModule.fileURLToPath(rawPath);
      } catch {
        return null;
      }
    }

    try {
      return decodeURIComponent(new URL(rawPath).pathname);
    } catch {
      return null;
    }
  }

  return rawPath;
}

function resolveSchemaDescriptorSearchRoots(): string[] {
  const pathModule = getNodePath();
  if (!pathModule || typeof process === "undefined") {
    return [];
  }

  const roots: string[] = [];
  const projectRootOverride = process.env.CMS0_PROJECT_ROOT;
  if (typeof projectRootOverride === "string" && projectRootOverride.trim()) {
    roots.push(pathModule.resolve(projectRootOverride));
  }

  const descriptorPathOverride = process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
  if (typeof descriptorPathOverride === "string" && descriptorPathOverride.trim()) {
    roots.push(pathModule.dirname(pathModule.resolve(descriptorPathOverride)));
  }

  const stack = new Error().stack ?? "";
  for (const line of stack.split("\n").slice(1)) {
    const filePath = parseStackFramePath(line);
    if (!filePath) continue;
    roots.push(pathModule.dirname(pathModule.resolve(filePath)));
  }

  if (typeof process.cwd === "function") {
    roots.push(pathModule.resolve(process.cwd()));
  }

  return dedupePaths(roots);
}

function resolveLocalSchemaDescriptorPath(searchRoots: readonly string[]): string | null {
  const fs = getNodeFs();
  const pathModule = getNodePath();
  if (!fs || !pathModule) {
    return null;
  }

  const directOverride = process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
  if (typeof directOverride === "string" && directOverride.trim()) {
    const resolvedDirectOverride = pathModule.resolve(directOverride);
    if (fs.existsSync(resolvedDirectOverride)) {
      return resolvedDirectOverride;
    }
  }

  for (const root of searchRoots) {
    let current = pathModule.resolve(root);

    while (true) {
      const candidate = pathModule.join(
        current,
        ...LOCAL_DESCRIPTOR_RELATIVE_SEGMENTS,
      );
      if (fs.existsSync(candidate)) {
        return candidate;
      }

      const parent = pathModule.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }

  return null;
}

export function readLocalSchemaDescriptor(
  searchRoots = resolveSchemaDescriptorSearchRoots(),
): FullDescriptor | null {
  const fs = getNodeFs();
  if (!fs) {
    return null;
  }

  const descriptorPath = resolveLocalSchemaDescriptorPath(searchRoots);
  if (!descriptorPath) {
    return null;
  }

  try {
    const stat = fs.statSync(descriptorPath);
    if (
      cachedLocalDescriptor &&
      cachedLocalDescriptor.path === descriptorPath &&
      cachedLocalDescriptor.mtimeMs === stat.mtimeMs
    ) {
      return cachedLocalDescriptor.descriptor;
    }

    const parsed = JSON.parse(fs.readFileSync(descriptorPath, "utf8"));
    if (!isFullDescriptor(parsed)) {
      return null;
    }

    cachedLocalDescriptor = {
      descriptor: parsed,
      mtimeMs: stat.mtimeMs,
      path: descriptorPath,
    };
    return parsed;
  } catch {
    return null;
  }
}

function readGlobalSchemaDescriptor(): FullDescriptor | null {
  const globals = globalThis as typeof globalThis & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };

  const activeDescriptor =
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ ?? globals.__CMS0_SCHEMA_DESCRIPTOR__;
  return isFullDescriptor(activeDescriptor) ? activeDescriptor : null;
}

function isBundledFallbackDescriptor(descriptor: FullDescriptor) {
  return (
    isRecord(descriptor.metadata) &&
    (descriptor.metadata as Record<string, unknown>).__cms0Fallback === true
  );
}

function readBundledSchemaDescriptor(): FullDescriptor | null {
  const descriptor = bundledSchemaDescriptor as unknown as FullDescriptor;
  return isBundledFallbackDescriptor(descriptor) ? null : descriptor;
}

function createBrowserDescriptorFetchError(sidecarUrl: string, reason?: string) {
  const details = reason ? ` ${reason}` : "";
  return new Error(
    `cms0: failed to load the browser schema descriptor from ${sidecarUrl}.${details} Start the cms0 sidecar before calling cms0() in the browser.`,
  );
}

function clearBrowserSchemaDescriptorGlobals() {
  const globals = globalThis as typeof globalThis & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };

  delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
  delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
}

export function invalidateBrowserSchemaDescriptorCache(
  baseUrl?: string,
  apiKey?: string,
) {
  clearBrowserSchemaDescriptorGlobals();
  browserDescriptorPromiseCache.delete(
    getCms0DescriptorSidecarUrl(baseUrl, apiKey),
  );
}

export function ensureBrowserSchemaDescriptorDevSubscription(
  baseUrl?: string,
  apiKey?: string,
  onInvalidate?: () => void,
) {
  if (typeof window === "undefined") return;
  if (readBundledSchemaDescriptor()) return;
  if (typeof globalThis.EventSource !== "function") return;

  const eventsUrl = getCms0DescriptorSidecarEventsUrl(baseUrl, apiKey);
  let subscription = browserDescriptorSubscriptionCache.get(eventsUrl);

  if (!subscription) {
    const listeners = new Set<() => void>();
    const source = new globalThis.EventSource(eventsUrl);
    const handleSchemaVersion = () => {
      invalidateBrowserSchemaDescriptorCache(baseUrl, apiKey);
      for (const listener of listeners) {
        listener();
      }
    };
    const handleError = () => {
      const activeSubscription = browserDescriptorSubscriptionCache.get(eventsUrl);
      if (activeSubscription?.source === source) {
        browserDescriptorSubscriptionCache.delete(eventsUrl);
      }

      source.close();
    };

    source.addEventListener("schema-version", handleSchemaVersion as EventListener);
    source.onerror = handleError;
    subscription = {
      listeners,
      source,
    };
    browserDescriptorSubscriptionCache.set(eventsUrl, subscription);
  }

  if (onInvalidate) {
    subscription.listeners.add(onInvalidate);
  }
}

export async function resolveBrowserSchemaDescriptor(
  baseUrl?: string,
  apiKey?: string,
): Promise<FullDescriptor> {
  const injectedDescriptor = readGlobalSchemaDescriptor();
  if (injectedDescriptor) {
    return setSchemaDescriptorGlobals(injectedDescriptor);
  }

  const bundledDescriptor = readBundledSchemaDescriptor();
  if (bundledDescriptor) {
    return setSchemaDescriptorGlobals(bundledDescriptor);
  }

  const sidecarUrl = getCms0DescriptorSidecarUrl(baseUrl, apiKey);
  const cachedPromise = browserDescriptorPromiseCache.get(sidecarUrl);
  if (cachedPromise) {
    return cachedPromise;
  }

  const descriptorPromise = (async () => {
    try {
      const response = await fetch(sidecarUrl, {
        headers: {
          accept: "application/json",
        },
      });

      if (!response.ok) {
        throw createBrowserDescriptorFetchError(sidecarUrl, `HTTP ${response.status}`);
      }

      const parsed = await response.json();
      if (!isFullDescriptor(parsed)) {
        throw createBrowserDescriptorFetchError(
          sidecarUrl,
          "Received an invalid descriptor payload.",
        );
      }

      return setSchemaDescriptorGlobals(parsed);
    } catch (error) {
      browserDescriptorPromiseCache.delete(sidecarUrl);
      if (error instanceof Error) {
        throw createBrowserDescriptorFetchError(sidecarUrl, error.message);
      }
      throw createBrowserDescriptorFetchError(sidecarUrl);
    }
  })();

  browserDescriptorPromiseCache.set(sidecarUrl, descriptorPromise);
  return descriptorPromise;
}

export function getActiveSchemaDescriptor(): FullDescriptor {
  if (typeof window !== "undefined") {
    const injectedDescriptor = readGlobalSchemaDescriptor();
    if (!injectedDescriptor) {
      throw createMissingBrowserDescriptorError();
    }
    return setSchemaDescriptorGlobals(injectedDescriptor);
  }

  return setSchemaDescriptorGlobals(resolveActiveSchemaDescriptor());
}

function resolveActiveSchemaDescriptor(): FullDescriptor {
  const localDescriptor = readLocalSchemaDescriptor();
  if (localDescriptor) {
    return localDescriptor;
  }

  const bundledDescriptor = readBundledSchemaDescriptor();
  if (bundledDescriptor) {
    return bundledDescriptor;
  }

  throw createMissingLocalDescriptorError();
}

export function syncActiveSchemaDescriptorGlobals() {
  return setSchemaDescriptorGlobals(getActiveSchemaDescriptor());
}
