import { camelCase, snakeCase } from "lodash";
import {
  decodeTaggedUnionValue,
  encodeTaggedUnionValue,
  getUnionBranchKeys,
  resolveGraphPathQueryOptions,
  type FieldDescriptor,
  type ParsedGraphPathQueryOptions,
  type ParsedGraphQueryOptions,
} from "@cms0/shared";
import type { Resource } from "./types";
import {
  capitalize,
  isObjectField,
  isScalarField,
  readModelRefForeignKey,
  resolveOrderColumn,
} from "./helpers";

type SingletonReadHandler = {
  get: (
    parentId?: string,
    opts?: { expandArrays?: string[]; locale?: string },
  ) => Promise<any>;
};

export type QueryOptions = ParsedGraphPathQueryOptions & {
  fields?: string[];
  exclude?: string[];
  expand?: string[];
  expandArrays?: string[];
  expandObjects?: string[];
  locale?: string;
  raw?: boolean;
  filter?: import("@cms0/shared").GraphFilterClause;
};

type CollectionListOptions = Omit<QueryOptions, "pageSize"> & {
  pageSize?: number;
  filter?: import("@cms0/shared").GraphFilterClause;
};

type CollectionReadHandler = {
  list: (
    parentId?: string,
    opts?: CollectionListOptions,
  ) => Promise<{ items: any[]; total: number }>;
  getById: (
    id: string,
    parentId?: string,
    opts?: {
      raw?: boolean;
      expand?: string[];
      expandArrays?: string[];
      expandObjects?: string[];
      locale?: string;
    },
  ) => Promise<any>;
};

export type ResolvedReadOptions = ParsedGraphQueryOptions & {
  maxPages?: number;
};

type ResolvedReadState = {
  locale?: string;
  resolveModelRefs: boolean;
  maxDepth: number;
  maxPages: number;
  pagination: QueryOptions;
  paths: Record<string, QueryOptions>;
  projectionFields?: string[];
  projectionExclude?: string[];
  filter?: import("@cms0/shared").GraphFilterClause;
  modelCache: Map<string, Promise<any>>;
  activeModelKeys: Set<string>;
};

const DEFAULT_GRAPH_PAGE_SIZE = "full" as const;
const FULL_PAGE_FETCH_SIZE = 500;

function isFullPageSize(
  pageSize: QueryOptions["pageSize"] | undefined,
): pageSize is typeof DEFAULT_GRAPH_PAGE_SIZE {
  return pageSize === DEFAULT_GRAPH_PAGE_SIZE;
}

function normalizeGraphPageSize(
  pageSize: QueryOptions["pageSize"] | undefined,
): QueryOptions["pageSize"] | undefined {
  if (pageSize === undefined || isFullPageSize(pageSize)) return pageSize;
  if (
    typeof pageSize === "number" &&
    Number.isFinite(pageSize) &&
    pageSize > 0
  ) {
    return pageSize;
  }
  throw new Error(
    "Graph pageSize must be 'full' or a positive finite number.",
  );
}

function normalizeGraphPathMap(
  paths: ResolvedReadOptions["paths"] | undefined,
): Record<string, QueryOptions> {
  const normalized: Record<string, QueryOptions> = {};
  for (const [path, options] of Object.entries(paths ?? {})) {
    normalized[path] = {
      ...options,
      pageSize: normalizeGraphPageSize(options.pageSize),
    };
  }
  return normalized;
}

function resolveNumericPageSize(
  pageSize: QueryOptions["pageSize"] | undefined,
  fallback: number,
) {
  const normalized = normalizeGraphPageSize(pageSize);
  if (isFullPageSize(normalized)) return fallback;
  const parsed = Number(normalized ?? fallback);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(Math.floor(parsed), FULL_PAGE_FETCH_SIZE)
    : fallback;
}

function resolveFullFetchPageSize(pageSize: QueryOptions["pageSize"] | undefined) {
  return Math.max(resolveNumericPageSize(pageSize, 10), FULL_PAGE_FETCH_SIZE);
}

