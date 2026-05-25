import { z } from "zod";

export * from "./validation.js";
export * from "./union.js";
export * from "./descriptor-capabilities.js";
export * from "./asset-storage.js";
export * from "./graph-query.js";

export const environmentKeySchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/);

export const emailTransportKindSchema = z.enum(["log", "smtp", "plunk"]);

export const storageProviderKindSchema = z.enum(["filesystem", "s3"]);

export const emailAddressSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(160).nullable().optional(),
});

export type EmailAddress = z.infer<typeof emailAddressSchema>;

export const logEmailTransportConfigSchema = z.object({
  kind: z.literal("log"),
});

export const smtpEmailTransportConfigSchema = z.object({
  kind: z.literal("smtp"),
  host: z.string().trim().min(1),
  password: z.string().nullable().optional(),
  port: z.int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().trim().min(1).nullable().optional(),
});

export const plunkEmailTransportConfigSchema = z.object({
  baseUrl: z.url().nullable().optional(),
  kind: z.literal("plunk"),
  secretKey: z
    .string()
    .trim()
    .min(1)
    .refine((value) => value.startsWith("sk_"), {
      message: 'Plunk secret key must start with "sk_".',
    }),
});

export const emailTransportConfigSchema = z.discriminatedUnion("kind", [
  logEmailTransportConfigSchema,
  smtpEmailTransportConfigSchema,
  plunkEmailTransportConfigSchema,
]);

export type LogEmailTransportConfig = z.infer<
  typeof logEmailTransportConfigSchema
>;
export type SmtpEmailTransportConfig = z.infer<
  typeof smtpEmailTransportConfigSchema
>;
export type PlunkEmailTransportConfig = z.infer<
  typeof plunkEmailTransportConfigSchema
>;
export type EmailTransportConfig = z.infer<typeof emailTransportConfigSchema>;

export const fileSystemStorageProviderConfigSchema = z.object({
  kind: z.literal("filesystem"),
  rootPath: z.string().trim().min(1),
});

export const s3StorageProviderConfigSchema = z.object({
  accessKeyId: z.string().trim().min(1),
  bucket: z.string().trim().min(1),
  endpoint: z.url().nullable().optional(),
  forcePathStyle: z.boolean(),
  kind: z.literal("s3"),
  prefix: z.string().trim().min(1).nullable().optional(),
  region: z.string().trim().min(1),
  secretAccessKey: z.string().trim().min(1),
});

export const storageProviderConfigSchema = z.discriminatedUnion("kind", [
  fileSystemStorageProviderConfigSchema,
  s3StorageProviderConfigSchema,
]);

export type FileSystemStorageProviderConfig = z.infer<
  typeof fileSystemStorageProviderConfigSchema
>;
export type S3StorageProviderConfig = z.infer<
  typeof s3StorageProviderConfigSchema
>;
export type StorageProviderConfig = z.infer<typeof storageProviderConfigSchema>;

type DescriptorObject = Record<string, unknown>;

export type DescriptorFieldKind =
  | "primitive"
  | "object"
  | "array"
  | "modelRef";

export type DescriptorFieldEntry = {
  descriptor: DescriptorObject;
  name: string;
  required: boolean;
  type: string;
};

export type ResolvedDescriptorPath = {
  apiPath: string;
  descriptor: DescriptorObject;
  fields: DescriptorFieldEntry[];
  kind: DescriptorFieldKind;
  segments: string[];
} | null;

export const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const invariant = (
  condition: unknown,
  message: string,
): asserts condition => {
  if (!condition) {
    throw new Error(message);
  }
};

const isDescriptorObject = (value: unknown): value is DescriptorObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readDescriptorFieldType = (value: unknown) => {
  if (!isDescriptorObject(value)) {
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

  if (isDescriptorObject(value.properties)) {
    return "object";
  }

  if (Array.isArray(value.enum)) {
    return "enum";
  }

  if (typeof value.model === "string" && value.model.trim().length > 0) {
    return `model:${value.model}`;
  }

  return "unknown";
};

export const readDescriptorFields = (
  descriptor: unknown,
): DescriptorFieldEntry[] => {
  if (!isDescriptorObject(descriptor)) {
    return [];
  }

  const properties = isDescriptorObject(descriptor.properties)
    ? descriptor.properties
    : {};
  const required = new Set(
    Array.isArray(descriptor.required)
      ? descriptor.required.filter((value): value is string => typeof value === "string")
      : [],
  );

  return Object.entries(properties).map(([name, fieldDescriptor]) => ({
    descriptor: isDescriptorObject(fieldDescriptor) ? fieldDescriptor : {},
    name,
    required: required.has(name),
    type: readDescriptorFieldType(fieldDescriptor),
  }));
};

export const getDescriptorFieldKind = (
  descriptor: unknown,
): DescriptorFieldKind => {
  if (!isDescriptorObject(descriptor)) {
    return "primitive";
  }

  if (descriptor.kind === "modelRef") {
    return "modelRef";
  }

  if (descriptor.type === "array") {
    return "array";
  }

  if (descriptor.type === "object" || isDescriptorObject(descriptor.properties)) {
    return "object";
  }

  if (typeof descriptor.model === "string" && descriptor.model.trim().length > 0) {
    return "modelRef";
  }

  return "primitive";
};

const normalizeDescriptorPath = (value: string | string[] | undefined) => {
  const joined = Array.isArray(value) ? value.join("/") : (value ?? "");
  return joined.replace(/^\/+|\/+$/g, "");
};

export const resolveDescriptorPath = (
  descriptor: unknown,
  value: string | string[] | undefined,
): ResolvedDescriptorPath => {
  if (!isDescriptorObject(descriptor) || !isDescriptorObject(descriptor.roots)) {
    return null;
  }

  const path = normalizeDescriptorPath(value);
  if (!path) {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  const [rootName, ...rest] = segments;
  if (!rootName) {
    return null;
  }

  const rootDescriptor = descriptor.roots[rootName];
  if (!isDescriptorObject(rootDescriptor)) {
    return null;
  }
  let current: DescriptorObject = rootDescriptor;

  const resolvedSegments = [rootName];

  for (const segment of rest) {
    let kind = getDescriptorFieldKind(current);

    if (kind === "array") {
      const itemDescriptor = isDescriptorObject(current.items)
        ? current.items
        : null;
      if (!itemDescriptor) {
        return null;
      }
      current = itemDescriptor;

      kind = getDescriptorFieldKind(current);

      if (/^\d+$/.test(segment)) {
        continue;
      }
    }

    if (kind === "object") {
      const next: unknown = isDescriptorObject(current.properties)
        ? current.properties[segment]
        : null;

      if (!isDescriptorObject(next)) {
        return null;
      }

      current = next;
      resolvedSegments.push(segment);
      continue;
    }

    return null;
  }

  return {
    apiPath: path,
    descriptor: current,
    fields: readDescriptorFields(current),
    kind: getDescriptorFieldKind(current),
    segments: resolvedSegments,
  };
};
