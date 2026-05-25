import { createHash } from "node:crypto";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizeForStableStringify(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeForStableStringify(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) =>
      left.localeCompare(right),
    );
    const normalized: Record<string, JsonValue> = {};

    for (const key of keys) {
      normalized[key] = normalizeForStableStringify(record[key]);
    }

    return normalized;
  }

  return String(value);
}

export function stableDescriptorStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableStringify(value));
}

export function checksumDescriptor(value: unknown): string {
  return createHash("sha256")
    .update(stableDescriptorStringify(value), "utf8")
    .digest("hex");
}