function createFullPagination(total: number) {
  return {
    page: 1,
    pageSize: total,
    total,
    pageCount: 1,
  };
}

type ResolvedReadEngineDeps = {
  tableResourceByName: Map<string, Resource>;
  singletonHandlersByPath: Map<string, SingletonReadHandler>;
  collectionHandlersByPath: Map<string, CollectionReadHandler>;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isModelRefField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "modelRef"; model: string }> {
  return (
    (desc as any).kind === "modelRef" && typeof (desc as any).model === "string"
  );
}

function isUnionField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "union" }> {
  return (desc as any).kind === "union" && Array.isArray((desc as any).anyOf);
}

function getUnionBranchDescriptorByKey(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  branchKey: string,
): FieldDescriptor | null {
  const branches = Array.isArray((descriptor as any).anyOf)
    ? ((descriptor as any).anyOf as FieldDescriptor[])
    : [];
  if (!branches.length) return null;
  const keys = getUnionBranchKeys(descriptor);
  const index = keys.findIndex((key) => key === branchKey);
  if (index < 0 || index >= branches.length) return null;
  return branches[index] ?? null;
}

function extractId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    isObjectRecord(value) &&
    typeof value.id === "string" &&
    value.id.length > 0
  ) {
    return value.id;
  }
  return null;
}

function isLikelyEntityObject(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  if (keys.length === 1 && keys[0] === "id") return true;
  return keys.some(
    (key) =>
      key !== "id" &&
      !key.endsWith("Id") &&
      !key.endsWith("_id") &&
      key !== "createdAt" &&
      key !== "updatedAt" &&
      key !== "created_at" &&
      key !== "updated_at" &&
      key !== "orderIndex" &&
      key !== "order_index",
  );
}

function extractModelRefId(
  row: unknown,
  propertyName: string,
  modelName: string,
  allowObjectIdFallback: boolean,
): string | null {
  if (typeof row === "string") return row;
  if (!isObjectRecord(row)) return null;

  const found = extractId(
    readModelRefForeignKey(row, propertyName, modelName),
  );
  if (found) return found;

  const scalarValue = extractId(row.value);
  if (scalarValue) return scalarValue;

  if (allowObjectIdFallback && isLikelyEntityObject(row)) {
    return extractId(row);
  }

  return null;
}

function createState(options?: ResolvedReadOptions): ResolvedReadState {
  return {
    locale: options?.locale,
    resolveModelRefs: options?.resolveModelRefs !== false,
    maxDepth: Math.max(1, Math.min(30, Number(options?.maxDepth ?? 12))),
    maxPages: Math.max(1, Math.min(500, Number(options?.maxPages ?? 100))),
    pagination: {
      page: options?.page ?? 1,
      pageSize:
        normalizeGraphPageSize(options?.pageSize) ?? DEFAULT_GRAPH_PAGE_SIZE,
      orderBy: options?.orderBy,
      orderDir: options?.orderDir,
      search: options?.search,
    },
    paths: normalizeGraphPathMap(options?.paths),
    projectionFields: options?.fields,
    projectionExclude: options?.exclude,
    filter: options?.filter,
    modelCache: new Map(),
    activeModelKeys: new Set(),
  };
}

function serializeJsonScalar(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }

  return value;
}

function cloneValue<T>(value: T): T {
  const serialized = serializeJsonScalar(value);
  if (serialized !== value) return serialized as T;

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T;
  }
  if (isObjectRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = cloneValue(child);
    }
    return out as T;
  }
  return value;
}

function readDescriptorPropertyValue(
  row: Record<string, unknown>,
  propName: string,
): unknown {
  const candidates = Array.from(
    new Set([propName, camelCase(propName), snakeCase(propName)]),
  );

  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      return row[key];
    }
  }

  return undefined;
}

function createDescriptorOutputRecord(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  const systemKeys = [
    "id",
    "createdAt",
    "updatedAt",
    "created_at",
    "updated_at",
    "orderIndex",
    "order_index",
  ];

  for (const key of systemKeys) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      output[key] = cloneValue(row[key]);
    }
  }

  return output;
}

