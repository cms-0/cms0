"use client";

import React from "react";
import { FileIcon } from "lucide-react";

import type { SchemaDescriptor } from "@cms0/admin-contract";

import { isRecord, readUnionBranches } from "./helpers";

export type AssetKind = "file" | "image" | "video";

export type DescriptorShapeKey =
  | "primitive:string"
  | "primitive:number"
  | "primitive:boolean"
  | "primitive:json"
  | "kind:enum"
  | "kind:union"
  | "custom:RichText"
  | "custom:LocalizedString"
  | "custom:LocalizedRichText"
  | "kind:modelRef"
  | "type:object"
  | "type:array"
  | "unknown";

type SelectionOption = {
  id: string | number;
  label: string;
  labelValue?: unknown;
  filename?: string;
  url?: string;
  alt?: string;
};

type ColumnRepresentationProps = {
  asset?: {
    kind: AssetKind;
    filename?: string;
    url?: string;
    alt?: string;
  };
  defaultLocale?: string;
  descriptor?: SchemaDescriptor;
  value: unknown;
};

type SelectionOptionRepresentationProps = {
  assetKind?: AssetKind | null;
  compact?: boolean;
  defaultLocale?: string;
  descriptor?: SchemaDescriptor;
  option: SelectionOption;
};

type DescriptorRepresentationComponent<Props> = (
  props: Props,
) => React.ReactNode;

function isUnionDescriptor(
  descriptor: SchemaDescriptor | undefined,
): descriptor is SchemaDescriptor & {
  anyOf: unknown[];
  branchKeys?: unknown[];
  kind: "union";
} {
  return Boolean(
    descriptor &&
    descriptor.kind === "union" &&
    Array.isArray(descriptor.anyOf),
  );
}

function decodeUnionBranchResolution(
  descriptor: SchemaDescriptor,
  value: unknown,
): {
  branchDescriptor: SchemaDescriptor;
  branchKey: string;
  value: unknown;
} | null {
  if (!isUnionDescriptor(descriptor)) return null;

  const branches = readUnionBranches(descriptor);
  if (branches.length === 0) return null;

  const fallbackBranch = branches[0]!;
  const source = isRecord(value) ? value : {};
  const unionMeta = isRecord(source.__cms0Union) ? source.__cms0Union : {};
  const branchKey =
    typeof unionMeta.branchKey === "string"
      ? unionMeta.branchKey
      : fallbackBranch.key;
  const branch =
    branches.find((candidate) => candidate.key === branchKey) ?? fallbackBranch;

  const resolvedValue = Object.hasOwn(source, "value")
    ? source.value
    : (value ?? null);

  return {
    branchDescriptor: branch.descriptor,
    branchKey: branch.key,
    value: resolvedValue,
  };
}

export function isIdLikeFieldName(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  const snakeLike = normalized.replace(/[-\s]+/g, "_").toLowerCase();
  return (
    snakeLike === "id" || snakeLike.endsWith("_id") || /Id$/.test(normalized)
  );
}

export function isDateTimeLikeFieldName(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  const snakeLike = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  const parts = snakeLike.split("_").filter(Boolean);
  if (parts.length === 0) return false;
  const last = parts[parts.length - 1]!;
  const secondLast = parts.length > 1 ? parts[parts.length - 2]! : "";
  if (
    last === "date" ||
    last === "time" ||
    last === "datetime" ||
    last === "timestamp"
  ) {
    return true;
  }
  if (
    last === "at" &&
    (secondLast === "created" ||
      secondLast === "updated" ||
      secondLast === "deleted" ||
      secondLast === "published" ||
      secondLast === "modified")
  ) {
    return true;
  }
  return snakeLike.includes("timestamp");
}

export function isAuditTimestampFieldName(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  const snakeLike = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return snakeLike === "created_at" || snakeLike === "updated_at";
}

function responsiveDisplayPriority(key: string): number {
  const normalized = key.trim().toLowerCase();
  if (normalized === "desktop") return 0;
  if (normalized === "tablet") return 1;
  if (normalized === "mobile") return 2;
  return 10;
}

function sortDisplayEntries<T>(entries: [string, T][]) {
  return [...entries].sort(([leftKey], [rightKey]) => {
    const priorityDelta =
      responsiveDisplayPriority(leftKey) - responsiveDisplayPriority(rightKey);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    return leftKey.localeCompare(rightKey);
  });
}

