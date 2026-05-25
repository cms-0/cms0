import "server-only";

import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";
import type { SchemaDescriptorSnapshot } from "@cms0/admin-contract";

type SchemaObject = Record<string, unknown>;

export type SchemaCollectionKind = "models" | "roots";

export type SchemaCollectionEntry = {
  descriptor: SchemaObject;
  fields: SchemaFieldEntry[];
  name: string;
};

export type SchemaFieldEntry = {
  descriptor: SchemaObject;
  name: string;
  required: boolean;
  type: string;
};

const isRecord = (value: unknown): value is SchemaObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readCollectionMap = (
  snapshot: SchemaDescriptorSnapshot | null,
  kind: SchemaCollectionKind,
) => {
  const value = snapshot?.descriptor[kind];
  return isRecord(value) ? value : null;
};

const readFieldType = (value: unknown) => {
  if (!isRecord(value)) {
    return "unknown";
  }

  if (value.kind === "union") {
    return "union";
  }

  if (typeof value.type === "string" && value.type.trim().length > 0) {
    return value.type;
  }

  if (Array.isArray(value.type) && value.type.length > 0) {
    return value.type.filter((item) => typeof item === "string").join(" | ");
  }

  if (isRecord(value.properties)) {
    return "object";
  }

  if (Array.isArray(value.enum)) {
    return "enum";
  }

  return "unknown";
};

export const readSchemaCollectionEntries = (
  snapshot: SchemaDescriptorSnapshot | null,
  kind: SchemaCollectionKind,
): SchemaCollectionEntry[] => {
  const collection = readCollectionMap(snapshot, kind);

  if (!collection) {
    return [];
  }

  return Object.entries(collection).map(([name, descriptor]) => {
    const objectDescriptor = isRecord(descriptor) ? descriptor : {};
    const properties = isRecord(objectDescriptor.properties)
      ? objectDescriptor.properties
      : {};
    const required = new Set(
      Array.isArray(objectDescriptor.required)
        ? objectDescriptor.required.filter((value): value is string => typeof value === "string")
        : [],
    );

    const fields = Object.entries(properties).map(([fieldName, fieldDescriptor]) => ({
      descriptor: isRecord(fieldDescriptor) ? fieldDescriptor : {},
      name: fieldName,
      required: required.has(fieldName),
      type: readFieldType(fieldDescriptor),
    }));

    return {
      descriptor: objectDescriptor,
      fields,
      name,
    };
  });
};

export const getSchemaEntryByName = (
  snapshot: SchemaDescriptorSnapshot | null,
  kind: SchemaCollectionKind,
  name: string,
) => readSchemaCollectionEntries(snapshot, kind).find((entry) => entry.name === name) ?? null;

export const countSchemaFields = (entries: SchemaCollectionEntry[]) =>
  entries.reduce((count, entry) => count + entry.fields.length, 0);

export const formatPublishedAt = (value: string | null | undefined) => {
  if (!value) {
    return "Not published yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
};

export const formatBytes = (value: number) => {
  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MB`;
};

export const measureDescriptorBytes = (
  snapshot: SchemaDescriptorSnapshot | null,
) =>
  new TextEncoder().encode(
    JSON.stringify(snapshot?.descriptor ?? {}, null, 2),
  ).length;

const adminBasePath = buildSelfHostedAdminBasePath();

export const runtimeRoutes = [
  {
    description: "Runtime status and active descriptor version.",
    href: `${adminBasePath}/health`,
    label: "/health",
  },
  {
    description: "Resolved environment context for the self-hosted adapter.",
    href: `${adminBasePath}/context`,
    label: "/context",
  },
  {
    description: "Latest persisted schema snapshot for this environment.",
    href: `${adminBasePath}/schema/latestSnapshot`,
    label: "/schema/latestSnapshot",
  },
  {
    description: "Latest generated TypeScript view of the descriptor.",
    href: `${adminBasePath}/schema/typescript/latest`,
    label: "/schema/typescript/latest",
  },
];
