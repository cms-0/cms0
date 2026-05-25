export type GraphOrderDirection = "asc" | "desc";

export type GraphFieldSelector = string | string[];
export type GraphPageSize = number | "full";

export type GraphPathQueryOptions = {
  page?: number;
  pageSize?: GraphPageSize;
  orderBy?: string;
  orderDir?: GraphOrderDirection;
  search?: string;
  fields?: GraphFieldSelector;
  exclude?: GraphFieldSelector;
};

export type GraphPathQueryMap = Record<string, GraphPathQueryOptions>;

export type GraphQueryOptions = Omit<
  GraphPathQueryOptions,
  "fields" | "exclude"
> & {
  fields?: GraphFieldSelector;
  exclude?: GraphFieldSelector;
  locale?: string;
  maxDepth?: number;
  resolveModelRefs?: boolean;
  paths?: GraphPathQueryMap;
};

export type ParsedGraphPathQueryOptions = Omit<
  GraphPathQueryOptions,
  "fields" | "exclude"
> & {
  fields?: string[];
  exclude?: string[];
};

export type ParsedGraphQueryOptions = Omit<
  GraphQueryOptions,
  "fields" | "exclude" | "paths"
> & {
  fields?: string[];
  exclude?: string[];
  paths?: Record<string, ParsedGraphPathQueryOptions>;
};

const parseListQueryParam = (value: string | null): string[] | undefined => {
  if (!value || !value.trim()) return undefined;
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
};

const normalizeListValue = (
  value: GraphFieldSelector | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item).trim())
      .filter(Boolean);
    return items.length ? items.join(",") : undefined;
  }
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
};

const appendValue = (
  params: URLSearchParams,
  key: string,
  value: string | number | boolean | undefined,
) => {
  if (value === undefined || value === "") return;
  params.set(key, String(value));
};

const appendListValue = (
  params: URLSearchParams,
  key: string,
  value: GraphFieldSelector | undefined,
) => {
  const normalized = normalizeListValue(value);
  if (normalized !== undefined) params.set(key, normalized);
};

const appendPathOptions = (
  params: URLSearchParams,
  prefix: string,
  options: GraphPathQueryOptions,
) => {
  appendValue(params, `${prefix}.page`, options.page);
  appendValue(params, `${prefix}.pageSize`, options.pageSize);
  appendValue(params, `${prefix}.orderBy`, options.orderBy);
  appendValue(params, `${prefix}.orderDir`, options.orderDir);
  appendValue(params, `${prefix}.search`, options.search);
  appendListValue(params, `${prefix}.fields`, options.fields);
  appendListValue(params, `${prefix}.exclude`, options.exclude);
};

const parsePageSizeQueryParam = (
  value: string | null,
): GraphPageSize | undefined => {
  if (!value || !value.trim()) return undefined;
  if (value.trim().toLowerCase() === "full") return "full";
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const appendGraphQueryOptions = (
  params: URLSearchParams,
  options: GraphQueryOptions | undefined,
) => {
  if (!options) return params;

  appendListValue(params, "fields", options.fields);
  appendListValue(params, "exclude", options.exclude);
  appendValue(params, "locale", options.locale);
  appendValue(params, "maxDepth", options.maxDepth);
  appendValue(params, "page", options.page);
  appendValue(params, "pageSize", options.pageSize);
  appendValue(params, "orderBy", options.orderBy);
  appendValue(params, "orderDir", options.orderDir);
  appendValue(params, "search", options.search);
  appendValue(params, "resolveModelRefs", options.resolveModelRefs);

  for (const [path, pathOptions] of Object.entries(options.paths ?? {})) {
    if (!path.trim()) continue;
    appendPathOptions(params, path, pathOptions);
  }

  return params;
};

export const serializeGraphQueryOptions = (
  options: GraphQueryOptions | undefined,
) => appendGraphQueryOptions(new URLSearchParams(), options);

export const parseGraphQueryOptions = (
  searchParams: URLSearchParams,
): ParsedGraphQueryOptions => {
  const paths: Record<string, ParsedGraphPathQueryOptions> = {};

  for (const [key, value] of searchParams.entries()) {
    const match = key.match(
      /^(\w+(?:\.\w+)*)\.(page|pageSize|orderBy|orderDir|search|fields|exclude)$/,
    );
    if (!match) continue;

    const [, path, option] = match;
    if (!path || !option) continue;

    const existing = paths[path] ?? {};
    if (option === "page") {
      paths[path] = { ...existing, [option]: Number(value) };
    } else if (option === "pageSize") {
      paths[path] = {
        ...existing,
        pageSize: parsePageSizeQueryParam(value),
      };
    } else if (option === "orderDir") {
      paths[path] = {
        ...existing,
        orderDir: value === "desc" ? "desc" : "asc",
      };
    } else if (option === "fields" || option === "exclude") {
      paths[path] = {
        ...existing,
        [option]: parseListQueryParam(value),
      };
    } else {
      paths[path] = { ...existing, [option]: value };
    }
  }

  const resolveModelRefsRaw = searchParams.get("resolveModelRefs");
  const maxDepthRaw = searchParams.get("maxDepth");
  const pageRaw = searchParams.get("page");
  const pageSizeRaw = searchParams.get("pageSize");
  const orderDirRaw = searchParams.get("orderDir");

  return {
    locale: searchParams.get("locale") ?? undefined,
    resolveModelRefs:
      resolveModelRefsRaw === null
        ? undefined
        : resolveModelRefsRaw !== "false" && resolveModelRefsRaw !== "0",
    maxDepth: maxDepthRaw ? Number(maxDepthRaw) : undefined,
    page: pageRaw ? Number(pageRaw) : undefined,
    pageSize: parsePageSizeQueryParam(pageSizeRaw),
    orderBy: searchParams.get("orderBy") ?? undefined,
    orderDir:
      orderDirRaw === null
        ? undefined
        : ((orderDirRaw === "desc" ? "desc" : "asc") as GraphOrderDirection),
    search: searchParams.get("search") ?? undefined,
    fields: parseListQueryParam(searchParams.get("fields")),
    exclude: parseListQueryParam(searchParams.get("exclude")),
    paths: Object.keys(paths).length > 0 ? paths : undefined,
  };
};

export const resolveGraphPathQueryOptions = <
  TOptions extends ParsedGraphPathQueryOptions,
>(
  defaults: TOptions,
  paths: Record<string, TOptions> | undefined,
  fieldPath: string,
): TOptions => {
  const resolved: TOptions = { ...defaults };
  if (!paths) return resolved;

  const tokens = fieldPath.split(".").filter(Boolean);
  for (let index = 1; index <= tokens.length; index += 1) {
    const path = tokens.slice(0, index).join(".");
    const options = paths[path];
    if (options) Object.assign(resolved, options);
  }

  return resolved;
};