function isOrderMetadataFieldName(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  const snakeLike = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return snakeLike === "order_index";
}

function isLocaleMetadataFieldName(key: string): boolean {
  const normalized = key.trim();
  if (!normalized) return false;
  const snakeLike = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();
  return snakeLike === "locale" || snakeLike === "default_locale";
}

export function isLikelyDateTimeString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  if (/^\d{10,13}$/.test(trimmed)) return true;
  if (!/\d/.test(trimmed)) return false;
  if (!(/[Tt]/.test(trimmed) || /:/.test(trimmed) || /-/.test(trimmed))) {
    return false;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return false;
  return /\d{4}-\d{2}-\d{2}/.test(trimmed) || /[Tt]\d{2}:\d{2}/.test(trimmed);
}

export function resolvePreferredDisplayField(
  properties?: Record<string, SchemaDescriptor>,
): [string, SchemaDescriptor] | undefined {
  if (!properties) return undefined;
  const entries = sortDisplayEntries(
    Object.entries(properties).filter(
      ([key]) => !isIdLikeFieldName(key) && !isAuditTimestampFieldName(key),
    ) as [string, SchemaDescriptor][],
  );

  const pick = (
    matcher: (key: string, descriptor: SchemaDescriptor) => boolean,
  ) => entries.find(([key, descriptor]) => matcher(key, descriptor));
  const normalizeKey = (key: string) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
  const semanticLabelKeys = ["title", "name", "label", "slug", "filename"];
  const isSemanticLabelDescriptor = (descriptor: SchemaDescriptor) =>
    descriptor?.customType === "LocalizedString" ||
    descriptor?.customType === "LocalizedRichText" ||
    descriptor?.customType === "RichText" ||
    descriptor?.type === "string" ||
    (descriptor?.type === "object" &&
      Boolean(
        resolvePreferredDisplayField(
          isRecord(descriptor.properties)
            ? (descriptor.properties as Record<string, SchemaDescriptor>)
            : {},
        ),
      ));
  const semanticLabelField = semanticLabelKeys
    .map((semanticKey) =>
      pick(
        (key, descriptor) =>
          normalizeKey(key) === semanticKey &&
          isSemanticLabelDescriptor(descriptor),
      ),
    )
    .find((entry): entry is [string, SchemaDescriptor] => Boolean(entry));

  return (
    semanticLabelField ||
    pick((_key, descriptor) => descriptor?.customType === "LocalizedString") ||
    pick(
      (_key, descriptor) => descriptor?.customType === "LocalizedRichText",
    ) ||
    pick((_key, descriptor) => descriptor?.customType === "RichText") ||
    pick(
      (key, descriptor) =>
        descriptor?.type === "string" && !isDateTimeLikeFieldName(key),
    ) ||
    pick((_key, descriptor) => descriptor?.kind === "modelRef") ||
    pick(
      (_key, descriptor) =>
        descriptor?.type === "object" &&
        Boolean(
          resolvePreferredDisplayField(
            isRecord(descriptor.properties)
              ? (descriptor.properties as Record<string, SchemaDescriptor>)
              : {},
          ),
        ),
    ) ||
    pick((_key, descriptor) => descriptor?.type === "number") ||
    pick(
      (key, descriptor) =>
        descriptor?.type === "string" && isDateTimeLikeFieldName(key),
    ) ||
    pick((_key, descriptor) => descriptor?.type === "boolean")
  );
}

const VIEWPORT_LOCALES = ["desktop", "mobile", "tablet"];

function isViewportLocaleObject(
  value: Record<string, unknown>,
): value is Record<string, unknown> & { desktop?: unknown } {
  return VIEWPORT_LOCALES.some((key) => Object.hasOwn(value, key));
}

