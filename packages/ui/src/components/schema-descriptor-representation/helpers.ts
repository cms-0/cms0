"use client";

import type {
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
} from "@cms0/admin-contract";

export type ObjectValue = Record<string, unknown>;
export type AssetKind = "file" | "image" | "video";

export const isRecord = (value: unknown): value is ObjectValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const toCamelCase = (value: string) =>
  value
    .replace(/[-_\s]+(.)?/g, (_, captured: string | undefined) =>
      captured ? captured.toUpperCase() : "",
    )
    .replace(/^(.)/, (char) => char.toLowerCase());

export const toSnakeCase = (value: string) =>
  value.replace(/([A-Z])/g, "_$1").toLowerCase();

export const toTitle = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

export type ModelRefResolution = {
  id?: string | number;
  modelObject?: Record<string, unknown>;
  error?: string;
  candidateKeys?: string[];
};

export function isModelRefIdentity(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim().length > 0;
  return false;
}

export function resolveModelRefFromItem(
  item: unknown,
  modelName?: string,
): ModelRefResolution {
  if (item == null) {
    return {};
  }

  if (isModelRefIdentity(item)) {
    return { id: item };
  }

  if (!isRecord(item)) {
    return { error: "Unsupported modelRef row shape." };
  }

  const modelNameCamel = modelName ? toCamelCase(modelName) : undefined;
  const candidateKeys: string[] = [];
  let namedFkValue: string | number | undefined;
  let namedFkKey: string | undefined;

  if (modelNameCamel) {
    const camelFk = `${modelNameCamel}Id`;
    const snakeFk = `${toSnakeCase(modelNameCamel)}_id`;
    if (isModelRefIdentity(item[camelFk])) {
      namedFkKey = camelFk;
      namedFkValue = item[camelFk];
      candidateKeys.push(camelFk);
    } else if (isModelRefIdentity(item[snakeFk])) {
      namedFkKey = snakeFk;
      namedFkValue = item[snakeFk];
      candidateKeys.push(snakeFk);
    }
  }

  const modelObject =
    modelNameCamel && isRecord(item[modelNameCamel])
      ? (item[modelNameCamel] as Record<string, unknown>)
      : undefined;

  const expandedId = isModelRefIdentity(modelObject?.id)
    ? (modelObject.id as string | number)
    : undefined;

  if (
    namedFkValue != null &&
    expandedId != null &&
    String(namedFkValue) !== String(expandedId)
  ) {
    return {
      error: `Ambiguous linked model identity (${namedFkKey} does not match expanded model id).`,
      modelObject,
      candidateKeys,
    };
  }

  let resolvedId = namedFkValue ?? expandedId;

  if (resolvedId == null && !modelNameCamel && isModelRefIdentity(item.id)) {
    resolvedId = item.id;
    candidateKeys.push("id");
  }

  if (resolvedId == null && modelNameCamel) {
    const fallbackCandidates = Object.entries(item).filter(
      ([key, value]) =>
        key !== "id" &&
        key !== `${modelNameCamel}Id` &&
        key !== `${toSnakeCase(modelNameCamel)}_id` &&
        (key.endsWith("Id") || key.endsWith("_id")) &&
        isModelRefIdentity(value),
    );

    if (fallbackCandidates.length === 1) {
      const [key, value] = fallbackCandidates[0]!;
      resolvedId = value as string | number;
      candidateKeys.push(key);
    } else if (fallbackCandidates.length > 1) {
      return {
        error:
          "Ambiguous linked model identity (multiple candidate foreign keys found).",
        modelObject,
        candidateKeys: fallbackCandidates.map(([key]) => key),
      };
    }
  }

  if (resolvedId == null) {
    return {
      error: "Unable to resolve linked model identity from row payload.",
      modelObject,
      candidateKeys,
    };
  }

  return {
    id: resolvedId,
    modelObject,
    candidateKeys,
  };
}

export const readUnionBranches = (descriptor: SchemaDescriptor) => {
  const anyOf = Array.isArray(descriptor.anyOf) ? descriptor.anyOf : [];
  const branchKeys = Array.isArray(descriptor.branchKeys)
    ? descriptor.branchKeys.map((entry) => String(entry))
    : [];

  return anyOf
    .map((entry, index) => {
      if (!isRecord(entry)) {
        return null;
      }

      return {
        descriptor: entry as SchemaDescriptor,
        key: branchKeys[index] ?? `branch_${index}`,
      };
    })
    .filter((entry): entry is { descriptor: SchemaDescriptor; key: string } =>
      Boolean(entry),
    );
};