function mergeProjectedValue(existing: unknown, incoming: unknown): unknown {
  if (incoming === undefined) return existing;
  if (existing === undefined) return cloneValue(incoming);

  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const max = Math.max(existing.length, incoming.length);
    const out: unknown[] = [];
    for (let index = 0; index < max; index++) {
      const next = mergeProjectedValue(existing[index], incoming[index]);
      if (next !== undefined) out.push(next);
    }
    return out;
  }

  if (isObjectRecord(existing) && isObjectRecord(incoming)) {
    const out: Record<string, unknown> = { ...existing };
    for (const [key, child] of Object.entries(incoming)) {
      out[key] = mergeProjectedValue(out[key], child);
    }
    return out;
  }

  return cloneValue(incoming);
}

function projectValueByPath(value: unknown, tokens: string[]): unknown {
  if (!tokens.length) return cloneValue(value);

  if (Array.isArray(value)) {
    const projectedItems = value
      .map((item) => projectValueByPath(item, tokens))
      .filter((item) => item !== undefined);
    return projectedItems.length ? projectedItems : undefined;
  }

  if (!isObjectRecord(value)) return undefined;
  const [head, ...rest] = tokens;
  if (!head || !(head in value)) return undefined;

  const child = projectValueByPath(value[head], rest);
  if (child === undefined) return undefined;
  return { [head]: child };
}

function excludeValueByPath(value: unknown, tokens: string[]): unknown {
  if (!tokens.length) return undefined;

  if (Array.isArray(value)) {
    return value.map((item) => excludeValueByPath(item, tokens));
  }

  if (!isObjectRecord(value)) return value;

  const [head, ...rest] = tokens;
  if (!head || !(head in value)) return cloneValue(value);

  const out: Record<string, unknown> = { ...value };
  if (!rest.length) {
    delete out[head];
    return out;
  }

  const next = excludeValueByPath(out[head], rest);
  if (next === undefined) {
    delete out[head];
  } else {
    out[head] = next;
  }
  return out;
}

export type PaginatedArray<T = unknown> = {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

function applyProjection(
  value: unknown,
  includePaths: string[] | undefined,
  excludePaths: string[] | undefined,
  state?: ResolvedReadState,
): unknown {
  let projected: unknown = value;

  if (includePaths?.length) {
    let included: unknown = undefined;
    for (const path of includePaths) {
      const tokens = path.split(".").filter(Boolean);
      if (!tokens.length) continue;
      const partial = projectValueByPath(value, tokens);
      included = mergeProjectedValue(included, partial);
    }
    projected =
      included === undefined
        ? Array.isArray(value)
          ? []
          : isObjectRecord(value)
            ? {}
            : undefined
        : included;
  }

  if (excludePaths?.length) {
    for (const path of excludePaths) {
      const tokens = path.split(".").filter(Boolean);
      if (!tokens.length) continue;
      projected = excludeValueByPath(projected, tokens);
    }
  }

  if (state && includePaths?.length === 1) {
    const path = includePaths[0];
    if (path) {
      const tokens = path.split(".").filter(Boolean);
      if (tokens.length === 1 && Array.isArray(projected)) {
        return applyPagination(projected, state);
      }
    }
  }

  return projected;
}

function applyPagination<T>(
  items: T[],
  state: ResolvedReadState,
): PaginatedArray<T> {
  let filtered = items;
  const opts = state.pagination;

  if (opts.search) {
    const searchLower = opts.search.toLowerCase();
    filtered = items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(searchLower),
    );
  }

  const total = filtered.length;
  if (isFullPageSize(opts.pageSize)) {
    return {
      data: filtered,
      pagination: createFullPagination(total),
    };
  }

  const pageSize = resolveNumericPageSize(opts.pageSize, 10);
  const pageCount = Math.ceil(total / pageSize) || 1;
  const page = Math.min(opts.page ?? 1, pageCount);
  const pageStart = (page - 1) * pageSize;
  const paginatedItems = filtered.slice(pageStart, pageStart + pageSize);

  return {
    data: paginatedItems,
    pagination: {
      page,
      pageSize,
      total,
      pageCount,
    },
  };
}

