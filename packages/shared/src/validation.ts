import { z, ZodType } from "zod";

// Map custom primitive-models (or types) you defined
const customTypeSchemas: Record<string, ZodType<any>> = {
  Asset: z.object({ id: z.string(), url: z.string().url() }),
  RichText: z.object({ html: z.string(), delta: z.array(z.any()) }),
  Url: z.string().url(),
};

export type PrimitiveType = "string" | "number" | "boolean" | "json";
export type EnumValueType = Exclude<PrimitiveType, "json">;
export type EnumValue = string | number | boolean;

type PrimitiveFieldDescriptor = {
  kind?: "primitive";
  type: PrimitiveType;
  optional?: boolean;
  nullable?: boolean;
  customType?: string;
};

type ModelRefFieldDescriptor = {
  kind: "modelRef";
  model: string;
  optional?: boolean;
  nullable?: boolean;
};

type ObjectFieldDescriptor = {
  kind?: "object";
  type: "object";
  properties: Record<string, FieldDescriptor>;
  propertyOrder?: string[];
  optional?: boolean;
  nullable?: boolean;
  customType?: string;
};

type ArrayFieldDescriptor = {
  kind?: "array";
  type: "array";
  items: FieldDescriptor;
  optional?: boolean;
  nullable?: boolean;
  customType?: string;
};

type EnumFieldDescriptor = {
  kind: "enum";
  valueType: EnumValueType;
  values: EnumValue[];
  optional?: boolean;
  nullable?: boolean;
};

type UnionFieldDescriptor = {
  kind: "union";
  anyOf: FieldDescriptor[];
  branchKeys?: string[];
  discriminator?: {
    key: string;
  };
  optional?: boolean;
  nullable?: boolean;
};

// Type definitions for descriptor elements
export type FieldDescriptor =
  | PrimitiveFieldDescriptor
  | ModelRefFieldDescriptor
  | ObjectFieldDescriptor
  | ArrayFieldDescriptor
  | EnumFieldDescriptor
  | UnionFieldDescriptor;

const PRIMITIVE_DESCRIPTOR_TYPES = new Set<PrimitiveType>([
  "string",
  "number",
  "boolean",
  "json",
]);

export type ModelDescriptor = {
  kind: "model";
  properties: Record<string, FieldDescriptor>;
  propertyOrder?: string[];
  presentation?: {
    kind?: "default" | "asset";
    assetKind?: "file" | "image" | "video";
  };
};

export type RootDescriptor = FieldDescriptor;

export type FullDescriptor = {
  models: Record<string, ModelDescriptor>;
  roots: Record<string, RootDescriptor>;
  metadata?: {
    locales?: string[];
    defaultLocale?: string;
    ordering?: {
      roots?: string[];
      models?: string[];
    };
  };
};

function convertDescriptorToZod(
  desc: FieldDescriptor,
  modelZodSchemas: Record<string, ZodType<any>>,
  opts: { loose?: boolean } = {}
): ZodType<any> {
  const applyOptionality = (schema: ZodType<any>) => {
    let out = schema;
    if (desc.nullable || opts.loose) out = out.nullable();
    if (desc.optional || opts.loose) out = out.optional();
    return out;
  };

  const type = (desc as { type?: PrimitiveType }).type;
  const primitiveType =
    desc.kind === "primitive" || PRIMITIVE_DESCRIPTOR_TYPES.has(type as PrimitiveType)
      ? type
      : null;

  if (primitiveType) {
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
    const literals = Array.isArray(desc.values) ? desc.values : [];
    if (!literals.length) {
      switch (desc.valueType) {
        case "number":
          return applyOptionality(z.number());
        case "boolean":
          return applyOptionality(z.boolean());
        case "string":
        default:
          return applyOptionality(z.string());
      }
    }

    if (desc.valueType === "string") {
      const values = literals
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
      if (!values.length) {
        return applyOptionality(z.string());
      }
      const unique = Array.from(new Set(values));
      const [first, ...rest] = unique;
      if (!first) return applyOptionality(z.string());
      return applyOptionality(z.enum([first, ...rest]));
    }

    if (desc.valueType === "number") {
      const values = literals.filter(
        (value): value is number => typeof value === "number" && Number.isFinite(value)
      );
      if (!values.length) return applyOptionality(z.number());
      const unique = Array.from(new Set(values));
      const [first, ...rest] = unique;
      if (first === undefined) return applyOptionality(z.number());
      const schema = rest.length
        ? z.union([z.literal(first), ...rest.map((value) => z.literal(value))] as [
            z.ZodLiteral<number>,
            ...z.ZodLiteral<number>[],
          ])
        : z.literal(first);
      return applyOptionality(schema);
    }

    const values = literals.filter(
      (value): value is boolean => typeof value === "boolean"
    );
    if (!values.length) return applyOptionality(z.boolean());
    if (values.includes(true) && values.includes(false)) {
      return applyOptionality(z.boolean());
    }
    return applyOptionality(z.literal(values[0]!));
  }

  if (desc.kind === "union") {
    const branches = (Array.isArray(desc.anyOf) ? desc.anyOf : [])
      .map((branch) => convertDescriptorToZod(branch, modelZodSchemas, opts))
      .filter(Boolean);
    if (!branches.length) return applyOptionality(z.any());
    if (branches.length === 1) return applyOptionality(branches[0]!);
    const [first, second, ...rest] = branches;
    const schema = z.union([first!, second!, ...(rest as ZodType<any>[])]);
    return applyOptionality(schema);
  }

  if (desc.kind === "modelRef") {
    const schema = modelZodSchemas[desc.model];
    const base = schema ?? z.any();
    // For loose schemas (root singletons), accept either the object or just an id.
    const withId = opts.loose ? z.union([base, z.string()]) : base;
    return applyOptionality(withId);
  }

  if (desc.type === "object" && (desc as any).properties) {
    const shape: Record<string, ZodType<any>> = {};
    for (const [key, valueDesc] of Object.entries((desc as any).properties)) {
      shape[key] = convertDescriptorToZod(
        valueDesc as FieldDescriptor,
        modelZodSchemas,
        opts
      );
    }
    const objectSchema = opts.loose ? z.object(shape).partial() : z.object(shape);
    return applyOptionality(objectSchema);
  }

  if (desc.type === "array" && (desc as any).items) {
    return applyOptionality(
      z.array(
        convertDescriptorToZod(
          (desc as any).items as FieldDescriptor,
          modelZodSchemas,
          opts
        )
      )
    );
  }

  if (typeof (desc as any).type === "string") {
    const custom = customTypeSchemas[(desc as any).type as string];
    if (custom) {
      return applyOptionality(custom);
    }
  }

  return applyOptionality(z.any());
}

export function buildZodSchemasFromDescriptor(descriptor: FullDescriptor) {
  const modelZodSchemas: Record<string, ZodType<any>> = {};
  const zodSchemas: Record<string, ZodType<any>> = {};

  for (const [modelName, modelDesc] of Object.entries(descriptor.models)) {
    const shape: Record<string, ZodType<any>> = {};
    for (const [propName, propDesc] of Object.entries(modelDesc.properties)) {
      shape[propName] = convertDescriptorToZod(propDesc, modelZodSchemas);
    }
    modelZodSchemas[modelName] = z.object(shape);
  }

  for (const [rootKey, rootDesc] of Object.entries(descriptor.roots)) {
    // Root schemas are used for singleton PATCH; make nested structures loose/optional.
    zodSchemas[rootKey] = convertDescriptorToZod(rootDesc, modelZodSchemas, {
      loose: true,
    });
  }

  return { zodSchemas, modelZodSchemas };
}
