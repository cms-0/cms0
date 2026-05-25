import { camelCase, snakeCase } from "lodash";
import { z, type ZodTypeAny } from "zod";
import {
  CMS0_UNION_META_KEY,
  getUnionBranchKeys,
  type FieldDescriptor,
  type PrimitiveType,
} from "@cms0/shared";
import type { TableSpec } from "./types";

const PRIMITIVE_DESCRIPTOR_TYPES = new Set<PrimitiveType>([
  "string",
  "number",
  "boolean",
  "json",
]);

/**
 * Resolve a table from the generated schema export names.
 * The schema object is passed explicitly (no singleton import).
 */
export function resolveTable(
  schema: Record<string, unknown>,
  name: string,
): TableSpec | null {
  const key = findTableKey(schema, name);
  if (!key) return null;
  const table = schema[key];
  if (!table) return null;
  return { name: key, table: table as any };
}

function canonicalizeTableKey(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findTableKey(
  tables: Record<string, unknown>,
  name: string,
): string | null {
  const candidates = new Set<string>([name, camelCase(name), snakeCase(name)]);
  const candidateCanonical = new Set(
    Array.from(candidates).map((value) => canonicalizeTableKey(value)),
  );

  const exact = Object.keys(tables).find((key) => candidates.has(key));
  if (exact) return exact;

  return (
    Object.keys(tables).find((key) =>
      candidateCanonical.has(canonicalizeTableKey(key)),
    ) ?? null
  );
}

/**
 * Convert descriptor field name to database column name.
 */
export function descriptorPrimitiveTypeToColumnName(colName: string): string {
  return camelCase(colName);
}

/**
 * Capitalize first letter of string.
 */
export function capitalize(str: string): string {
  return str.length ? `${str[0]?.toUpperCase()}${str.slice(1)}` : str;
}

/**
 * Find a column in a table from a list of candidates.
 */
export function findColumn(tbl: any, candidates: string[]): string | undefined {
  return candidates.find(
    (c) => tbl?.[c] !== undefined || tbl?.columns?.[c] !== undefined,
  );
}

export function resolveModelRefColumnCandidates(
  propName: string,
  modelName: string,
): string[] {
  return Array.from(
    new Set([
      `${camelCase(propName)}Id`,
      `${snakeCase(propName)}_id`,
      `${camelCase(modelName)}Id`,
      `${snakeCase(modelName)}_id`,
    ]),
  );
}

export function readModelRefForeignKey(
  source: Record<string, unknown> | null | undefined,
  propName: string,
  modelName: string,
): unknown {
  if (!source) return undefined;
  for (const key of resolveModelRefColumnCandidates(propName, modelName)) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }
  return undefined;
}

/**
 * Resolve a modelRef foreign-key column from the generated table shape.
 *
 * The descriptor property is authoritative (`icon` should hydrate/write
 * `icon`) and current generated storage uses that property (`iconId`).
 * The target-model candidate (`imageId`) is retained only as a legacy
 * fallback for schemas generated during the bad target-model-column period.
 */
export function resolveModelRefColumnName(
  tbl: any,
  propName: string,
  modelName: string,
): string {
  const candidates = resolveModelRefColumnCandidates(propName, modelName);

  return findColumn(tbl, candidates) ?? `${camelCase(propName)}Id`;
}

/**
 * Resolve the ordering column for collection rows.
 */
export function resolveOrderColumn(tbl: any): any {
  return tbl?.orderIndex ?? tbl?.order_index ?? tbl?.id;
}

/**
 * Resolve a column by name from a table.
 */
export function resolveColumnByName(tbl: any, colName: string): any {
  if (tbl?.[colName] !== undefined) return tbl[colName];
  const camel = camelCase(colName);
  if (tbl?.[camel] !== undefined) return tbl[camel];
  const snake = snakeCase(colName);
  if (tbl?.[snake] !== undefined) return tbl[snake];
  return undefined;
}

export function isArrayField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { type: "array"; items: FieldDescriptor }> {
  return (desc as any).type === "array" && (desc as any).items !== undefined;
}

export function isObjectField(
  desc: FieldDescriptor,
): desc is Extract<
  FieldDescriptor,
  { type: "object"; properties: Record<string, FieldDescriptor> }
> {
  return (
    (desc as any).type === "object" && (desc as any).properties !== undefined
  );
}

export function isEnumField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "enum" }> {
  return (desc as any).kind === "enum" && Array.isArray((desc as any).values);
}

export function isUnionField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "union" }> {
  return (desc as any).kind === "union" && Array.isArray((desc as any).anyOf);
}