export const readUnionLabel = (descriptor: SchemaDescriptor) =>
  String(
    descriptor.customType ??
      descriptor.model ??
      descriptor.type ??
      descriptor.kind ??
      "value",
  );

export const isDescriptorRequired = (descriptor: SchemaDescriptor) =>
  descriptor.optional !== true && descriptor.nullable !== true;

export type GraphMutationOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "insert"; path: string; value: unknown }
  | { op: "delete"; path: string }
  | { op: "deleteById"; path: string; id: string }
  | { op: "updateById"; path: string; id: string; value: unknown };

export const DEFAULT_NESTED_SECTION_OPEN = true;
export const DEFAULT_SEO_SECTION_OPEN = false;

export const shouldDefaultOpenNestedSection = (
  descriptor: SchemaDescriptor,
) => {
  if (descriptor.customType === "Seo") {
    return DEFAULT_SEO_SECTION_OPEN;
  }

  return DEFAULT_NESTED_SECTION_OPEN;
};

export const resolveModelDescriptorFromSnapshot = (
  snapshot: SchemaDescriptorSnapshot | null | undefined,
  modelName: string,
): SchemaDescriptor | null => {
  if (!snapshot || modelName.trim().length === 0) {
    return null;
  }

  const descriptorRoot = snapshot.descriptor;
  if (!isRecord(descriptorRoot) || !isRecord(descriptorRoot.models)) {
    return null;
  }

  const descriptor = descriptorRoot.models[modelName];
  return isRecord(descriptor) ? (descriptor as SchemaDescriptor) : null;
};

export const inferAssetKindFromFilename = (
  filename: string | null | undefined,
): AssetKind | null => {
  if (!filename) {
    return null;
  }

  const normalized = filename.trim();
  if (normalized.length === 0) {
    return null;
  }

  if (/\.(mp4|webm|mov|m4v|mkv|avi)$/i.test(normalized)) {
    return "video";
  }

  if (/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(normalized)) {
    return "image";
  }

  return "file";
};

export const resolveAssetKindFromModelDescriptor = (
  modelName: string | undefined,
  modelDescriptor: SchemaDescriptor | null | undefined,
): AssetKind | null => {
  const presentation = isRecord(modelDescriptor?.presentation)
    ? (modelDescriptor.presentation as Record<string, unknown>)
    : null;

  if (presentation?.kind === "asset") {
    const assetKind = presentation.assetKind;
    if (
      assetKind === "image" ||
      assetKind === "video" ||
      assetKind === "file"
    ) {
      return assetKind;
    }

    return "file";
  }

  const normalizedModelName = (modelName ?? "").trim().toLowerCase();
  if (normalizedModelName === "image") return "image";
  if (normalizedModelName === "video") return "video";
  if (normalizedModelName === "file") return "file";
  return null;
};

export const resolveAssetKindFromDescriptor = (
  descriptor: SchemaDescriptor | null | undefined,
  schemaSnapshot?: SchemaDescriptorSnapshot | null,
): AssetKind | null => {
  if (!descriptor) {
    return null;
  }

  if (descriptor.customType === "Image") return "image";
  if (descriptor.customType === "Video") return "video";
  if (descriptor.customType === "File") return "file";

  if (descriptor.kind === "modelRef") {
    const modelName =
      typeof descriptor.model === "string" ? descriptor.model : undefined;
    const modelDescriptor = modelName
      ? resolveModelDescriptorFromSnapshot(schemaSnapshot, modelName)
      : null;
    return resolveAssetKindFromModelDescriptor(modelName, modelDescriptor);
  }

  return resolveAssetKindFromModelDescriptor(undefined, descriptor);
};

export const isAssetDescriptor = (
  descriptor: SchemaDescriptor | null | undefined,
  schemaSnapshot?: SchemaDescriptorSnapshot | null,
) => resolveAssetKindFromDescriptor(descriptor, schemaSnapshot) != null;

