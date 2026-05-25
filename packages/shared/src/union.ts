import type { FieldDescriptor } from "./validation.js";

export const CMS0_UNION_META_KEY = "__cms0Union" as const;

export type Cms0TaggedUnionMeta = {
  branchKey: string;
};

export type Cms0TaggedUnionValue = {
  [CMS0_UNION_META_KEY]: Cms0TaggedUnionMeta;
  value: unknown;
};

type UnionDescriptor = Extract<FieldDescriptor, { kind: "union" }>;

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeBranchShape(descriptor: FieldDescriptor): unknown {
  if ((descriptor as any)?.kind === "modelRef") {
    return {
      kind: "modelRef",
      model: (descriptor as any).model,
    };
  }

  if ((descriptor as any)?.kind === "enum") {
    return {
      kind: "enum",
      valueType: (descriptor as any).valueType ?? "string",
      values: Array.isArray((descriptor as any).values)
        ? [...((descriptor as any).values as unknown[])]
        : [],
    };
  }

  if ((descriptor as any)?.kind === "union") {
    const branches = Array.isArray((descriptor as any)?.anyOf)
      ? ((descriptor as any).anyOf as FieldDescriptor[])
      : [];
    return {
      kind: "union",
      anyOf: branches.map((branch) => normalizeBranchShape(branch)),
      ...(typeof (descriptor as any)?.discriminator?.key === "string"
        ? { discriminator: { key: (descriptor as any).discriminator.key } }
        : {}),
    };
  }

  if ((descriptor as any)?.type === "array") {
    return {
      kind: "array",
      items: normalizeBranchShape((descriptor as any).items as FieldDescriptor),
    };
  }

  if ((descriptor as any)?.type === "object") {
    const properties =
      (descriptor as any)?.properties &&
      typeof (descriptor as any).properties === "object"
        ? ((descriptor as any).properties as Record<string, FieldDescriptor>)
        : {};
    const normalizedProperties = Object.fromEntries(
      Object.keys(properties)
        .sort((a, b) => a.localeCompare(b))
        .map((key) => [key, normalizeBranchShape(properties[key]!)]),
    );
    return {
      kind: "object",
      properties: normalizedProperties,
    };
  }

  return {
    kind: "primitive",
    type: (descriptor as any)?.type ?? "json",
    ...(typeof (descriptor as any)?.customType === "string"
      ? { customType: (descriptor as any).customType }
      : {}),
  };
}

function stableStringify(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }
  if (!isObjectRecord(value)) return JSON.stringify(value);

  const entries = Object.keys(value)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
  return `{${entries.join(",")}}`;
}

function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeUnionBranchKeys(branches: FieldDescriptor[]): string[] {
  const used = new Set<string>();
  return branches.map((branch, index) => {
    const signature = stableStringify(normalizeBranchShape(branch));
    const base = `branch_${fnv1a32(signature)}`;
    let key = base;
    let suffix = 1;
    while (used.has(key)) {
      suffix += 1;
      key = `${base}_${suffix}`;
    }
    used.add(key);
    return key || `branch_${index + 1}`;
  });
}

export function getUnionBranchKeys(descriptor: UnionDescriptor): string[] {
  const branches = Array.isArray((descriptor as any)?.anyOf)
    ? ((descriptor as any).anyOf as FieldDescriptor[])
    : [];
  if (!branches.length) return [];

  const explicit = Array.isArray((descriptor as any)?.branchKeys)
    ? ((descriptor as any).branchKeys as unknown[])
    : [];
  const normalizedExplicit = explicit
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);

  if (
    normalizedExplicit.length === branches.length &&
    new Set(normalizedExplicit).size === normalizedExplicit.length
  ) {
    return normalizedExplicit;
  }

  return computeUnionBranchKeys(branches);
}

export function getUnionBranchKeyAt(
  descriptor: UnionDescriptor,
  index: number,
): string | undefined {
  const keys = getUnionBranchKeys(descriptor);
  return keys[index];
}

export function isTaggedUnionValue(value: unknown): value is Cms0TaggedUnionValue {
  if (!isObjectRecord(value)) return false;
  const meta = value[CMS0_UNION_META_KEY];
  if (!isObjectRecord(meta)) return false;
  if (typeof meta.branchKey !== "string" || !meta.branchKey.trim()) return false;
  return Object.prototype.hasOwnProperty.call(value, "value");
}

export function encodeTaggedUnionValue(
  branchKey: string,
  value: unknown,
): Cms0TaggedUnionValue {
  return {
    [CMS0_UNION_META_KEY]: { branchKey },
    value,
  };
}

export function decodeTaggedUnionValue(
  value: unknown,
): { branchKey: string; value: unknown } | null {
  if (!isTaggedUnionValue(value)) return null;
  const meta = value[CMS0_UNION_META_KEY];
  return {
    branchKey: meta.branchKey.trim(),
    value: (value as Record<string, unknown>).value,
  };
}

export function createTaggedUnionValue(
  descriptor: UnionDescriptor,
  branchIndex: number,
  branchValue: unknown,
): Cms0TaggedUnionValue | null {
  const branchKey = getUnionBranchKeyAt(descriptor, branchIndex);
  if (!branchKey) return null;
  return encodeTaggedUnionValue(branchKey, branchValue);
}

export function resolveTaggedUnionBranchIndex(
  descriptor: UnionDescriptor,
  value: unknown,
): number {
  const decoded = decodeTaggedUnionValue(value);
  if (!decoded) return -1;
  const keys = getUnionBranchKeys(descriptor);
  return keys.findIndex((key) => key === decoded.branchKey);
}