export function isScalarField(
  desc: FieldDescriptor,
): desc is Extract<FieldDescriptor, { kind: "primitive" | "enum" | "union" }> {
  return (
    (desc as any).kind === "primitive" ||
    PRIMITIVE_DESCRIPTOR_TYPES.has((desc as any).type as PrimitiveType) ||
    isEnumField(desc) ||
    isUnionField(desc)
  );
}

export function scalarFieldType(
  desc: FieldDescriptor,
): PrimitiveType | undefined {
  const type = (desc as any).type as PrimitiveType | undefined;

  if (
    (desc as any).kind === "primitive" ||
    PRIMITIVE_DESCRIPTOR_TYPES.has(type as PrimitiveType)
  ) {
    return type;
  }
  if (isEnumField(desc)) {
    return ((desc as any).valueType ?? "string") as PrimitiveType;
  }
  if (isUnionField(desc)) {
    return "json";
  }
  return undefined;
}

const LOCALIZED_CUSTOM_TYPES = new Set([
  "LocalizedString",
  "LocalizedRichText",
]);

const ASSET_CUSTOM_TYPES = new Set(["Image", "File"]);

const SEO_LOCALE_KEY_REGEX =
  /^(x-default|[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLikelyHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isLikelyPathUrl(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

function isValidSeoUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  if (!normalized || /\s/.test(normalized)) return false;
  return isLikelyHttpUrl(normalized) || isLikelyPathUrl(normalized);
}

function addSeoIssue(
  ctx: z.RefinementCtx,
  path: (string | number)[],
  message: string,
) {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
}

function validateLocalizedStringLike(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (value == null || typeof value === "string") return;
  if (!isRecord(value)) return;
  if (!("locales" in value)) return;

  const locales = value.locales;
  if (!isRecord(locales)) {
    addSeoIssue(ctx, [...path, "locales"], "Expected locales to be an object.");
    return;
  }

  for (const [localeKey, localeValue] of Object.entries(locales)) {
    if (!SEO_LOCALE_KEY_REGEX.test(localeKey)) {
      addSeoIssue(
        ctx,
        [...path, "locales", localeKey],
        "Invalid locale key format.",
      );
    }
    if (typeof localeValue !== "string") {
      addSeoIssue(
        ctx,
        [...path, "locales", localeKey],
        "Expected localized value to be a string.",
      );
    }
  }

  const defaultLocale = value.defaultLocale;
  if (typeof defaultLocale === "string" && defaultLocale.trim().length > 0) {
    if (!SEO_LOCALE_KEY_REGEX.test(defaultLocale)) {
      addSeoIssue(
        ctx,
        [...path, "defaultLocale"],
        "Invalid defaultLocale format.",
      );
    } else if (!Object.prototype.hasOwnProperty.call(locales, defaultLocale)) {
      addSeoIssue(
        ctx,
        [...path, "defaultLocale"],
        "defaultLocale must exist in locales map.",
      );
    }
  }
}

function validateSeoUrlField(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (value == null || value === "") return;
  if (!isValidSeoUrl(value)) {
    addSeoIssue(
      ctx,
      path,
      "Expected a valid URL (http/https) or absolute path (/...).",
    );
  }
}

function validateSeoLanguagesMap(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (value == null) return;
  if (!isRecord(value)) {
    addSeoIssue(ctx, path, "Expected languages to be an object map.");
    return;
  }

  for (const [localeKey, localeUrl] of Object.entries(value)) {
    if (!SEO_LOCALE_KEY_REGEX.test(localeKey)) {
      addSeoIssue(ctx, [...path, localeKey], "Invalid locale key format.");
    }
    validateSeoUrlField(localeUrl, [...path, localeKey], ctx);
  }
}

function validateSeoImageList(
  value: unknown,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (!Array.isArray(value)) return;
  value.forEach((entry, index) => {
    if (typeof entry === "string") {
      validateSeoUrlField(entry, [...path, index], ctx);
      return;
    }
    if (isRecord(entry)) {
      const url = entry.url;
      if (typeof url === "string") {
        validateSeoUrlField(url, [...path, index, "url"], ctx);
      }
    }
  });
}

function validateSeoPayload(value: unknown, ctx: z.RefinementCtx) {
  if (!isRecord(value)) return;

  validateLocalizedStringLike(value.title, ["title"], ctx);
  validateLocalizedStringLike(value.description, ["description"], ctx);
  validateLocalizedStringLike(value.keywords, ["keywords"], ctx);

  validateSeoUrlField(value.canonical, ["canonical"], ctx);

  if (isRecord(value.alternates)) {
    validateSeoUrlField(
      value.alternates.canonical,
      ["alternates", "canonical"],
      ctx,
    );
    validateSeoLanguagesMap(
      value.alternates.languages,
      ["alternates", "languages"],
      ctx,
    );
  }

  if (isRecord(value.openGraph)) {
    validateSeoUrlField(value.openGraph.url, ["openGraph", "url"], ctx);
    validateLocalizedStringLike(
      value.openGraph.title,
      ["openGraph", "title"],
      ctx,
    );
    validateLocalizedStringLike(
      value.openGraph.description,
      ["openGraph", "description"],
      ctx,
    );
    validateSeoImageList(value.openGraph.images, ["openGraph", "images"], ctx);
  }

  if (isRecord(value.twitter)) {
    validateLocalizedStringLike(value.twitter.title, ["twitter", "title"], ctx);
    validateLocalizedStringLike(
      value.twitter.description,
      ["twitter", "description"],
      ctx,
    );
    validateSeoImageList(value.twitter.images, ["twitter", "images"], ctx);
  }
}

export function isLocalizedCustomType(desc: FieldDescriptor) {
  return LOCALIZED_CUSTOM_TYPES.has((desc as any)?.customType);
}

export function isAssetCustomType(desc: FieldDescriptor) {
  return ASSET_CUSTOM_TYPES.has((desc as any)?.customType);
}

export function isModelRefCustomType(desc: FieldDescriptor) {
  return (
    (desc as any)?.kind === "modelRef" ||
    (desc as any)?.customType === "ModelRef"
  );
}

export function makePrimitiveSetter(
  colName: string,
  type: PrimitiveType,
  value: unknown,
) {
  const v: any = value;
  switch (type) {
    case "string":
      return { [colName]: typeof v === "string" ? v : String(v ?? "") };
    case "number":
      return { [colName]: typeof v === "number" ? v : Number(v ?? 0) };
    case "boolean":
      return { [colName]: Boolean(v) };
    case "json":
      return { [colName]: v };
  }
}

export function makeScalarSetter(
  colName: string,
  descriptor: FieldDescriptor,
  value: unknown,
) {
  const scalarType = scalarFieldType(descriptor) ?? "json";
  return makePrimitiveSetter(colName, scalarType, value);
}

export function descriptorToZod(
  desc: FieldDescriptor,
  modelZodSchemas: Record<string, ZodTypeAny>,
  opts: { loose?: boolean; allowModelRefId?: boolean } = {},
): ZodTypeAny {
  const applyOptionality = (sch: ZodTypeAny) => {
    let out = sch;
    if (desc.nullable || opts.loose) out = out.nullable();
    if (desc.optional || opts.loose) out = out.optional();
    return out;
  };

  const primitiveType = scalarFieldType(desc);
  if (primitiveType && !isEnumField(desc) && !isUnionField(desc)) {
    switch (primitiveType) {
      case "string":
        return applyOptionality(z.string());
      case "number":
        return applyOptionality(z.number());
      case "boolean":
        return applyOptionality(z.boolean());
      case "json":
        return applyOptionality(z.any());
    }
  }

  if (desc.kind === "enum") {
    const values = Array.isArray(desc.values) ? desc.values : [];
    const valueType = (desc.valueType ?? "string") as
      | "string"
      | "number"
      | "boolean";

    if (!values.length) {
      if (valueType === "number") return applyOptionality(z.number());
      if (valueType === "boolean") return applyOptionality(z.boolean());
      return applyOptionality(z.string());
    }

    if (valueType === "string") {
      const normalized = values
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (!normalized.length) return applyOptionality(z.string());
      const unique = Array.from(new Set(normalized));
      const [first, ...rest] = unique;
      if (!first) return applyOptionality(z.string());
      return applyOptionality(z.enum([first, ...rest]));
    }

    if (valueType === "number") {
      const normalized = values.filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value),
      );
      if (!normalized.length) return applyOptionality(z.number());
      const unique = Array.from(new Set(normalized));
      const literals = unique.map((value) => z.literal(value));
      if (!literals.length) return applyOptionality(z.number());
      if (literals.length === 1) return applyOptionality(literals[0]!);
      const [first, second, ...rest] = literals;
      return applyOptionality(
        z.union([
          first!,
          second!,
          ...(rest as [z.ZodLiteral<number>, ...z.ZodLiteral<number>[]]),
        ]),
      );
    }

    const normalized = values.filter(
      (value): value is boolean => typeof value === "boolean",
    );
    if (!normalized.length) return applyOptionality(z.boolean());
    if (normalized.includes(true) && normalized.includes(false)) {
      return applyOptionality(z.boolean());
    }
    return applyOptionality(z.literal(normalized[0]!));
  }

  if (desc.kind === "union") {
    const branchDescriptors = Array.isArray(desc.anyOf) ? desc.anyOf : [];
    const branchSchemas = branchDescriptors.map((branch) =>
      descriptorToZod(branch, modelZodSchemas, opts),
    );
    if (!branchSchemas.length) {
      return applyOptionality(z.any());
    }

    const branchKeys = getUnionBranchKeys(desc);
    const keySchema =
      branchKeys.length >= 2
        ? z.enum([
            branchKeys[0]!,
            branchKeys[1]!,
            ...(branchKeys.slice(2) as [string, ...string[]]),
          ])
        : branchKeys.length === 1
          ? z.literal(branchKeys[0]!)
          : z.string().min(1);

    const envelope = z
      .object({
        [CMS0_UNION_META_KEY]: z.object({ branchKey: keySchema }),
        value: z.any(),
      })
      .superRefine((input, ctx) => {
        const branchKey = input[CMS0_UNION_META_KEY]?.branchKey;
        const branchIndex = branchKeys.findIndex((key) => key === branchKey);
        if (branchIndex < 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [CMS0_UNION_META_KEY, "branchKey"],
            message: "Unknown union branchKey.",
          });
          return;
        }

        const branchSchema = branchSchemas[branchIndex];
        if (!branchSchema) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [CMS0_UNION_META_KEY, "branchKey"],
            message: "Missing schema for union branch.",
          });
          return;
        }

        const parsed = branchSchema.safeParse(input.value);
        if (parsed.success) return;

        const formatted =
          typeof parsed.error?.format === "function"
            ? parsed.error.format()
            : parsed.error;
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["value"],
          message: `Invalid union value for branch '${branchKey}': ${JSON.stringify(
            formatted,
          )}`,
        });
      });

    return applyOptionality(envelope);
  }

  if (desc.kind === "modelRef") {
    let sch = modelZodSchemas[desc.model] ?? z.any();
    if (sch instanceof z.ZodObject) {
      sch = (sch as any).passthrough();
    }
    const acceptsNull = Boolean(desc.nullable || desc.optional || opts.loose);
    const withId =
      opts.allowModelRefId || opts.loose
        ? z.union([
            sch,
            z.string(),
            z.object({ id: z.string() }).passthrough(),
            ...(acceptsNull ? [z.null()] : []),
          ])
        : sch;
    return applyOptionality(withId);
  }

  if ((desc as any).type === "object" && (desc as any).properties) {
    const shape: Record<string, ZodTypeAny> = {};
    for (const [key, valueDesc] of Object.entries(
      (desc as any).properties ?? {},
    )) {
      const fieldDesc = valueDesc as FieldDescriptor;
      const isNestedCollection =
        (fieldDesc as any).type === "array" ||
        (fieldDesc as any).type === "object";
      const nestedOpts =
        isNestedCollection && opts.allowModelRefId
          ? { ...opts, loose: true }
          : opts;

      shape[key] = descriptorToZod(fieldDesc, modelZodSchemas, nestedOpts);
    }
    const base = opts.loose
      ? z.object(shape).partial().passthrough()
      : z.object(shape).passthrough();
    if ((desc as any)?.customType === "Seo") {
      return applyOptionality(
        base.superRefine((value, ctx) => validateSeoPayload(value, ctx)),
      );
    }
    return applyOptionality(base);
  }

  if ((desc as any).type === "array" && (desc as any).items) {
    const arr = z.array(
      descriptorToZod(
        (desc as any).items as FieldDescriptor,
        modelZodSchemas,
        opts,
      ),
    );
    return applyOptionality(arr);
  }

  return applyOptionality(z.any());
}