function getLocalizedEntry(
  value: unknown,
  defaultLocale?: string,
): Record<string, unknown> | null {
  if (!isRecord(value)) return null;

  // Handle viewport-based locales (desktop/mobile/tablet) directly on the object
  // This is used for responsive breakpoints in LocalizedRichText fields
  if (isViewportLocaleObject(value)) {
    const viewportLocales: Record<string, unknown> = {};
    for (const key of VIEWPORT_LOCALES) {
      if (Object.hasOwn(value, key)) {
        viewportLocales[key] = value[key];
      }
    }
    if (Object.keys(viewportLocales).length > 0) {
      const viewportCandidates = [defaultLocale, "desktop"].filter(
        (candidate): candidate is string => Boolean(candidate),
      );
      let selectedViewport =
        viewportCandidates.find((candidate) =>
          Object.hasOwn(viewportLocales, candidate),
        ) ?? "";
      if (!selectedViewport) {
        selectedViewport = Object.keys(viewportLocales)[0]!;
      }
      const localizedValue = viewportLocales[selectedViewport];
      if (isRecord(localizedValue)) {
        return {
          locale: selectedViewport,
          ...localizedValue,
        };
      }
      return {
        locale: selectedViewport,
        value: localizedValue ?? "",
      };
    }
  }

  const locales = isRecord(value.locales)
    ? (value.locales as Record<string, unknown>)
    : null;

  // Handle viewport-based locales inside a 'locales' wrapper
  // (e.g., { defaultLocale: "desktop", locales: { desktop: {...}, mobile: {...} } })
  if (locales && isViewportLocaleObject(locales)) {
    const viewportCandidates = [
      defaultLocale,
      value.defaultLocale,
      "desktop",
    ].filter((c): c is string => typeof c === "string");
    let selectedViewport =
      viewportCandidates.find((c) => Object.hasOwn(locales, c)) ?? "";
    if (!selectedViewport) {
      selectedViewport =
        Object.keys(locales).find((k) => VIEWPORT_LOCALES.includes(k)) ??
        "desktop";
    }
    const localizedValue = locales[selectedViewport];
    if (isRecord(localizedValue)) {
      return {
        locale: selectedViewport,
        ...localizedValue,
      };
    }
    return {
      locale: selectedViewport,
      value: localizedValue ?? "",
    };
  }

  if (!locales) return null;

  const localeKeys = Object.keys(locales);
  if (!localeKeys.length) return null;

  const configuredDefaultLocale =
    typeof value.defaultLocale === "string" ? value.defaultLocale : "";
  const localeCandidates = [defaultLocale, configuredDefaultLocale]
    .filter((candidate): candidate is string => Boolean(candidate))
    .map((candidate) => candidate.trim())
    .filter(Boolean);

  let selectedLocale =
    localeCandidates.find((candidate) => Object.hasOwn(locales, candidate)) ??
    "";

  if (!selectedLocale) {
    const lowerMap = new Map(localeKeys.map((key) => [key.toLowerCase(), key]));
    for (const candidate of localeCandidates) {
      const matched = lowerMap.get(candidate.toLowerCase());
      if (matched) {
        selectedLocale = matched;
        break;
      }
    }
  }

  if (!selectedLocale) {
    selectedLocale = localeKeys[0]!;
  }

  const localizedValue = locales[selectedLocale];
  if (isRecord(localizedValue)) {
    return {
      locale: selectedLocale,
      ...localizedValue,
    };
  }

  return {
    locale: selectedLocale,
    value: localizedValue ?? "",
  };
}

function extractRichTextHtml(value: unknown): string {
  if (!isRecord(value)) return "";
  if (typeof value.html === "string") return value.html;
  if (typeof value.value === "string") return value.value;
  return "";
}

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractRichTextPlainText(value: unknown): string {
  const html = extractRichTextHtml(value);
  if (html.trim().length > 0) {
    return stripHtmlToPlainText(html);
  }

  if (!isRecord(value)) {
    return "";
  }

  const doc = value.value;
  if (!isRecord(doc) || !Array.isArray(doc.content)) {
    return "";
  }

  const chunks: string[] = [];
  const visitNode = (node: unknown) => {
    if (!isRecord(node)) return;
    if (typeof node.text === "string" && node.text.trim().length > 0) {
      chunks.push(node.text);
    }
    if (Array.isArray(node.content)) {
      for (const child of node.content) {
        visitNode(child);
      }
    }
  };

  for (const child of doc.content) {
    visitNode(child);
  }

  return chunks.join(" ").trim();
}

