/**
 * Content Request Handler
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
} from "../utils";
import { resolveBinding } from "../config";
import { readContentMutationInput } from "../parsers";
import { createContentResponse } from "../content";

const extractEntryId = (value: unknown): string | null => {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { id?: unknown }).id === "string" &&
    (value as { id: string }).id.length > 0
  ) {
    return (value as { id: string }).id;
  }
  return null;
};

const extractEntryIds = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((entry) => extractEntryId(entry))
      .filter((id): id is string => Boolean(id));
  }
  const id = extractEntryId(value);
  return id ? [id] : [];
};

export async function handleContentRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);
  const contentSegments = request.segments.slice(1);
  const contentPath = contentSegments.join("/");

  const limitsError = await binding.checkLimits?.(request);
  if (limitsError) return limitsError;

  if (contentSegments.length === 0) {
    return invalidRequest(
      route,
      "Content requests must include a descriptor path.",
    );
  }

  // ── Query param helpers ──────────────────────────────────────────────────
  const pageParam = request.searchParams.get("page");
  const pageSizeParam = request.searchParams.get("pageSize");
  const searchParam = request.searchParams.get("search");
  const expandParam = request.searchParams.get("expand");
  const expandArraysParam = request.searchParams.get("expandArrays");
  const expandObjectsParam = request.searchParams.get("expandObjects");
  const orderByParam = request.searchParams.get("orderBy");
  const orderDirParam = request.searchParams.get("orderDir");
  const fieldsParam = request.searchParams.get("fields");
  const excludeParam = request.searchParams.get("exclude");
  const idParam = request.searchParams.get("id");

  const toExpandList = (value: string | null) =>
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);

  const toFieldList = (value: string | null) =>
    value
      ?.split(",")
      .map((f) => f.trim())
      .filter(Boolean);

  // ── Per-item GET: GET /content/{collection}?id={uuid} ───────────────────
  if (request.method === "GET" && idParam) {
    const initial = await createContentResponse(target, contentPath, {
      expand: toExpandList(expandParam),
      expandArrays: toExpandList(expandArraysParam),
      expandObjects: toExpandList(expandObjectsParam),
      orderBy: orderByParam ?? undefined,
      orderDir: orderDirParam as "asc" | "desc" | undefined,
      fields: toFieldList(fieldsParam),
      exclude: toFieldList(excludeParam),
      page: pageParam ? Number(pageParam) : undefined,
      pageSize: pageParam ? Number(pageSizeParam) : undefined,
      search: searchParam ?? undefined,
    });
    if (!initial) return notFound(route);
    if (initial.resource.kind !== "array") {
      return invalidRequest(route, "?id= is only valid for collection resources.");
    }
    const items = initial.value as Array<Record<string, unknown>>;
    const item = items.find((i) => String(i.id) === idParam);
    if (!item) return notFound(route);
    return { body: { ...initial, value: item, pagination: undefined }, status: 200 };
  }

  // ── Standard read (GET) ──────────────────────────────────────────────────
  const initial = await createContentResponse(target, contentPath, {
    expand: toExpandList(expandParam),
    expandArrays: toExpandList(expandArraysParam),
    expandObjects: toExpandList(expandObjectsParam),
    orderBy: orderByParam ?? undefined,
    orderDir: orderDirParam as "asc" | "desc" | undefined,
    fields: toFieldList(fieldsParam),
    exclude: toFieldList(excludeParam),
    page: pageParam ? Number(pageParam) : undefined,
    pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
    search: searchParam ?? undefined,
  });
  if (!initial) return notFound(route);

  if (request.method === "GET") {
    return { body: initial, status: 200 };
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  const mutationInput = readContentMutationInput(request.body);

  if (request.method !== "DELETE" && !mutationInput) {
    return invalidRequest(
      route,
      "Content mutation requests must include a value.",
    );
  }

  let mutation:
    | {
        entryId?: string;
        entryIds?: string[];
        operation: "create" | "delete" | "replace" | "update" | "patch";
      }
    | undefined;

  if (initial.resource.kind === "array") {
    const entryId = request.searchParams.get("id");

    if (request.method === "POST") {
      // Bulk create: accept an array body
      if (Array.isArray(mutationInput?.value)) {
        const createdIds: string[] = [];
        for (const item of mutationInput.value as unknown[]) {
          const result = await binding.createContentEntry({
            descriptor: initial.resource.editorDescriptor,
            path: initial.resource.apiPath,
            target,
            value: item,
          });
          const ids = extractEntryIds(result);
          createdIds.push(...ids);
        }
        mutation = { entryIds: createdIds, operation: "create" };
      } else {
        const result = await binding.createContentEntry({
          descriptor: initial.resource.editorDescriptor,
          path: initial.resource.apiPath,
          target,
          value: mutationInput?.value,
        });
        const entryIds = extractEntryIds(result);
        mutation = {
          entryId: entryIds[entryIds.length - 1],
          entryIds,
          operation: "create",
        };
      }
    } else if (request.method === "PATCH") {
      if (!entryId) {
        return invalidRequest(
          route,
          "Collection updates require an id query parameter.",
        );
      }
      await binding.updateContentEntry({
        descriptor: initial.resource.editorDescriptor,
        entryId,
        path: initial.resource.apiPath,
        target,
        value: mutationInput?.value,
      });
      mutation = { entryId, entryIds: [entryId], operation: "update" };
    } else if (request.method === "DELETE") {
      if (!entryId) {
        return invalidRequest(
          route,
          "Collection deletes require an id query parameter.",
        );
      }
      await binding.deleteContentEntry({
        entryId,
        path: initial.resource.apiPath,
        target,
      });
      mutation = { entryId, entryIds: [entryId], operation: "delete" };
    } else {
      return methodNotAllowed(route, request.method);
    }
  } else {
    // Singleton mutations
    if (request.method === "PUT") {
      // Full replace
      await binding.replaceContentSingleton({
        descriptor: initial.resource.editorDescriptor,
        path: initial.resource.apiPath,
        target,
        value: mutationInput?.value,
      });
      mutation = { operation: "replace" };
    } else if (request.method === "PATCH") {
      // Partial update — only the supplied fields are written
      if (!binding.patchContentSingleton) {
        return invalidRequest(route, "Partial singleton updates not supported.");
      }
      await binding.patchContentSingleton({
        path: initial.resource.apiPath,
        target,
        value: mutationInput?.value,
      });
      mutation = { operation: "patch" };
    } else {
      return methodNotAllowed(route, request.method);
    }
  }

  const next = await createContentResponse(target, contentPath, {
    expand: toExpandList(expandParam),
    expandArrays: toExpandList(expandArraysParam),
    expandObjects: toExpandList(expandObjectsParam),
    orderBy: orderByParam ?? undefined,
    orderDir: orderDirParam as "asc" | "desc" | undefined,
    fields: toFieldList(fieldsParam),
    exclude: toFieldList(excludeParam),
    page: pageParam ? Number(pageParam) : undefined,
    pageSize: pageSizeParam ? Number(pageSizeParam) : undefined,
    search: searchParam ?? undefined,
  });

  return {
    body: mutation ? { ...next, mutation } : next,
    status: 200,
  };
}