function resolveObjectResourceForProperty(
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  tableResourceByName: Map<string, Resource>,
): Extract<Resource, { kind: "singleton" }> | undefined {
  const tableName = `${parentResource.table.name}${capitalize(propName)}`;
  const resource = tableResourceByName.get(tableName);
  if (resource?.kind === "singleton") return resource;
  return undefined;
}

function resolveArrayResourceForProperty(
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  tableResourceByName: Map<string, Resource>,
): Extract<Resource, { kind: "collection" }> | undefined {
  const tableName = camelCase(
    `${parentResource.table.name}_${snakeCase(propName)}_item`,
  );
  const resource = tableResourceByName.get(tableName);
  if (resource?.kind === "collection") return resource;
  return undefined;
}

function resolveChildCollectionParentId(
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  childResource: Extract<Resource, { kind: "collection" }>,
  currentId: string | undefined,
  parentId: string | undefined,
): string | undefined {
  if (
    childResource.parentRootLink &&
    parentId &&
    parentResource.kind === "singleton" &&
    parentResource.rootLink &&
    childResource.parentRootLink.table.name ===
      parentResource.rootLink.table.name &&
    childResource.parentRootLink.column === parentResource.rootLink.column
  ) {
    return parentId;
  }

  return currentId;
}

export function buildResolvedReadEngine(deps: ResolvedReadEngineDeps) {
  const {
    tableResourceByName,
    singletonHandlersByPath,
    collectionHandlersByPath,
  } = deps;

  function resolveFieldOptions(
    state: ResolvedReadState,
    fieldPath: string,
    resource: Extract<Resource, { kind: "collection" }>,
  ): QueryOptions {
    const globalOpts = state.pagination;
    const fieldOpts = resolveGraphPathQueryOptions(
      {} as QueryOptions,
      state.paths,
      fieldPath,
    );
    const isConnectionTable = resource.parent != null;
    const defaultOrderBy = isConnectionTable ? "orderIndex" : undefined;

    return {
      page: fieldOpts.page ?? globalOpts.page ?? 1,
      pageSize:
        normalizeGraphPageSize(
          fieldOpts.pageSize ?? globalOpts.pageSize,
        ) ?? DEFAULT_GRAPH_PAGE_SIZE,
      orderBy: fieldOpts.orderBy ?? globalOpts.orderBy ?? defaultOrderBy,
      orderDir: fieldOpts.orderDir ?? globalOpts.orderDir ?? "asc",
      search: fieldOpts.search ?? globalOpts.search,
      fields: fieldOpts.fields,
      exclude: fieldOpts.exclude,
      expand: fieldOpts.expand ?? globalOpts.expand,
      expandArrays: fieldOpts.expandArrays ?? globalOpts.expandArrays,
      expandObjects: fieldOpts.expandObjects ?? globalOpts.expandObjects,
      locale: fieldOpts.locale ?? globalOpts.locale ?? state.locale,
    };
  }

  async function queryPaginatedCollection(
    resource: Extract<Resource, { kind: "collection" }>,
    parentId: string | undefined,
    options: QueryOptions,
    state?: ResolvedReadState,
  ): Promise<{
    data: any[];
    pagination: {
      page: number;
      pageSize: number;
      total: number;
      pageCount: number;
    };
  }> {
    const handler = collectionHandlersByPath.get(resource.path);
    const pageSizeOption =
      normalizeGraphPageSize(options.pageSize) ?? DEFAULT_GRAPH_PAGE_SIZE;

    if (!handler) {
      return {
        data: [],
        pagination: {
          page: 1,
          pageSize: isFullPageSize(pageSizeOption)
            ? 0
            : resolveNumericPageSize(pageSizeOption, 10),
          total: 0,
          pageCount: 0,
        },
      };
    }

    if (isFullPageSize(pageSizeOption)) {
      const rows: any[] = [];
      let total = 0;
      const pageSize = resolveFullFetchPageSize(pageSizeOption);
      const maxPages = state?.maxPages ?? 100;
      for (let page = 0; page < maxPages; page += 1) {
        const result = await handler.list(parentId, {
          raw: true,
          page,
          pageSize,
          orderBy: options.orderBy,
          orderDir: options.orderDir,
          search: options.search,
          locale: options.locale,
          filter: options.filter,
        });
        const items = Array.isArray(result?.items) ? result.items : [];
        if (!items.length) break;
        rows.push(...items);
        total = Number(result?.total ?? rows.length);
        if (rows.length >= total || items.length < pageSize) break;
      }
      const resolvedTotal = total || rows.length;
      return {
        data: rows,
        pagination: createFullPagination(resolvedTotal),
      };
    }

    const pageSize = resolveNumericPageSize(pageSizeOption, 10);
    const result = await handler.list(parentId, {
      raw: true,
      page: (options.page ?? 1) - 1,
      pageSize,
      orderBy: options.orderBy,
      orderDir: options.orderDir,
      search: options.search,
      locale: options.locale,
      filter: options.filter,
    });

    const items = Array.isArray(result?.items) ? result.items : [];
    const total = Number(result?.total ?? items.length);

    return {
      data: items,
      pagination: {
        page: options.page ?? 1,
        pageSize,
        total,
        pageCount: Math.ceil(total / pageSize) || 1,
      },
    };
  }

  async function listAllRows(
    resource: Extract<Resource, { kind: "collection" }>,
    parentId: string | undefined,
    state: ResolvedReadState,
  ): Promise<any[]> {
    const handler = collectionHandlersByPath.get(resource.path);
    if (!handler) return [];

    const rows: any[] = [];
    const pageSize = resolveFullFetchPageSize(state.pagination.pageSize);
    for (let page = 0; page < state.maxPages; page++) {
      const result = await handler.list(parentId, {
        raw: true,
        page,
        pageSize,
        locale: state.locale,
      });
      const items = Array.isArray(result?.items) ? result.items : [];
      if (!items.length) break;
      rows.push(...items);
      const total = Number(result?.total ?? rows.length);
      if (rows.length >= total || items.length < pageSize) break;
    }
    return rows;
  }

  async function resolveModelById(
    modelName: string,
    id: string,
    state: ResolvedReadState,
    depth: number,
  ): Promise<any> {
    if (depth > state.maxDepth) return { id };

    const modelTableName = camelCase(modelName);
    const cacheKey = `${modelTableName}:${id}:${state.locale ?? ""}`;

    const cached = state.modelCache.get(cacheKey);
    if (cached) return cached;

    if (state.activeModelKeys.has(cacheKey)) {
      return { id };
    }

    const promise = (async () => {
      state.activeModelKeys.add(cacheKey);
      try {
        const modelResource = tableResourceByName.get(modelTableName);
        if (!modelResource || modelResource.kind !== "collection") {
          return { id };
        }

        const handler = collectionHandlersByPath.get(modelResource.path);
        if (!handler) return { id };

        const row = await handler.getById(id, undefined, {
          raw: true,
          locale: state.locale,
        });
        if (!row) return null;

        if (isScalarField(modelResource.item)) return row;
        if (modelResource.item.kind === "modelRef") {
          return resolveModelRefItem(modelResource.item, row, state, depth + 1);
        }
        if (isObjectField(modelResource.item)) {
          return resolveObjectRecord(
            modelResource,
            modelResource.item,
            row,
            undefined,
            state,
            depth + 1,
          );
        }

        return row;
      } finally {
        state.activeModelKeys.delete(cacheKey);
      }
    })();

    state.modelCache.set(cacheKey, promise);
    return promise;
  }

  async function resolveModelRefItem(
    descriptor: Extract<FieldDescriptor, { kind: "modelRef" }>,
    row: unknown,
    state: ResolvedReadState,
    depth: number,
  ): Promise<any> {
    if (depth > state.maxDepth) return row;

    const propName = camelCase(descriptor.model);
    const refId =
      extractModelRefId(row, propName, descriptor.model, false) ??
      extractModelRefId(row, propName, descriptor.model, true);
    if (!refId) return null;

    if (!state.resolveModelRefs) return refId;

    const resolved = await resolveModelById(
      descriptor.model,
      refId,
      state,
      depth + 1,
    );
    return resolved ?? null;
  }

  async function resolveCollectionItems(
    resource: Extract<Resource, { kind: "collection" }>,
    rows: any[],
    parentId: string | undefined,
    state: ResolvedReadState,
    depth: number,
    fieldPathPrefix = "",
  ): Promise<any[]> {
    if (depth > state.maxDepth) return rows;
    const itemDescriptor = resource.item;

    if (isScalarField(itemDescriptor)) {
      if (isUnionField(itemDescriptor)) {
        return Promise.all(
          rows.map((row) =>
            resolveUnionScalarRecord(row, itemDescriptor, state, depth + 1),
          ),
        );
      }
      return rows;
    }
    if (isModelRefField(itemDescriptor)) {
      return Promise.all(
        rows.map((row) =>
          resolveModelRefItem(itemDescriptor, row, state, depth + 1),
        ),
      );
    }
    if (!isObjectField(itemDescriptor)) {
      return rows;
    }

    return Promise.all(
      rows.map((row) =>
        resolveObjectRecord(
          resource,
          itemDescriptor,
          row,
          parentId,
          state,
          depth + 1,
          fieldPathPrefix,
        ),
      ),
    );
  }

  async function resolveCollectionResource(
    resource: Extract<Resource, { kind: "collection" }>,
    parentId: string | undefined,
    state: ResolvedReadState,
    depth: number,
    fieldPathPrefix = "",
  ): Promise<any[]> {
    const rows = await listAllRows(resource, parentId, state);
    return resolveCollectionItems(resource, rows, parentId, state, depth, fieldPathPrefix);
  }

  async function resolveSingletonResource(
    resource: Extract<Resource, { kind: "singleton" }>,
    parentId: string | undefined,
    state: ResolvedReadState,
    depth: number,
    fieldPathPrefix = "",
  ): Promise<any> {
    const handler = singletonHandlersByPath.get(resource.path);
    if (!handler) return {};

    const row = await handler.get(parentId, {
      locale: state.locale,
      expandArrays: [],
    });

    if (depth > state.maxDepth) return row;
    if (!isObjectField(resource.descriptor)) return row;

    return resolveObjectRecord(
      resource,
      resource.descriptor,
      row,
      parentId,
      state,
      depth + 1,
      fieldPathPrefix,
    );
  }

  async function resolveObjectRecord(
    resource: Extract<Resource, { kind: "collection" | "singleton" }>,
    descriptor: Extract<FieldDescriptor, { type: "object" }>,
    row: unknown,
    parentId: string | undefined,
    state: ResolvedReadState,
    depth: number,
    fieldPathPrefix = "",
  ): Promise<any> {
    if (!isObjectRecord(row)) return row;
    if (depth > state.maxDepth) return row;

    const source = row as Record<string, unknown>;
    const output = createDescriptorOutputRecord(source);
    const currentId = extractId(source) ?? parentId;

    for (const [propName, propDesc] of Object.entries(descriptor.properties)) {
      const fieldPath = fieldPathPrefix
        ? `${fieldPathPrefix}.${propName}`
        : propName;

      if (isUnionField(propDesc as FieldDescriptor)) {
        const rawUnion = readDescriptorPropertyValue(source, propName);
        if (rawUnion == null) {
          output[propName] = null;
          continue;
        }
        const decoded = decodeTaggedUnionValue(rawUnion);
        if (!decoded) {
          output[propName] = null;
          continue;
        }
        const branchDescriptor = getUnionBranchDescriptorByKey(
          propDesc as Extract<FieldDescriptor, { kind: "union" }>,
          decoded.branchKey,
        );
        if (!branchDescriptor || !isModelRefField(branchDescriptor)) {
          output[propName] = rawUnion;
          continue;
        }

        const refId = extractId(decoded.value);
        if (!refId) {
          output[propName] = rawUnion;
          continue;
        }

        const resolved = await resolveModelById(
          branchDescriptor.model,
          refId,
          state,
          depth + 1,
        );
        if (resolved !== null && resolved !== undefined) {
          output[propName] = encodeTaggedUnionValue(
            decoded.branchKey,
            resolved,
          );
        } else {
          output[propName] = rawUnion;
        }
        continue;
      }

      if (isScalarField(propDesc as FieldDescriptor)) {
        const rawValue = readDescriptorPropertyValue(source, propName);
        output[propName] = rawValue === undefined ? null : cloneValue(rawValue);
        continue;
      }

      if ((propDesc as any).kind === "modelRef") {
        const modelRefDesc = propDesc as Extract<
          FieldDescriptor,
          { kind: "modelRef" }
        >;
        const inlineValue = readDescriptorPropertyValue(source, propName);

        const refId =
          extractModelRefId(inlineValue, propName, modelRefDesc.model, true) ??
          extractModelRefId(source, propName, modelRefDesc.model, false);
        if (!refId) {
          output[propName] = null;
          continue;
        }

        if (!state.resolveModelRefs) {
          output[propName] = refId;
          continue;
        }

        const resolved = await resolveModelById(
          modelRefDesc.model,
          refId,
          state,
          depth + 1,
        );
        if (resolved !== null && resolved !== undefined) {
          output[propName] = resolved;
        } else {
          output[propName] = null;
        }
        continue;
      }

      if ((propDesc as any).type === "object") {
        const childResource = resolveObjectResourceForProperty(
          resource,
          propName,
          tableResourceByName,
        );
        if (!childResource) {
          const rawValue = readDescriptorPropertyValue(source, propName);
          output[propName] = rawValue === undefined ? null : cloneValue(rawValue);
          continue;
        }

        output[propName] = await resolveSingletonResource(
          childResource,
          currentId ?? undefined,
          state,
          depth + 1,
          fieldPath,
        );
        continue;
      }

      if ((propDesc as any).type === "array") {
        const childResource = resolveArrayResourceForProperty(
          resource,
          propName,
          tableResourceByName,
        );
        if (!childResource) {
          const rawValue = readDescriptorPropertyValue(source, propName);
          output[propName] = Array.isArray(rawValue) ? cloneValue(rawValue) : [];
          continue;
        }

        const childParentId = resolveChildCollectionParentId(
          resource,
          childResource,
          currentId ?? undefined,
          parentId,
        );

        const paginationOpts = resolveFieldOptions(
          state,
          fieldPath,
          childResource,
        );

        if (
          paginationOpts.page !== undefined ||
          paginationOpts.pageSize !== undefined
        ) {
          const raw = await queryPaginatedCollection(
            childResource,
            childParentId,
            paginationOpts,
            state,
          );
          const resolvedData = await resolveCollectionItems(
            childResource,
            raw.data,
            childParentId,
            state,
            depth + 1,
            fieldPath,
          );
          const projectedData =
            paginationOpts.fields?.length || paginationOpts.exclude?.length
              ? resolvedData.map((item) =>
                  applyProjection(
                    item,
                    paginationOpts.fields,
                    paginationOpts.exclude,
                    state,
                  ),
                )
              : resolvedData;
          output[propName] = { ...raw, data: projectedData };
        } else {
          output[propName] = await resolveCollectionResource(
            childResource,
            childParentId,
            state,
            depth + 1,
            fieldPath,
          );
        }
      }
    }

    return output;
  }

  async function resolveUnionScalarRecord(
    row: unknown,
    descriptor: Extract<FieldDescriptor, { kind: "union" }>,
    state: ResolvedReadState,
    depth: number,
  ): Promise<unknown> {
    if (!isObjectRecord(row)) return row;
    const source = row as Record<string, unknown>;
    const unionRaw = source.value;
    if (unionRaw == null) return row;

    const decoded = decodeTaggedUnionValue(unionRaw);
    if (!decoded) {
      return { ...source, value: null };
    }

    const branchDescriptor = getUnionBranchDescriptorByKey(
      descriptor,
      decoded.branchKey,
    );
    if (!branchDescriptor || !isModelRefField(branchDescriptor)) {
      return row;
    }

    const refId = extractId(decoded.value);
    if (!refId) return row;

    const resolved = await resolveModelById(
      branchDescriptor.model,
      refId,
      state,
      depth + 1,
    );
    if (resolved == null) return row;
    return {
      ...source,
      value: encodeTaggedUnionValue(decoded.branchKey, resolved),
    };
  }

  return {
    async resolveRoot(
      rootResource: Extract<Resource, { kind: "singleton" }>,
      options?: ResolvedReadOptions,
    ) {
      const state = createState(options);
      const resolved = await resolveSingletonResource(
        rootResource,
        undefined,
        state,
        0,
      );
      return applyProjection(
        resolved,
        state.projectionFields,
        state.projectionExclude,
        state,
      );
    },
    async resolveModel(
      modelResource: Extract<Resource, { kind: "collection" }>,
      id: string,
      options?: ResolvedReadOptions,
    ) {
      const state = createState(options);
      const modelName = modelResource.path.replace(/^models\//, "");
      const resolved = await resolveModelById(modelName, id, state, 0);
      return applyProjection(
        resolved,
        state.projectionFields,
        state.projectionExclude,
        state,
      );
    },
    async resolveCollection(
      collectionResource: Extract<Resource, { kind: "collection" }>,
      options?: ResolvedReadOptions,
    ) {
      const state = createState(options);
      const itemDescriptor = collectionResource.item;
      const resolveRows = async (rows: any[]) => {
        let resolvedRows = rows;

        if (isModelRefField(itemDescriptor)) {
          resolvedRows = await Promise.all(
            rows.map((row) =>
              resolveModelRefItem(itemDescriptor, row, state, 1),
            ),
          );
        } else if (isObjectField(itemDescriptor)) {
          resolvedRows = await Promise.all(
            rows.map((row) =>
              resolveObjectRecord(
                collectionResource,
                itemDescriptor,
                row,
                undefined,
                state,
                1,
              ),
            ),
          );
        } else if (isUnionField(itemDescriptor)) {
          resolvedRows = await Promise.all(
            rows.map((row) =>
              resolveUnionScalarRecord(row, itemDescriptor, state, 1),
            ),
          );
        }

        return resolvedRows;
      };

      const search = state.pagination.search?.trim().toLowerCase();
      let data: any[];
      let pagination: {
        page: number;
        pageSize: number;
        total: number;
        pageCount: number;
      };

      if (search) {
        const searchRows = await listAllRows(
          collectionResource,
          undefined,
          state,
        );
        const resolvedRows = await resolveRows(searchRows);
        const filteredRows = resolvedRows.filter((row) =>
          JSON.stringify(row).toLowerCase().includes(search),
        );
        if (isFullPageSize(state.pagination.pageSize)) {
          data = filteredRows;
          pagination = createFullPagination(filteredRows.length);
        } else {
          const pageSize = resolveNumericPageSize(state.pagination.pageSize, 10);
          const pageCount = Math.max(
            1,
            Math.ceil(filteredRows.length / pageSize),
          );
          const page = Math.min(
            Math.max(state.pagination.page ?? 1, 1),
            pageCount,
          );
          const start = (page - 1) * pageSize;

          data = filteredRows.slice(start, start + pageSize);
          pagination = {
            page,
            pageSize,
            total: filteredRows.length,
            pageCount,
          };
        }
      } else {
        const result = await queryPaginatedCollection(
          collectionResource,
          undefined,
          {
            ...state.pagination,
            locale: state.pagination.locale ?? state.locale ?? "all",
            filter: state.filter,
          },
          state,
        );

        data = await resolveRows(result.data);
        pagination = result.pagination;
      }

      const projectedData =
        state.projectionFields?.length || state.projectionExclude?.length
          ? data.map((row) =>
              applyProjection(
                row,
                state.projectionFields,
                state.projectionExclude,
                state,
              ),
            )
          : data;

      return {
        data: projectedData,
        pagination,
      };
    },
  };
}
