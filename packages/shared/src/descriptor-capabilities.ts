import {
  createTaggedUnionValue,
  getUnionBranchKeyAt,
  getUnionBranchKeys,
  isTaggedUnionValue,
  type Cms0TaggedUnionValue,
} from "./union.js";
import type {
  EnumValue,
  EnumValueType,
  FieldDescriptor,
  FullDescriptor,
  ModelDescriptor,
} from "./validation.js";

export type Cms0AssetKind = "file" | "image" | "video";

export type Cms0DescriptorCapability =
  | {
      kind: "scalar";
      primitiveType: "string" | "number" | "boolean" | "json";
      customType?: string;
    }
  | {
      kind: "enum";
      valueType: EnumValueType;
      options: EnumValue[];
    }
  | {
      kind: "localized-string";
    }
  | {
      kind: "rich-text";
    }
  | {
      kind: "localized-rich-text";
    }
  | {
      kind: "model-ref";
      modelName: string;
      modelDescriptor?: ModelDescriptor;
    }
  | {
      kind: "asset-ref";
      modelName: string;
      assetKind: Cms0AssetKind;
      modelDescriptor?: ModelDescriptor;
    }
  | {
      kind: "object-inline";
      properties: Array<[string, FieldDescriptor]>;
    }
  | {
      kind: "collection-inline";
      itemDescriptor: FieldDescriptor;
    }
  | {
      kind: "union";
      branches: Array<{
        index: number;
        key: string;
        descriptor: FieldDescriptor;
        capability: Cms0DescriptorCapability;
        label: string;
      }>;
      discriminatorKey?: string;
    }
  | {
      kind: "unsupported";
      reason?: string;
    };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isPrimitiveDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { kind?: "primitive" }> {
  if (!descriptor) return false;
  const type = (descriptor as { type?: string }).type;
  return (
    descriptor.kind === "primitive" ||
    (!descriptor.kind && type !== "object" && type !== "array")
  );
}

export function isEnumDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { kind: "enum" }> {
  return descriptor?.kind === "enum";
}

export function isUnionDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { kind: "union" }> {
  return descriptor?.kind === "union";
}

export function isModelRefDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { kind: "modelRef" }> {
  return descriptor?.kind === "modelRef";
}

export function isObjectDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { type: "object" }> {
  return !!descriptor && (descriptor as { type?: string }).type === "object";
}

export function isArrayDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { type: "array" }> {
  return !!descriptor && (descriptor as { type?: string }).type === "array";
}

export function getModelDescriptor(
  fullDescriptor: FullDescriptor | undefined,
  modelName: string | undefined,
): ModelDescriptor | undefined {
  if (!fullDescriptor || !modelName) return undefined;
  return fullDescriptor.models?.[modelName];
}

export function getDescriptorPropertyEntries(
  descriptor: Extract<FieldDescriptor, { type: "object" }>,
): Array<[string, FieldDescriptor]> {
  const properties = descriptor.properties ?? {};
  const order = Array.isArray(descriptor.propertyOrder)
    ? descriptor.propertyOrder
    : [];
  const ordered = order
    .filter((key: string) => Object.prototype.hasOwnProperty.call(properties, key))
    .map((key: string) => [key, properties[key]!] as [string, FieldDescriptor]);
  const remaining = Object.entries(properties)
    .filter(([key]) => !order.includes(key))
    .sort(([left], [right]) => left.localeCompare(right));
  return [...ordered, ...remaining];
}

export function resolveAssetKindFromModelDescriptor(
  modelName: string | undefined,
  modelDescriptor: ModelDescriptor | undefined,
): Cms0AssetKind | null {
  const presentation = modelDescriptor?.presentation;
  if (presentation?.kind === "asset") {
    if (presentation.assetKind === "image") return "image";
    if (presentation.assetKind === "video") return "video";
    return "file";
  }

  if (modelName === "Image") return "image";
  if (modelName === "Video") return "video";
  if (modelName === "File") return "file";
  return null;
}