export function pickPreferredPrimitiveValue(
  value: Record<string, unknown>,
): unknown {
  const entries = sortDisplayEntries(Object.entries(value));
  const readDateLike = (input: string) =>
    isLikelyDateTimeString(input as unknown);
  const normalizeKey = (key: string) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/[-\s]+/g, "_")
      .toLowerCase();
  const isDisplayableKey = (key: string) =>
    !isIdLikeFieldName(key) &&
    !isAuditTimestampFieldName(key) &&
    !isOrderMetadataFieldName(key) &&
    !isLocaleMetadataFieldName(key);

  const semanticLabelKeys = ["title", "name", "label", "slug", "filename"];
  const semanticString = semanticLabelKeys
    .map((semanticKey) =>
      entries.find(
        ([key, entry]) =>
          normalizeKey(key) === semanticKey &&
          typeof entry === "string" &&
          entry.trim().length > 0 &&
          isDisplayableKey(key),
      ),
    )
    .find((entry): entry is [string, unknown] => Boolean(entry));
  if (semanticString) return semanticString[1];

  const firstNonDateString = entries.find(([key, entry]) => {
    if (typeof entry !== "string") return false;
    const isDateLike = readDateLike(entry);
    return (
      isDisplayableKey(key) &&
      !isDateTimeLikeFieldName(key) &&
      !isDateLike &&
      entry.trim().length > 0
    );
  });
  if (firstNonDateString) return firstNonDateString[1];

  const firstNumber = entries.find(
    ([key, entry]) =>
      typeof entry === "number" && isDisplayableKey(key),
  );
  if (firstNumber) return firstNumber[1];

  const firstDateLikeString = entries.find(([key, entry]) => {
    if (typeof entry !== "string") return false;
    const isDateLike = readDateLike(entry);
    return (
      isDisplayableKey(key) &&
      (isDateTimeLikeFieldName(key) || isDateLike) &&
      entry.trim().length > 0
    );
  });
  if (firstDateLikeString) return firstDateLikeString[1];

  const firstBoolean = entries.find(
    ([key, entry]) =>
      typeof entry === "boolean" && isDisplayableKey(key),
  );
  if (firstBoolean) return firstBoolean[1];

  const firstString = entries.find(
    ([key, entry]) =>
      typeof entry === "string" && isDisplayableKey(key),
  );
  if (firstString) return firstString[1];

  return undefined;
}

function pickPreferredPrimitiveValueDeepInternal(
  value: Record<string, unknown>,
  visited: WeakSet<Record<string, unknown>>,
  fallbackLocale?: string,
): unknown {
  if (visited.has(value)) return undefined;
  visited.add(value);

  const localizedEntry =
    getLocalizedEntry(value) ?? getLocalizedEntry(value, fallbackLocale);
  if (localizedEntry) {
    const localizedValue = localizedEntry.value;
    if (typeof localizedValue === "string") return localizedValue;
    if (
      typeof localizedValue === "number" ||
      typeof localizedValue === "boolean"
    ) {
      return localizedValue;
    }
    if (isRecord(localizedValue)) {
      const nestedLocalized = pickPreferredPrimitiveValueDeepInternal(
        localizedValue,
        visited,
        fallbackLocale,
      );
      if (nestedLocalized != null) return nestedLocalized;
    }
  }

  const direct = pickPreferredPrimitiveValue(value);
  let deferredBoolean: boolean | undefined;
  if (typeof direct === "boolean") {
    deferredBoolean = direct;
  } else if (direct != null) {
    return direct;
  }

  for (const [key, entry] of sortDisplayEntries(Object.entries(value))) {
    if (
      isIdLikeFieldName(key) ||
      isAuditTimestampFieldName(key) ||
      isOrderMetadataFieldName(key) ||
      isLocaleMetadataFieldName(key)
    ) {
      continue;
    }

    if (Array.isArray(entry)) {
      for (const item of entry) {
        if (!isRecord(item)) continue;
        const nested = pickPreferredPrimitiveValueDeepInternal(
          item,
          visited,
          fallbackLocale,
        );
        if (nested != null) return nested;
      }
      continue;
    }

    if (isRecord(entry)) {
      const nested = pickPreferredPrimitiveValueDeepInternal(
        entry,
        visited,
        fallbackLocale,
      );
      if (nested != null) return nested;
    }
  }

  if (deferredBoolean != null) return deferredBoolean;
  return undefined;
}

function pickPreferredPrimitiveValueDeep(
  value: Record<string, unknown>,
  fallbackLocale?: string,
): unknown {
  return pickPreferredPrimitiveValueDeepInternal(
    value,
    new WeakSet(),
    fallbackLocale,
  );
}