export const normalizeObjectDescriptor = (
  descriptor: SchemaDescriptor | null | undefined,
): SchemaDescriptor | null => {
  if (!descriptor) {
    return null;
  }

  if (!isRecord(descriptor.properties) && isRecord(descriptor.items)) {
    return normalizeObjectDescriptor(descriptor.items as SchemaDescriptor);
  }

  if (!isRecord(descriptor.properties)) {
    return null;
  }

  return {
    ...descriptor,
    type: "object",
    properties: descriptor.properties as Record<string, SchemaDescriptor>,
    required: Array.isArray(descriptor.required) ? descriptor.required : [],
    propertyOrder: Array.isArray(descriptor.propertyOrder)
      ? descriptor.propertyOrder
      : undefined,
  } as SchemaDescriptor;
};

/**
 * Recursively compares `initial` and `current` objects and generates a list of
 * JSON-Pointer style `set` ops for every leaf value that changed.
 *
 * This is the building block for dirty-path batching: instead of replacing an
 * entire singleton document we only send the changed paths.
 */
export function valueToOps(
  initial: unknown,
  current: unknown,
  prefix = "",
): Array<Extract<GraphMutationOp, { op: "set" }>> {
  if (current === initial) return [];

  if (
    Array.isArray(initial) &&
    Array.isArray(current) &&
    initial.length === current.length
  ) {
    const ops: Array<Extract<GraphMutationOp, { op: "set" }>> = [];
    for (let i = 0; i < current.length; i++) {
      ops.push(...valueToOps(initial[i], current[i], `${prefix}/${i}`));
    }
    return ops;
  }

  if (
    isRecord(initial) &&
    isRecord(current) &&
    Object.keys(initial).length === Object.keys(current).length
  ) {
    const ops: Array<Extract<GraphMutationOp, { op: "set" }>> = [];
    for (const key of Object.keys(current)) {
      ops.push(...valueToOps(initial[key], current[key], `${prefix}/${key}`));
    }
    return ops;
  }

  // Primitive change or structural change (array length / object keys)
  return [{ op: "set", path: prefix || "/", value: current }];
}

/**
 * Applies a JSON Pointer path set operation to an immutable document.
 * Used to surgically patch the React Query cache after a graph mutation
 * without triggering a full document refetch.
 */
export function applySetOpToDocument(
  doc: unknown,
  jsonPointerPath: string,
  value: unknown,
): unknown {
  const segments = jsonPointerPath.split("/").filter(Boolean);
  if (segments.length === 0) return value;
  if (!isRecord(doc)) return doc;
  const [head, ...rest] = segments;
  return {
    ...doc,
    [head!]:
      rest.length === 0
        ? value
        : applySetOpToDocument(doc[head!], "/" + rest.join("/"), value),
  };
}

export const readFieldType = (descriptor: SchemaDescriptor): string => {
  if (descriptor.kind === "modelRef") {
    return "modelRef";
  }

  if (descriptor.kind === "union") {
    return "union";
  }

  if (descriptor.customType === "LocalizedRichText") {
    return "localizedRichText";
  }

  if (descriptor.customType === "LocalizedString") {
    return "localizedString";
  }

  if (descriptor.customType === "RichText" && descriptor.type === "string") {
    return "richText";
  }

  if (descriptor.type === "array") {
    return "array";
  }

  if (descriptor.type === "object" || isRecord(descriptor.properties)) {
    return "object";
  }

  if (
    descriptor.kind === "enum" ||
    (Array.isArray(descriptor.values) &&
      (descriptor.values as unknown[]).length > 0) ||
    (Array.isArray(descriptor.enum) &&
      (descriptor.enum as unknown[]).length > 0)
  ) {
    return "enum";
  }

  if (descriptor.type === "json") {
    return "json";
  }

  return String(descriptor.type ?? "string");
};

export const hasMeaningfulValue = (
  value: unknown,
  fieldType: string,
): boolean => {
  if (fieldType === "boolean") {
    return typeof value === "boolean";
  }
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
};

export type LocaleConfig = {
  defaultLocale: string;
  locales: string[];
};

export const extractLocaleConfigFromSnapshot = (
  snapshot: SchemaDescriptorSnapshot | null | undefined,
): LocaleConfig | null => {
  if (!snapshot || !isRecord(snapshot.descriptor)) return null;
  const desc = snapshot.descriptor as Record<string, unknown>;
  for (const key of ["localization", "config", "i18n"]) {
    const section = isRecord(desc[key])
      ? (desc[key] as Record<string, unknown>)
      : null;
    if (!section) continue;
    const localeList = Array.isArray(section.locales)
      ? (section.locales as unknown[]).filter(
          (l): l is string => typeof l === "string",
        )
      : null;
    const defaultLocale =
      typeof section.defaultLocale === "string" ? section.defaultLocale : null;
    if (localeList && localeList.length > 0) {
      return {
        defaultLocale: defaultLocale ?? localeList[0]!,
        locales: localeList,
      };
    }
  }
  return null;
};

