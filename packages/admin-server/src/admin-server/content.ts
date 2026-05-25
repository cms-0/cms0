/**
 * Admin Server Content Response
 *
 * Complex content response logic with pagination support.
 */

import type {
  AdminContentResponse,
  AdminServerTarget,
} from "@cms0/admin-contract";
import { resolveContentResource } from "../content-resource";
import { resolveBinding } from "./config";

// Helper to recursively paginate nested arrays in an object
function applyNestedPagination<T>(value: T, pageSize: number, _depth = 0): T {
  if (_depth > 10) return value;

  if (Array.isArray(value)) {
    // Paginate the array itself
    return value.slice(0, pageSize) as T;
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = applyNestedPagination(val, pageSize, _depth + 1);
    }
    return result as T;
  }

  return value;
}

export async function createContentResponse(
  target: AdminServerTarget,
  contentPath: string,
  query?: {
    page?: number;
    pageSize?: number;
    search?: string;
    expand?: string[];
    expandArrays?: string[];
    expandObjects?: string[];
    orderBy?: string;
    orderDir?: "asc" | "desc";
    fields?: string[];
    exclude?: string[];
  },
): Promise<AdminContentResponse | null> {
  const binding = await resolveBinding(target);
  const snapshot = await binding.getLatestSchemaSnapshot(target);
  const resource = resolveContentResource(snapshot, contentPath);

  if (!resource) {
    return null;
  }

  const normalizeExpandParam = (
    value?: string | string[],
  ): string[] | undefined => {
    if (!value) return undefined;
    const rawValues = Array.isArray(value) ? value : [value];
    const parts = rawValues
      .flatMap((entry) => String(entry).split(","))
      .map((part) => part.trim())
      .filter(Boolean);
    return parts.length ? parts : undefined;
  };

  const expand = normalizeExpandParam(
    query?.expand as string | string[] | undefined,
  );
  const expandArrays = normalizeExpandParam(
    query?.expandArrays as string | string[] | undefined,
  );
  const expandObjects = normalizeExpandParam(
    query?.expandObjects as string | string[] | undefined,
  );

  const pageSize = query?.pageSize && query.pageSize > 0 ? query.pageSize : 10;
  const page = query?.page && query.page > 0 ? query.page : 1;
  const search = query?.search?.trim().toLowerCase() ?? "";
  const orderBy = query?.orderBy;
  const orderDir = query?.orderDir;
  const fields = query?.fields;
  const exclude = query?.exclude;

  // For nested array paths (e.g., "HomePage/testimonials"), use Graph API for SQL-level pagination
  const pathParts = contentPath.split("/");
  const isTopLevelModelCollection =
    resource.kind === "array" &&
    resource.segments[0] === "models" &&
    resource.segments.length === 2;

  if (
    pathParts.length > 1 &&
    resource.kind === "array" &&
    !isTopLevelModelCollection
  ) {
    const parentPath = pathParts.slice(0, -1).join("/");
    const nestedField = pathParts[pathParts.length - 1];

    if (!nestedField || !parentPath) {
      return null;
    }

    const graphResult = await binding.readGraphValue({
      path: parentPath,
      target,
      options: {
        page,
        pageSize,
        search: search || undefined,
        fields: [nestedField],
        paths: {
          [nestedField]: {
            page,
            pageSize,
            orderBy,
            orderDir,
            search: search || undefined,
            fields,
            exclude,
          },
        },
        resolveModelRefs:
          Boolean(expand?.length) ||
          Boolean(expandArrays?.length) ||
          Boolean(expandObjects?.length),
      },
    });

    // Extract nested field data with pagination
    const nestedData = (
      graphResult as Record<
        string,
        | {
            data: unknown[];
            pagination?: {
              total: number;
              page: number;
              pageSize: number;
              pageCount: number;
            };
          }
        | undefined
      >
    )?.[nestedField];

    return {
      ok: true,
      resource,
      value: nestedData?.data ?? [],
      pagination: nestedData?.pagination ?? {
        total: nestedData?.data?.length ?? 0,
        page,
        pageSize,
        pageCount: Math.ceil((nestedData?.data?.length ?? 0) / pageSize) || 1,
      },
    };
  }

  // For top-level singleton resources (objects), use Graph API for consistent pagination
  if (resource.kind !== "array") {
    const graphResult = await binding.readGraphValue({
      path: resource.apiPath,
      target,
      options: {
        page,
        pageSize,
        orderBy,
        orderDir,
        search: search || undefined,
        fields,
        exclude,
      },
    });

    return {
      ok: true,
      resource,
      value: graphResult,
    };
  }

  // Top-level model collections must use the graph resolver too. The legacy
  // collection reader can expose generated FK columns without descriptor
  // expansion, which leaves asset/modelRef cells empty in the editor.
  if (isTopLevelModelCollection) {
    const graphResult = await binding.readGraphValue({
      path: resource.apiPath,
      target,
      options: {
        locale: "all",
        page,
        pageSize,
        orderBy,
        orderDir,
        search: search || undefined,
        fields,
        exclude,
        resolveModelRefs: true,
      },
    });

    const graphPage =
      graphResult &&
      typeof graphResult === "object" &&
      !Array.isArray(graphResult) &&
      Array.isArray((graphResult as { data?: unknown }).data)
        ? (graphResult as {
            data: unknown[];
            pagination?: AdminContentResponse["pagination"];
          })
        : null;

    return {
      ok: true,
      resource,
      value: graphPage?.data ?? [],
      pagination: graphPage?.pagination ?? {
        total: graphPage?.data.length ?? 0,
        page,
        pageSize,
        pageCount: Math.ceil((graphPage?.data.length ?? 0) / pageSize) || 1,
      },
    };
  }

  // For non-model top-level array resources, use the original approach.
  const rawValue = await binding.readContentValue({
    descriptor: resource.editorDescriptor,
    kind: resource.kind,
    options: {
      expand,
      expandArrays,
      expandObjects,
      locale: "all",
    },
    path: resource.apiPath,
    target,
  });

  let entries = rawValue as Array<Record<string, unknown> & { id: string }>;
  const total = entries.length;

  if (search.length > 0) {
    entries = entries.filter((entry) =>
      JSON.stringify(entry).toLowerCase().includes(search),
    );
  }

  const pageCount = Math.max(1, Math.ceil(entries.length / pageSize));
  const clampedPage = Math.min(page, pageCount);
  const pageStart = (clampedPage - 1) * pageSize;
  const paginatedEntries = entries.slice(pageStart, pageStart + pageSize);

  return {
    ok: true,
    resource,
    value: paginatedEntries,
    pagination: {
      total,
      page: clampedPage,
      pageSize,
      pageCount,
    },
  };
}