function getNestedObjectDisplayValue(
  descriptor: SchemaDescriptor | undefined,
  value: unknown,
): { descriptor?: SchemaDescriptor; value: unknown } | null {
  if (descriptor?.type !== "object" || !isRecord(value)) {
    return null;
  }
  const properties = isRecord(descriptor.properties)
    ? (descriptor.properties as Record<string, SchemaDescriptor>)
    : {};
  const preferred = resolvePreferredDisplayField(properties);
  if (!preferred) return null;
  const [fieldName, fieldDescriptor] = preferred;
  const nestedValue = value[fieldName];
  if (nestedValue == null) return null;
  return { descriptor: fieldDescriptor, value: nestedValue };
}

function shapeFromPrimitiveType(
  type: unknown,
): Extract<
  DescriptorShapeKey,
  | "primitive:string"
  | "primitive:number"
  | "primitive:boolean"
  | "primitive:json"
> {
  if (type === "number") return "primitive:number";
  if (type === "boolean") return "primitive:boolean";
  if (type === "json") return "primitive:json";
  return "primitive:string";
}

export function resolveDescriptorShapeKey(
  descriptor?: SchemaDescriptor,
): DescriptorShapeKey {
  if (!descriptor) return "unknown";
  if (descriptor.customType === "RichText") return "custom:RichText";
  if (descriptor.customType === "LocalizedString")
    return "custom:LocalizedString";
  if (descriptor.customType === "LocalizedRichText") {
    return "custom:LocalizedRichText";
  }
  if (descriptor.kind === "enum") return "kind:enum";
  if (descriptor.kind === "union") return "kind:union";
  if (descriptor.kind === "modelRef") return "kind:modelRef";
  if (descriptor.type === "object") return "type:object";
  if (descriptor.type === "array") return "type:array";
  if (
    descriptor.type === "string" ||
    descriptor.type === "number" ||
    descriptor.type === "boolean" ||
    descriptor.type === "json"
  ) {
    return shapeFromPrimitiveType(descriptor.type);
  }
  return "unknown";
}

export function formatDescriptorValue(
  descriptor: SchemaDescriptor | undefined,
  value: unknown,
  options?: { defaultLocale?: string },
): string {
  const key = resolveDescriptorShapeKey(descriptor);

  if (key === "custom:RichText") {
    const text = extractRichTextPlainText(value);
    return text.length > 0 ? text : "Rich text";
  }

  if (key === "custom:LocalizedString") {
    const entry = getLocalizedEntry(value, options?.defaultLocale);
    if (!entry) {
      return value == null ? "" : String(value);
    }
    return entry.value == null ? "" : String(entry.value);
  }

  if (key === "custom:LocalizedRichText") {
    const entry = getLocalizedEntry(value, options?.defaultLocale);
    if (!entry) {
      if (typeof value === "string" && value.trim().length > 0) return value;
      return "";
    }
    const text = extractRichTextPlainText(entry);
    if (text.length > 0) return text;
    const rawValue = entry.value;
    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      return rawValue;
    }
    return "Rich text";
  }

  if (key === "primitive:boolean") {
    return value ? "True" : "False";
  }

  if (key === "primitive:json") {
    if (value == null) return "";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  if (key === "type:array") {
    if (Array.isArray(value)) return `${value.length} items`;
    if (isRecord(value)) {
      const primitive = pickPreferredPrimitiveValueDeep(
        value,
        options?.defaultLocale,
      );
      return primitive == null ? "" : String(primitive);
    }
    return value == null ? "" : String(value);
  }

  if (key === "type:object") {
    if (isRecord(value)) {
      const nested = getNestedObjectDisplayValue(descriptor, value);
      let booleanNestedFormatted: string | undefined;
      if (nested) {
        const nestedKey = resolveDescriptorShapeKey(nested.descriptor);
        const nestedFormatted = formatDescriptorValue(
          nested.descriptor,
          nested.value,
          options,
        );
        if (nestedFormatted !== "") {
          if (nestedKey === "primitive:boolean") {
            booleanNestedFormatted = nestedFormatted;
          } else {
            return nestedFormatted;
          }
        }
      }
      const primitive = pickPreferredPrimitiveValueDeep(
        value,
        options?.defaultLocale,
      );
      if (primitive != null) return String(primitive);
      if (booleanNestedFormatted) return booleanNestedFormatted;
      return "";
    }
    return value == null ? "" : String(value);
  }

  if (key === "kind:modelRef") {
    if (isRecord(value)) {
      const primitive = pickPreferredPrimitiveValueDeep(
        value,
        options?.defaultLocale,
      );
      if (primitive != null) return String(primitive);
      return "";
    }
    return value == null ? "" : String(value);
  }

  if (key === "kind:enum") {
    return value == null ? "" : String(value);
  }

  if (key === "kind:union") {
    if (value == null) return "";
    const resolved =
      descriptor && isUnionDescriptor(descriptor)
        ? decodeUnionBranchResolution(descriptor, value)
        : null;
    if (!resolved) return "";
    return formatDescriptorValue(
      resolved.branchDescriptor,
      resolved.value,
      options,
    );
  }

  if (value != null && typeof value === "object") {
    if (isRecord(value)) {
      const primitive = pickPreferredPrimitiveValueDeep(
        value,
        options?.defaultLocale,
      );
      if (primitive != null) return String(primitive);
    }
    return "";
  }
  return value == null ? "" : String(value);
}