export function resolveDescriptorCapability(
  descriptor: FieldDescriptor,
  fullDescriptor?: FullDescriptor,
): Cms0DescriptorCapability {
  if (isUnionDescriptor(descriptor)) {
    const keys = getUnionBranchKeys(descriptor);
    const branches = Array.isArray(descriptor.anyOf) ? descriptor.anyOf : [];
    return {
      kind: "union",
      discriminatorKey: descriptor.discriminator?.key,
      branches: branches.map((branch: FieldDescriptor, index: number) => ({
        index,
        key: keys[index] ?? getUnionBranchKeyAt(descriptor, index) ?? `branch_${index + 1}`,
        descriptor: branch,
        capability: resolveDescriptorCapability(branch, fullDescriptor),
        label: getDescriptorDisplayName(branch, index),
      })),
    };
  }

  if (isModelRefDescriptor(descriptor)) {
    const modelDescriptor = getModelDescriptor(fullDescriptor, descriptor.model);
    const assetKind = resolveAssetKindFromModelDescriptor(
      descriptor.model,
      modelDescriptor,
    );
    if (assetKind) {
      return {
        kind: "asset-ref",
        modelName: descriptor.model,
        assetKind,
        modelDescriptor,
      };
    }
    return {
      kind: "model-ref",
      modelName: descriptor.model,
      modelDescriptor,
    };
  }

  if (isEnumDescriptor(descriptor)) {
    return {
      kind: "enum",
      valueType: descriptor.valueType,
      options: Array.isArray(descriptor.values) ? descriptor.values.slice() : [],
    };
  }

  if (isObjectDescriptor(descriptor)) {
    return {
      kind: "object-inline",
      properties: getDescriptorPropertyEntries(descriptor),
    };
  }

  if (isArrayDescriptor(descriptor)) {
    return {
      kind: "collection-inline",
      itemDescriptor: descriptor.items,
    };
  }

  if (!isPrimitiveDescriptor(descriptor)) {
    return {
      kind: "unsupported",
      reason: "Unsupported descriptor kind.",
    };
  }

  if (descriptor.customType === "LocalizedString") {
    return { kind: "localized-string" };
  }
  if (descriptor.customType === "RichText") {
    return { kind: "rich-text" };
  }
  if (descriptor.customType === "LocalizedRichText") {
    return { kind: "localized-rich-text" };
  }

  return {
    kind: "scalar",
    primitiveType: descriptor.type,
    customType: descriptor.customType,
  };
}

export function getDescriptorDefaultValue(
  descriptor: FieldDescriptor,
  options: {
    locales?: readonly string[];
    defaultLocale?: string;
  } = {},
): unknown {
  const capability = resolveDescriptorCapability(descriptor);
  if (capability.kind === "localized-string") {
    const locales = options.locales?.length ? [...options.locales] : [options.defaultLocale ?? "en"];
    const defaultLocale = options.defaultLocale ?? locales[0] ?? "en";
    return {
      defaultLocale,
      locales: Object.fromEntries(locales.map((locale) => [locale, ""])),
    };
  }

  if (capability.kind === "rich-text") {
    return { value: {}, html: "" };
  }

  if (capability.kind === "localized-rich-text") {
    const locales = options.locales?.length ? [...options.locales] : [options.defaultLocale ?? "en"];
    const defaultLocale = options.defaultLocale ?? locales[0] ?? "en";
    return {
      defaultLocale,
      locales: Object.fromEntries(
        locales.map((locale) => [locale, { value: {}, html: "" }]),
      ),
    };
  }

  if (capability.kind === "model-ref" || capability.kind === "asset-ref") {
    return null;
  }

  if (capability.kind === "enum") {
    return capability.options[0] ?? null;
  }

  if (capability.kind === "union") {
    const firstBranch = capability.branches[0];
    if (!firstBranch) return null;
    return createTaggedUnionValue(
      descriptor as Extract<FieldDescriptor, { kind: "union" }>,
      0,
      getDescriptorDefaultValue(firstBranch.descriptor, options),
    );
  }

  if (capability.kind === "object-inline") {
    return Object.fromEntries(
      capability.properties.map(([key, propertyDescriptor]) => [
        key,
        getDescriptorDefaultValue(propertyDescriptor, options),
      ]),
    );
  }

  if (capability.kind === "collection-inline") {
    return [];
  }

  if (capability.kind === "scalar") {
    if (capability.primitiveType === "string") return "";
    if (capability.primitiveType === "number") return 0;
    if (capability.primitiveType === "boolean") return false;
    return null;
  }

  return null;
}

export function normalizeEnumValue(
  descriptor: Extract<FieldDescriptor, { kind: "enum" }>,
  value: unknown,
) {
  const valueType = (descriptor.valueType ?? "string") as
    | "string"
    | "number"
    | "boolean";
  const values = Array.isArray(descriptor.values) ? descriptor.values : [];

  let normalized: unknown = value;
  if (valueType === "string") {
    normalized = value == null ? "" : String(value);
  } else if (valueType === "number") {
    if (typeof value === "number" && Number.isFinite(value)) {
      normalized = value;
    } else {
      const parsed = Number(value);
      normalized = Number.isFinite(parsed) ? parsed : null;
    }
  } else if (valueType === "boolean") {
    if (value === true || value === "true" || value === 1 || value === "1") {
      normalized = true;
    } else if (value === false || value === "false" || value === 0 || value === "0") {
      normalized = false;
    } else {
      normalized = Boolean(value);
    }
  }

  if (!values.length) return normalized;
  if (values.some((entry: EnumValue) => Object.is(entry, normalized))) {
    return normalized;
  }
  return values[0];
}

export function formatEnumOptionValue(value: unknown): string {
  return JSON.stringify(value);
}

export function parseEnumOptionValue(
  raw: string,
  valueType: "string" | "number" | "boolean",
): unknown {
  try {
    const parsed = JSON.parse(raw);
    if (valueType === "string") return String(parsed ?? "");
    if (valueType === "number") {
      const num = Number(parsed);
      return Number.isFinite(num) ? num : null;
    }
    return Boolean(parsed);
  } catch {
    if (valueType === "number") {
      const num = Number(raw);
      return Number.isFinite(num) ? num : null;
    }
    if (valueType === "boolean") {
      return raw === "true";
    }
    return raw;
  }
}

