"use client";

import type {
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
} from "@cms0/admin-contract";

import {
  isRecord,
  isModelRefIdentity,
  materializeDescriptorRecord,
  resolveAssetKindFromDescriptor,
  resolveModelRefFromItem,
} from "./helpers";

const imageExtension = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i;
const videoExtension = /\.(mp4|webm|mov|m4v|mkv|avi)$/i;

const readOptionalString = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const toCamelCase = (value: string) =>
  value
    .replace(/[-_\s]+(.)?/g, (_, captured: string | undefined) =>
      captured ? captured.toUpperCase() : "",
    )
    .replace(/^(.)/, (char) => char.toLowerCase());

const toSnakeCase = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[-\s]+/g, "_")
    .toLowerCase();

const getRawFieldValue = (
  container: Record<string, unknown> | undefined,
  fieldName: string,
) => {
  if (!container) return undefined;

  return (
    container[fieldName] ??
    container[toCamelCase(fieldName)] ??
    container[toSnakeCase(fieldName)]
  );
};

const getExpandedModelRef = (
  container: Record<string, unknown> | undefined,
  fieldName: string,
  modelName?: string,
) => {
  if (!container) return undefined;

  const modelNameCamel = modelName ? toCamelCase(modelName) : undefined;
  const fieldNameCamel = toCamelCase(fieldName);

  const candidates = [
    fieldName,
    fieldNameCamel,
    `${fieldNameCamel}Model`,
    `${fieldNameCamel}Ref`,
    modelName,
    modelNameCamel,
    modelNameCamel ? `${modelNameCamel}Model` : undefined,
    modelNameCamel ? `${modelNameCamel}Ref` : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  for (const candidate of candidates) {
    const value = container[candidate];
    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
};

const resolveModelRefForeignKey = (
  container: Record<string, unknown> | undefined,
  fieldName: string,
  modelName?: string,
) => {
  if (!container) return undefined;

  const fieldNameCamel = toCamelCase(fieldName);
  const modelNameCamel = modelName ? toCamelCase(modelName) : undefined;

  const fkCandidates = [
    `${fieldName}Id`,
    `${fieldNameCamel}Id`,
    `${toSnakeCase(fieldName)}_id`,
    modelNameCamel ? `${modelNameCamel}Id` : undefined,
    modelNameCamel ? `${toSnakeCase(modelNameCamel)}_id` : undefined,
  ].filter((entry): entry is string => Boolean(entry));

  for (const key of fkCandidates) {
    const value = container[key];
    if (value != null) {
      return value;
    }
  }

  return undefined;
};

export const inferAssetKindFromFilename = (filename: string) => {
  if (videoExtension.test(filename)) {
    return "video" as const;
  }
  if (imageExtension.test(filename)) {
    return "image" as const;
  }
  return "file" as const;
};

const resolveAssetKindFromModelName = (modelName?: string) => {
  const normalized = (modelName ?? "").trim().toLowerCase();
  if (normalized === "image") return "image" as const;
  if (normalized === "video") return "video" as const;
  if (normalized === "file") return "file" as const;
  return undefined;
};

const readAssetFilename = (value: Record<string, unknown>) => {
  const filenameCandidates = [
    value.filename,
    value.fileName,
    value.file_name,
    value.path,
    value.key,
  ];

  for (const candidate of filenameCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  if (typeof value.url === "string" && value.url.trim().length > 0) {
    const url = value.url.trim();
    const parts = url.split("/").filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : undefined;
  }

  return undefined;
};

const normalizeAssetObject = (value: Record<string, unknown>) => {
  const filename = readAssetFilename(value);
  if (!filename) return undefined;
  return {
    ...value,
    filename,
  };
};

const findAssetObject = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isRecord(value)) return undefined;
  const direct = normalizeAssetObject(value);
  if (direct) return direct;

  for (const nestedKey of [
    "value",
    "data",
    "asset",
    "file",
    "image",
    "video",
  ]) {
    const nested = value[nestedKey];
    if (isRecord(nested)) {
      const normalized = normalizeAssetObject(nested);
      if (normalized) return normalized;
    }
  }

  return undefined;
};

const findRelatedAssetObject = (
  rowValue: unknown,
  columnName: string,
  cellValue: unknown,
  descriptor?: SchemaDescriptor,
) => {
  if (!isRecord(rowValue)) return undefined;

  const fromCell = findAssetObject(cellValue);
  if (fromCell) return fromCell;

  const modelName =
    descriptor && typeof descriptor.model === "string" ? descriptor.model : "";
  const modelNameLower = modelName.toLowerCase();
  const columnLower = columnName.toLowerCase();
  const cellText =
    typeof cellValue === "string" || typeof cellValue === "number"
      ? String(cellValue)
      : undefined;

  for (const [key, value] of Object.entries(rowValue)) {
    const candidate = findAssetObject(value);
    if (!candidate) continue;

    const keyLower = key.toLowerCase();
    const keyMatches =
      keyLower === columnLower ||
      keyLower.includes(columnLower) ||
      (modelNameLower.length > 0 && keyLower.includes(modelNameLower));

    if (keyMatches) {
      return candidate;
    }

    if (cellText) {
      const candidateId = candidate.id;
      const candidateName =
        typeof candidate.name === "string"
          ? candidate.name
          : typeof candidate.title === "string"
            ? candidate.title
            : typeof candidate.label === "string"
              ? candidate.label
              : typeof candidate.filename === "string"
                ? candidate.filename
                : undefined;

      if (
        (candidateId != null && String(candidateId) === cellText) ||
        (candidateName != null && candidateName === cellText)
      ) {
        return candidate;
      }
    }
  }
  return undefined;
};

const shouldParseSerializedJson = (
  descriptor: SchemaDescriptor | undefined,
  value: unknown,
) => {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (
    trimmed.length < 2 ||
    (!trimmed.startsWith("{") && !trimmed.startsWith("["))
  ) {
    return false;
  }

  if (!descriptor) return true;

  // Check for LocalizedRichText and LocalizedString custom types
  if (
    descriptor.customType === "LocalizedRichText" ||
    descriptor.customType === "LocalizedString"
  ) {
    return true;
  }

  return (
    descriptor.kind === "modelRef" ||
    descriptor.kind === "union" ||
    descriptor.type === "object" ||
    descriptor.type === "array" ||
    descriptor.type === "json"
  );
};

export const coerceDescriptorValue = (
  descriptor: SchemaDescriptor | undefined,
  value: unknown,
) => {
  if (!shouldParseSerializedJson(descriptor, value)) {
    return value;
  }

  try {
    return JSON.parse(value as string);
  } catch {
    return value;
  }
};

const readDescriptorProperties = (
  descriptor: SchemaDescriptor | null | undefined,
) =>
  isRecord(descriptor?.properties)
    ? (descriptor.properties as Record<string, SchemaDescriptor>)
    : {};

const hasDescriptorBackedValue = (
  value: Record<string, unknown>,
  descriptor: SchemaDescriptor | null | undefined,
) => {
  const properties = readDescriptorProperties(descriptor);
  const propertyKeys = Object.keys(properties);
  if (propertyKeys.length === 0) {
    return false;
  }

  const materialized = materializeDescriptorRecord(value, descriptor!) ?? value;
  return propertyKeys.some((key) => Object.hasOwn(materialized, key));
};

const normalizeDescriptorRecordFields = (
  value: unknown,
  descriptor: SchemaDescriptor | null | undefined,
) => {
  const baseRecord = isRecord(value) ? value : { value };
  const materialized =
    descriptor && isRecord(descriptor)
      ? (materializeDescriptorRecord(baseRecord, descriptor) ?? baseRecord)
      : baseRecord;
  const properties = readDescriptorProperties(descriptor);

  if (Object.keys(properties).length === 0) {
    return materialized;
  }

  const normalized: Record<string, unknown> = { ...materialized };
  for (const [key, propertyDescriptor] of Object.entries(properties)) {
    normalized[key] = resolveCollectionCellValue(
      materialized,
      key,
      propertyDescriptor,
    );
  }

  return normalized;
};

export type NormalizedDescriptorTableRow = {
  modelRefId?: string;
  row: Record<string, unknown>;
  source: unknown;
};

export const normalizeDescriptorTableRow = ({
  itemDescriptor,
  modelDescriptor,
  modelEntriesById,
  modelName,
  row,
}: {
  itemDescriptor?: SchemaDescriptor;
  modelDescriptor?: SchemaDescriptor | null;
  modelEntriesById?: ReadonlyMap<string, Record<string, unknown>>;
  modelName?: string;
  row: unknown;
}): NormalizedDescriptorTableRow => {
  const rowRecord = isRecord(row) ? row : { value: row };

  if (itemDescriptor?.kind === "modelRef") {
    const resolution = resolveModelRefFromItem(row, modelName);
    const directModelId =
      resolution.id == null &&
      isModelRefIdentity(rowRecord.id) &&
      hasDescriptorBackedValue(rowRecord, modelDescriptor)
        ? rowRecord.id
        : undefined;
    const modelRefId =
      resolution.id != null
        ? String(resolution.id)
        : directModelId != null
          ? String(directModelId)
          : undefined;
    const linkedEntry = modelRefId
      ? modelEntriesById?.get(modelRefId)
      : undefined;
    const modelSource = linkedEntry ?? resolution.modelObject ?? rowRecord;

    return {
      modelRefId,
      row: normalizeDescriptorRecordFields(
        modelSource,
        modelDescriptor ?? itemDescriptor,
      ),
      source: row,
    };
  }

  if (itemDescriptor?.type === "object" || isRecord(itemDescriptor?.properties)) {
    return {
      row: normalizeDescriptorRecordFields(rowRecord, itemDescriptor),
      source: row,
    };
  }

  return {
    row: rowRecord,
    source: row,
  };
};

export const resolveCollectionCellValue = (
  row: Record<string, unknown>,
  columnName: string,
  descriptor: SchemaDescriptor | undefined,
) => {
  const wrappedValueContainer = isRecord(row.value)
    ? (row.value as Record<string, unknown>)
    : undefined;
  let directValue =
    getRawFieldValue(row, columnName) ??
    getRawFieldValue(wrappedValueContainer, columnName);

  if (
    directValue == null &&
    columnName === "value" &&
    (descriptor?.kind === "modelRef" || descriptor?.type === "object")
  ) {
    directValue = wrappedValueContainer ?? row;
  }

  if (descriptor?.kind !== "modelRef") {
    return coerceDescriptorValue(descriptor, directValue);
  }

  if (isRecord(directValue)) {
    return coerceDescriptorValue(descriptor, directValue);
  }

  const modelName =
    typeof descriptor.model === "string" ? descriptor.model : undefined;
  const expanded =
    getExpandedModelRef(row, columnName, modelName) ??
    getExpandedModelRef(wrappedValueContainer, columnName, modelName);
  if (expanded) {
    return coerceDescriptorValue(descriptor, expanded);
  }

  const foreignKey =
    resolveModelRefForeignKey(row, columnName, modelName) ??
    resolveModelRefForeignKey(wrappedValueContainer, columnName, modelName);
  if (foreignKey != null) {
    return coerceDescriptorValue(descriptor, foreignKey);
  }

  return coerceDescriptorValue(descriptor, directValue);
};

export const resolveNestedArrayCellValue = (
  row: unknown,
  columnName: string,
  descriptor: SchemaDescriptor | undefined,
) => {
  if (!isRecord(row)) {
    return coerceDescriptorValue(descriptor, undefined);
  }

  if (
    columnName === "value" &&
    (descriptor?.kind === "modelRef" || descriptor?.type === "object")
  ) {
    return coerceDescriptorValue(descriptor, row);
  }

  return resolveCollectionCellValue(row, columnName, descriptor);
};

export const resolveCellAsset = (
  columnName: string,
  rowValue: unknown,
  cellValue: unknown,
  descriptor?: SchemaDescriptor,
  schemaSnapshot?: SchemaDescriptorSnapshot | null,
) => {
  const modelKind =
    resolveAssetKindFromDescriptor(descriptor, schemaSnapshot) ??
    resolveAssetKindFromModelName(
      descriptor && typeof descriptor.model === "string"
        ? descriptor.model
        : undefined,
    );
  const shouldTryRowAssetLookup =
    modelKind != null || columnName.toLowerCase() === "filename";

  const assetObject = shouldTryRowAssetLookup
    ? (findRelatedAssetObject(rowValue, columnName, cellValue, descriptor) ??
      (isRecord(cellValue) ? cellValue : undefined))
    : isRecord(cellValue)
      ? cellValue
      : undefined;

  if (assetObject && typeof assetObject.filename === "string") {
    const kind = modelKind ?? inferAssetKindFromFilename(assetObject.filename);

    return {
      kind,
      filename: assetObject.filename,
      url: readOptionalString(assetObject.url),
      alt: readOptionalString(assetObject.alt),
    };
  }

  if (
    columnName.toLowerCase() === "filename" &&
    typeof cellValue === "string"
  ) {
    const rowAlt =
      isRecord(rowValue) && typeof rowValue.alt === "string"
        ? rowValue.alt
        : undefined;

    return {
      kind: inferAssetKindFromFilename(cellValue),
      filename: cellValue,
      url:
        isRecord(rowValue) && typeof rowValue.url === "string"
          ? rowValue.url
          : undefined,
      alt: readOptionalString(rowAlt),
    };
  }

  if (modelKind) {
    return {
      kind: modelKind,
      alt:
        isRecord(cellValue) && typeof cellValue.alt === "string"
          ? cellValue.alt
          : undefined,
    };
  }

  return undefined;
};