export function extractDescriptorHtml(
  descriptor: SchemaDescriptor | undefined,
  value: unknown,
  options?: { defaultLocale?: string },
): string {
  if (descriptor && isUnionDescriptor(descriptor)) {
    const resolved = decodeUnionBranchResolution(descriptor, value);
    if (!resolved) return "";
    return extractDescriptorHtml(
      resolved.branchDescriptor,
      resolved.value,
      options,
    );
  }

  const key = resolveDescriptorShapeKey(descriptor);
  if (key === "custom:RichText") {
    return extractRichTextHtml(value);
  }
  if (key === "custom:LocalizedRichText") {
    const entry = getLocalizedEntry(value, options?.defaultLocale);
    return extractRichTextHtml(entry);
  }
  if (key === "type:object") {
    const nested = getNestedObjectDisplayValue(descriptor, value);
    if (!nested) return "";
    return extractDescriptorHtml(nested.descriptor, nested.value, options);
  }
  return "";
}

function AssetRepresentation({
  alt,
  compact = false,
  filename,
  kind,
  label,
  url,
}: {
  alt?: string;
  compact?: boolean;
  filename?: string;
  kind: AssetKind;
  label: string;
  url?: string;
}) {
  const imageClass = compact
    ? "h-5 w-5 rounded border object-cover"
    : "h-6 w-6 rounded border object-cover";
  const src =
    url ??
    (filename &&
    (filename.startsWith("/") ||
      filename.startsWith("http://") ||
      filename.startsWith("https://"))
      ? filename
      : undefined);

  if (kind === "image") {
    return (
      <div className="flex items-center gap-2">
        {src ? (
          <img src={src} alt={alt ?? label} className={imageClass} />
        ) : (
          <div
            className={
              compact
                ? "flex h-5 w-5 items-center justify-center rounded border bg-muted text-muted-foreground"
                : "flex h-6 w-6 items-center justify-center rounded border bg-muted text-muted-foreground"
            }
          >
            <FileIcon className="h-3.5 w-3.5" />
          </div>
        )}
        <span className={compact ? "truncate" : ""}>{label}</span>
      </div>
    );
  }
  if (kind === "video") {
    return (
      <div className="flex items-center gap-2">
        {src ? (
          <video src={src} className={imageClass} muted playsInline />
        ) : (
          <div
            className={
              compact
                ? "flex h-5 w-5 items-center justify-center rounded border bg-muted text-muted-foreground"
                : "flex h-6 w-6 items-center justify-center rounded border bg-muted text-muted-foreground"
            }
          >
            <FileIcon className="h-3.5 w-3.5" />
          </div>
        )}
        <span className={compact ? "truncate" : ""}>{label}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <FileIcon className="h-4 w-4 text-muted-foreground" />
      <span className={compact ? "truncate" : ""}>{label}</span>
    </div>
  );
}

const TextColumnRepresentation: DescriptorRepresentationComponent<
  ColumnRepresentationProps
> = ({ defaultLocale, descriptor, value }) => {
  const richHtml = extractDescriptorHtml(descriptor, value, { defaultLocale });
  if (richHtml) {
    return <span dangerouslySetInnerHTML={{ __html: richHtml }} />;
  }
  return (
    <span>{formatDescriptorValue(descriptor, value, { defaultLocale })}</span>
  );
};

const ArrayColumnRepresentation: DescriptorRepresentationComponent<
  ColumnRepresentationProps
> = ({ defaultLocale, descriptor, value }) => (
  <span>{formatDescriptorValue(descriptor, value, { defaultLocale })}</span>
);

const AssetColumnRepresentation: DescriptorRepresentationComponent<
  ColumnRepresentationProps
> = ({ asset, defaultLocale, descriptor, value }) => {
  if (!asset?.kind) {
    return (
      <span>{formatDescriptorValue(descriptor, value, { defaultLocale })}</span>
    );
  }
  const label = formatDescriptorValue(descriptor, value, { defaultLocale });
  if (value == null || (!label && !asset.filename && !asset.url)) {
    return <span />;
  }
  return (
    <AssetRepresentation
      kind={asset.kind}
      filename={asset.filename}
      url={asset.url}
      alt={asset.alt}
      label={label}
    />
  );
};

const TextOptionRepresentation: DescriptorRepresentationComponent<
  SelectionOptionRepresentationProps
> = ({ defaultLocale, descriptor, option }) => {
  const value = option.labelValue ?? option.label;
  const richHtml = extractDescriptorHtml(descriptor, value, { defaultLocale });
  if (richHtml) {
    return <span dangerouslySetInnerHTML={{ __html: richHtml }} />;
  }
  return (
    <span>{formatDescriptorValue(descriptor, value, { defaultLocale })}</span>
  );
};

const AssetOptionRepresentation: DescriptorRepresentationComponent<
  SelectionOptionRepresentationProps
> = ({ assetKind, compact = false, option }) => (
  <AssetRepresentation
    kind={assetKind ?? "file"}
    filename={option.filename}
    url={option.url}
    alt={option.alt}
    label={option.label}
    compact={compact}
  />
);

export const columnRepresentationRegistry: Record<
  DescriptorShapeKey,
  DescriptorRepresentationComponent<ColumnRepresentationProps>
> = {
  "primitive:string": TextColumnRepresentation,
  "primitive:number": TextColumnRepresentation,
  "primitive:boolean": TextColumnRepresentation,
  "primitive:json": TextColumnRepresentation,
  "kind:enum": TextColumnRepresentation,
  "kind:union": TextColumnRepresentation,
  "custom:RichText": TextColumnRepresentation,
  "custom:LocalizedString": TextColumnRepresentation,
  "custom:LocalizedRichText": TextColumnRepresentation,
  "kind:modelRef": TextColumnRepresentation,
  "type:object": TextColumnRepresentation,
  "type:array": ArrayColumnRepresentation,
  unknown: TextColumnRepresentation,
};

export const selectionOptionRepresentationRegistry: Record<
  DescriptorShapeKey,
  DescriptorRepresentationComponent<SelectionOptionRepresentationProps>
> = {
  "primitive:string": TextOptionRepresentation,
  "primitive:number": TextOptionRepresentation,
  "primitive:boolean": TextOptionRepresentation,
  "primitive:json": TextOptionRepresentation,
  "kind:enum": TextOptionRepresentation,
  "kind:union": TextOptionRepresentation,
  "custom:RichText": TextOptionRepresentation,
  "custom:LocalizedString": TextOptionRepresentation,
  "custom:LocalizedRichText": TextOptionRepresentation,
  "kind:modelRef": TextOptionRepresentation,
  "type:object": TextOptionRepresentation,
  "type:array": TextOptionRepresentation,
  unknown: TextOptionRepresentation,
};

export function DescriptorColumnRepresentation({
  asset,
  defaultLocale,
  descriptor,
  value,
}: Readonly<ColumnRepresentationProps>) {
  const key = resolveDescriptorShapeKey(descriptor);
  if (asset?.kind) {
    return AssetColumnRepresentation({
      asset,
      defaultLocale,
      descriptor,
      value,
    });
  }
  const Component = columnRepresentationRegistry[key];
  return <>{Component({ asset, defaultLocale, descriptor, value })}</>;
}

export function DescriptorSelectionOptionItem({
  assetKind,
  compact = false,
  defaultLocale,
  descriptor,
  option,
}: Readonly<SelectionOptionRepresentationProps>) {
  if (assetKind) {
    return (
      <>
        {AssetOptionRepresentation({
          assetKind,
          compact,
          defaultLocale,
          descriptor,
          option,
        })}
      </>
    );
  }
  const key = resolveDescriptorShapeKey(descriptor);
  const Component = selectionOptionRepresentationRegistry[key];
  return (
    <>{Component({ assetKind, compact, defaultLocale, descriptor, option })}</>
  );
}
