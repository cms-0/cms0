/**
 * Schema Generator Utilities
 */

import { createHash } from "node:crypto";
import { snakeCase } from "lodash";
import type {
  EnumValueType,
  FieldDescriptor,
  PrimitiveType,
} from "@cms0/shared";
import type { InternalTableSpec } from "./types";

export const PG_IDENTIFIER_MAX_LENGTH = 63;

export const PRIMITIVE_DESCRIPTOR_TYPES = new Set<PrimitiveType>([
  "string",
  "number",
  "boolean",
  "json",
]);

export function resolveScalarDescriptorType(
  desc: FieldDescriptor,
): PrimitiveType | undefined {
  const type = (desc as any)?.type;
  if (
    (desc as any)?.kind === "primitive" ||
    PRIMITIVE_DESCRIPTOR_TYPES.has(type as PrimitiveType)
  ) {
    return type as PrimitiveType;
  }
  if ((desc as any)?.kind === "enum") {
    const valueType = ((desc as any)?.valueType ?? "string") as EnumValueType;
    if (valueType === "number") return "number";
    if (valueType === "boolean") return "boolean";
    return "string";
  }
  if ((desc as any)?.kind === "union") {
    return "json";
  }
  return undefined;
}

export function toPgIdentifier(name: string): string {
  if (name.length <= PG_IDENTIFIER_MAX_LENGTH) return name;
  const hash = createHash("sha1").update(name).digest("hex").slice(0, 8);
  const prefix = name.slice(0, PG_IDENTIFIER_MAX_LENGTH - hash.length - 1);
  return `${prefix}_${hash}`;
}

export function toHashedPgTableName(baseName: string, seed: string): string {
  const hash = createHash("sha1").update(seed).digest("hex").slice(0, 8);
  const prefix = baseName.slice(0, PG_IDENTIFIER_MAX_LENGTH - hash.length - 1);
  return `${prefix}_${hash}`;
}

export function resolveUniquePgTableName(
  exportName: string,
  tableNameOwner: Map<string, string>,
): string {
  const base = snakeCase(exportName);
  const primary =
    base.length <= PG_IDENTIFIER_MAX_LENGTH
      ? base
      : base.slice(0, PG_IDENTIFIER_MAX_LENGTH);
  const currentOwner = tableNameOwner.get(primary);
  if (!currentOwner || currentOwner === exportName) {
    return primary;
  }
  let attempt = 0;
  while (true) {
    const seed = attempt === 0 ? exportName : `${exportName}:${attempt}`;
    const candidate = toHashedPgTableName(base, seed);
    const owner = tableNameOwner.get(candidate);
    if (!owner || owner === exportName) return candidate;
    attempt += 1;
  }
}

export function resolveUniquePgColumnName(
  table: InternalTableSpec,
  rawDbName: string,
  ownerKey: string,
): string {
  const primary =
    rawDbName.length <= PG_IDENTIFIER_MAX_LENGTH
      ? rawDbName
      : rawDbName.slice(0, PG_IDENTIFIER_MAX_LENGTH);
  const currentOwner = table.columnDbNameOwners.get(primary);
  if (!currentOwner || currentOwner === ownerKey) {
    return primary;
  }
  let attempt = 0;
  while (true) {
    const seed =
      attempt === 0
        ? `${table.exportName}:${ownerKey}`
        : `${table.exportName}:${ownerKey}:${attempt}`;
    const candidate = toHashedPgTableName(rawDbName, seed);
    const owner = table.columnDbNameOwners.get(candidate);
    if (!owner || owner === ownerKey) return candidate;
    attempt += 1;
  }
}

export function resolveUniquePgForeignKeyName(
  table: InternalTableSpec,
  rawName: string,
): string {
  const primary = toPgIdentifier(rawName);
  if (!table.foreignKeyNames.has(primary)) {
    return primary;
  }

  let attempt = 0;
  while (true) {
    const seed =
      attempt === 0
        ? `${table.exportName}:${rawName}`
        : `${table.exportName}:${rawName}:${attempt}`;
    const candidate = toHashedPgTableName(rawName, seed);
    if (!table.foreignKeyNames.has(candidate)) {
      return candidate;
    }
    attempt += 1;
  }
}
