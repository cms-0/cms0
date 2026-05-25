/**
 * Admin Server Input Parsers
 *
 * Request body and query parameter parsing utilities.
 */

import type {
  AdminApiKeyCreateInput,
  AdminApiKeyUpdateInput,
  AdminContentMutationInput,
  SchemaPublishInput,
  ServerBackupCreateInput,
  ManualTriggerRunsQuery,
} from "@cms0/admin-contract";
import { isRecord } from "./utils";

export function readSchemaPublishInput(
  body: unknown,
): SchemaPublishInput | null {
  if (isRecord(body) && isRecord(body.descriptor)) {
    return {
      descriptor: body.descriptor,
      version: typeof body.version === "string" ? body.version : undefined,
    } as SchemaPublishInput;
  }
  return null;
}

export function readBackupCreateInput(
  body: unknown,
): ServerBackupCreateInput | undefined {
  if (!isRecord(body)) {
    return { reason: "manual" };
  }
  return {
    reason:
      typeof body.reason === "string"
        ? body.reason
        : typeof body.description === "string"
          ? body.description
          : "manual",
  };
}

export function readManualTriggerRunsQuery(
  searchParams: URLSearchParams,
): ManualTriggerRunsQuery {
  const limit = Number(searchParams.get("limit"));
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    triggerId: searchParams.get("triggerId") ?? undefined,
  };
}

export function readContentMutationInput(
  body: unknown,
): AdminContentMutationInput | null {
  if (isRecord(body) && "value" in body) {
    return body as AdminContentMutationInput;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    return { value: body };
  }

  return null;
}

export function readApiKeyCreateInput(
  body: unknown,
): AdminApiKeyCreateInput | null {
  if (!isRecord(body)) return null;
  return body as AdminApiKeyCreateInput;
}

export function readApiKeyUpdateInput(
  body: unknown,
): AdminApiKeyUpdateInput | null {
  if (!isRecord(body)) return null;
  return body as AdminApiKeyUpdateInput;
}

export function parseListQueryParam(
  value: string | null,
): string[] | undefined {
  if (!value || !value.trim()) return undefined;
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function readArchiveImportInput(
  body: unknown,
): Promise<{
  archive: Uint8Array;
  reason?: string;
  skipMissingTables?: boolean;
} | null> {
  const readSkipMissingTables = (value: unknown) =>
    value === true || value === "true" || value === "1" || value === 1;

  if (!body) return Promise.resolve(null);
  if (body instanceof ArrayBuffer) {
    return Promise.resolve({ archive: new Uint8Array(body) });
  }
  if (Buffer.isBuffer(body)) {
    return Promise.resolve({ archive: new Uint8Array(body) });
  }
  if (body instanceof FormData) {
    const archive = body.get("archive");
    if (!(archive instanceof File)) {
      return Promise.resolve(null);
    }

    return archive.arrayBuffer().then((buffer) => ({
      archive: new Uint8Array(buffer),
      reason:
        typeof body.get("reason") === "string"
          ? (body.get("reason") as string)
          : undefined,
      skipMissingTables: readSkipMissingTables(body.get("skipMissingTables")),
    }));
  }
  if (isRecord(body) && body.data) {
    const data = body.data;
    if (data instanceof ArrayBuffer) {
      return Promise.resolve({
        archive: new Uint8Array(data),
        reason: typeof body.reason === "string" ? body.reason : undefined,
        skipMissingTables: readSkipMissingTables(body.skipMissingTables),
      });
    }
    if (Buffer.isBuffer(data)) {
      return Promise.resolve({
        archive: new Uint8Array(data),
        reason: typeof body.reason === "string" ? body.reason : undefined,
        skipMissingTables: readSkipMissingTables(body.skipMissingTables),
      });
    }
  }
  return Promise.resolve(null);
}

export function readManualTriggerScopeType(value: unknown) {
  if (value === "global" || value === "model" || value === "root") {
    return value;
  }
  return null;
}

export function deriveManualTriggerContextFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  const modelsIndex = segments.lastIndexOf("models");

  if (modelsIndex >= 0 && segments.length > modelsIndex + 1) {
    const modelName = segments[modelsIndex + 1];
    const entryId = segments[modelsIndex + 2] ?? null;
    return {
      pathname,
      resourceName: modelName,
      resourcePath: `models/${modelName}`,
      resourceId: entryId,
      resourceType: "model",
    };
  }

  const contentIndex = segments.lastIndexOf("content");
  if (contentIndex >= 0 && segments.length > contentIndex + 1) {
    const rootName = segments[contentIndex + 1];
    return {
      pathname,
      resourceName: rootName,
      resourcePath: `roots/${rootName}`,
      resourceId: null,
      resourceType: "root",
    };
  }

  const singletonsIndex = segments.lastIndexOf("singletons");
  if (singletonsIndex >= 0 && segments.length > singletonsIndex + 1) {
    const rootName = segments[singletonsIndex + 1];
    return {
      pathname,
      resourceName: rootName,
      resourcePath: `roots/${rootName}`,
      resourceId: null,
      resourceType: "root",
    };
  }

  return {
    pathname,
    resourceName: null,
    resourcePath: null,
    resourceId: null,
    resourceType: null,
  };
}

export function readManualTriggerRunContext(request: {
  headers: Headers;
  body?: unknown;
}): Record<string, unknown> | null {
  const referer = request.headers.get("referer");
  const derivedFromReferer = (() => {
    if (!referer) return null;
    try {
      const url = new URL(referer);
      return deriveManualTriggerContextFromPath(url.pathname);
    } catch {
      return null;
    }
  })();

  const body = request.body;
  if (isRecord(body) && isRecord(body.context)) {
    return { ...derivedFromReferer, ...body.context };
  }

  return derivedFromReferer;
}