function isUrlLikeString(input: unknown): boolean {
  return (
    typeof input === "string" &&
    (input.includes("://") || input.startsWith("/") || input.startsWith("./"))
  );
}

function isUuidLikeId(input: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    input,
  );
}

function normalizeModelRefValue(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (!isPlainRecord(value)) return null;
  const id = value.id;
  return typeof id === "string" || typeof id === "number" ? id : null;
}

function descriptorMatchScore(descriptor: FieldDescriptor, value: unknown): number {
  if (isPrimitiveDescriptor(descriptor)) {
    if (descriptor.type === "json") return 1;
    if (descriptor.type === "string") return typeof value === "string" ? 4 : 0;
    if (descriptor.type === "number") return typeof value === "number" ? 4 : 0;
    if (descriptor.type === "boolean") return typeof value === "boolean" ? 4 : 0;
    return 0;
  }

  if (isEnumDescriptor(descriptor)) {
    const values = Array.isArray(descriptor.values) ? descriptor.values : [];
    if (!values.length) return 2;
    return values.some((entry: EnumValue) => Object.is(entry, value)) ? 6 : 0;
  }

  if (isModelRefDescriptor(descriptor)) {
    if (typeof value === "string") {
      const normalized = value.trim();
      if (!normalized) return 0;
      if (isUrlLikeString(normalized)) return 1;
      return isUuidLikeId(normalized) ? 6 : 2;
    }
    if (typeof value === "number") {
      return Number.isFinite(value) && value !== 0 ? 4 : 0;
    }
    const candidate = normalizeModelRefValue(value);
    if (candidate == null) return 0;
    return typeof candidate === "string" && isUuidLikeId(candidate) ? 5 : 2;
  }

  if (isArrayDescriptor(descriptor)) {
    return Array.isArray(value) ? 3 : 0;
  }

  if (isObjectDescriptor(descriptor)) {
    if (!isPlainRecord(value)) return 0;
    const keys = Object.keys(descriptor.properties ?? {});
    const matched = keys.filter((key) =>
      Object.prototype.hasOwnProperty.call(value, key),
    ).length;
    return 2 + matched;
  }

  if (isUnionDescriptor(descriptor)) {
    const branches = Array.isArray(descriptor.anyOf) ? descriptor.anyOf : [];
    if (!branches.length) return 0;
    return Math.max(
      ...branches.map((branch: FieldDescriptor) => descriptorMatchScore(branch, value)),
    );
  }

  return 0;
}

export function resolveUnionBranchIndex(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  value: unknown,
): number {
  const branches = Array.isArray(descriptor.anyOf) ? descriptor.anyOf : [];
  if (!branches.length) return 0;

  const discriminatorKey = descriptor.discriminator?.key;
  if (discriminatorKey && isPlainRecord(value)) {
    const discriminatorValue = value[discriminatorKey];
    for (let index = 0; index < branches.length; index += 1) {
      const branch = branches[index]!;
      const expected = (branch as any)?.properties?.[discriminatorKey]?.values?.[0];
      if (expected !== undefined && Object.is(expected, discriminatorValue)) {
        return index;
      }
    }
  }

  let bestIndex = 0;
  let bestScore = -1;
  for (let index = 0; index < branches.length; index += 1) {
    const score = descriptorMatchScore(branches[index]!, value);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }
  return bestIndex;
}

export function normalizeUnionValue(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  value: unknown,
  options: {
    locales?: readonly string[];
    defaultLocale?: string;
  } = {},
): Cms0TaggedUnionValue | null {
  if (value == null) {
    return null;
  }
  if (isTaggedUnionValue(value)) {
    return value;
  }

  const branches = Array.isArray(descriptor.anyOf) ? descriptor.anyOf : [];
  if (!branches.length) return null;

  const branchIndex = resolveUnionBranchIndex(descriptor, value);
  const branchKey = getUnionBranchKeyAt(descriptor, branchIndex);
  if (!branchKey) return null;
  const branchDescriptor = branches[branchIndex]!;
  const branchValue =
    value == null
      ? getDescriptorDefaultValue(branchDescriptor, options)
      : value;
  return createTaggedUnionValue(descriptor, branchIndex, branchValue);
}

export function getDescriptorDisplayName(
  descriptor: FieldDescriptor,
  index = 0,
): string {
  const customType = (descriptor as any)?.customType;
  if (typeof customType === "string" && customType.length > 0) {
    return humanizeVisualText(customType);
  }
  if (isModelRefDescriptor(descriptor)) {
    return humanizeVisualText(descriptor.model || `Branch ${index + 1}`);
  }
  if (isEnumDescriptor(descriptor)) return "Enum";
  if (isUnionDescriptor(descriptor)) return "Union";
  const descriptorType = (descriptor as any)?.type;
  if (typeof descriptorType === "string") {
    return humanizeVisualText(descriptorType);
  }
  return `Branch ${index + 1}`;
}

function humanizeVisualText(value: string) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (match) => match.toUpperCase());
}