export const createDescriptorDefault = (
  descriptor: SchemaDescriptor,
  localeConfig?: LocaleConfig | null,
): unknown => {
  const fieldType = readFieldType(descriptor);

  switch (fieldType) {
    case "array":
      return [];
    case "boolean":
      return false;
    case "modelRef":
      return null;
    case "number":
      return 0;
    case "localizedRichText":
      // Viewport-based locales (desktop/mobile) for responsive rich text.
      return {
        desktop: { html: "", value: { type: "doc", content: [] } },
        mobile: { html: "", value: { type: "doc", content: [] } },
      };
    case "localizedString": {
      const meta = isRecord(descriptor.metadata)
        ? (descriptor.metadata as Record<string, unknown>)
        : null;
      const metaLocales = Array.isArray(meta?.locales)
        ? (meta!.locales as unknown[]).filter(
            (l): l is string => typeof l === "string",
          )
        : null;
      const metaDefault =
        typeof meta?.defaultLocale === "string"
          ? (meta!.defaultLocale as string)
          : null;
      const effectiveDefault =
        localeConfig?.defaultLocale ?? metaDefault ?? "en";
      const effectiveLocales =
        localeConfig?.locales ?? metaLocales ?? [effectiveDefault];
      return {
        defaultLocale: effectiveDefault,
        locales: Object.fromEntries(effectiveLocales.map((l) => [l, ""])),
      };
    }
    case "union": {
      const branches = readUnionBranches(descriptor);
      if (branches.length === 0) return null;
      const first = branches[0]!;
      return {
        __cms0Union: { branchKey: first.key },
        value: createDescriptorDefault(first.descriptor, localeConfig),
      };
    }
    case "object": {
      const properties = isRecord(descriptor.properties)
        ? descriptor.properties
        : {};
      return Object.fromEntries(
        Object.entries(properties).map(([key, value]) => [
          key,
          createDescriptorDefault(
            isRecord(value) ? (value as SchemaDescriptor) : {},
            localeConfig,
          ),
        ]),
      );
    }
    case "enum": {
      const valuesArr = descriptor.values as
        | Array<{ value?: unknown }>
        | undefined;
      if (Array.isArray(valuesArr) && valuesArr.length > 0) {
        return valuesArr[0]!.value ?? "";
      }
      return Array.isArray(descriptor.enum)
        ? ((descriptor.enum as unknown[])[0] ?? "")
        : "";
    }
    case "json":
      return null;
    default:
      return "";
  }
};

export const materializeDescriptorRecord = (
  value: unknown,
  descriptor: SchemaDescriptor,
): Record<string, unknown> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }

  const wrappedValue = isRecord(value.value) ? value.value : undefined;
  if (!wrappedValue) {
    return value;
  }

  const properties = isRecord(descriptor.properties)
    ? (descriptor.properties as Record<string, unknown>)
    : {};
  const propertyKeys = Object.keys(properties);

  if (propertyKeys.length === 0) {
    return {
      ...value,
      ...wrappedValue,
    };
  }

  const hasDirectProperty = propertyKeys.some((key) =>
    Object.hasOwn(value, key),
  );
  const hasWrappedProperty = propertyKeys.some((key) =>
    Object.hasOwn(wrappedValue, key),
  );

  if (!hasDirectProperty && hasWrappedProperty) {
    return {
      ...value,
      ...wrappedValue,
    };
  }

  return value;
};

export const unwrapDescriptorFormValue = (
  value: unknown,
  descriptor: SchemaDescriptor,
): unknown => {
  const materialized = materializeDescriptorRecord(value, descriptor);
  if (materialized) {
    const properties = isRecord(descriptor.properties)
      ? (descriptor.properties as Record<string, unknown>)
      : {};
    const propertyKeys = Object.keys(properties);

    if (
      propertyKeys.length > 0 &&
      propertyKeys.some((key) => Object.hasOwn(materialized, key))
    ) {
      return Object.fromEntries(
        propertyKeys.map((key) => [key, materialized[key]]),
      );
    }
  }

  if (
    isRecord(value) &&
    isRecord(value.value) &&
    descriptor.type !== "array" &&
    descriptor.kind !== "modelRef"
  ) {
    return value.value;
  }

  return value;
};