export function sanitizeResponse(row: any, raw: boolean): any {
  if (raw || !row) return row;

  const cleaned = { ...row };

  for (const key of Object.keys(cleaned)) {
    if (key !== "id" && (key.endsWith("Id") || key.endsWith("_id"))) {
      delete cleaned[key];
    }
  }

  delete cleaned.orderIndex;
  delete cleaned.order_index;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.created_at;
  delete cleaned.updated_at;

  return cleaned;
}

export function parseParentIdParam(value: any): {
  id: string | undefined;
  shouldCreateParent: boolean;
} {
  if (value === undefined || value === null || value === "") {
    return { id: undefined, shouldCreateParent: false };
  }

  if (value === "undefined") {
    return { id: undefined, shouldCreateParent: true };
  }

  if (typeof value === "string" && value.length > 0) {
    return { id: value, shouldCreateParent: false };
  }

  return { id: undefined, shouldCreateParent: false };
}

export function parseRawQueryParam(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => parseRawQueryParam(entry));
  }

  if (value === true) return true;
  if (value === false || value === null || value === undefined) return false;

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return false;
    if (normalized === "1" || normalized === "true") return true;
    if (normalized === "0" || normalized === "false") return false;
    if (normalized === "yes" || normalized === "on") return true;
    if (normalized === "no" || normalized === "off") return false;
    return true;
  }

  return Boolean(value);
}
