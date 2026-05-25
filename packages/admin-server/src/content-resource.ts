import type {
  AdminContentField,
  AdminContentResource,
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
} from "@cms0/admin-contract";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const readDescriptorFieldType = (value: unknown) => {
  if (!isRecord(value)) {
    return "unknown";
  }

  if (value.kind === "union") {
    return "union";
  }

  // Check customType first for LocalizedRichText, LocalizedString, RichText, etc.
  if (value.customType === "LocalizedRichText") {
    return "localizedRichText";
  }
  if (value.customType === "LocalizedString") {
    return "localizedString";
  }
  if (value.customType === "RichText") {
    return "richText";
  }

  if (typeof value.type === "string" && value.type.trim().length > 0) {
    return value.type;
  }

  if (Array.isArray(value.type) && value.type.length > 0) {
    return value.type
      .filter((item): item is string => typeof item === "string")
      .join(" | ");
  }

  if (isRecord(value.properties)) {
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

const readDescriptorFields = (
  descriptor: SchemaDescriptor,
): AdminContentField[] => {
  if (!isRecord(descriptor)) {
    return [];
  }

  const properties = isRecord(descriptor.properties)
    ? descriptor.properties
    : {};
  const required = new Set(
    Array.isArray(descriptor.required)
      ? descriptor.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );

  return Object.entries(properties).map(([name, fieldDescriptor]) => ({
    descriptor: isRecord(fieldDescriptor)
      ? (fieldDescriptor as SchemaDescriptor)
      : {},
    name,
    required: required.has(name),
    type: readDescriptorFieldType(fieldDescriptor),
  }));
};

const getDescriptorKind = (
  descriptor: SchemaDescriptor,
): AdminContentResource["kind"] => {
  if (descriptor.kind === "modelRef") {
    return "modelRef";
  }

  if (descriptor.type === "array") {
    return "array";
  }

  if (descriptor.type === "object" || isRecord(descriptor.properties)) {
    return "object";
  }

  if (
    typeof descriptor.model === "string" &&
    descriptor.model.trim().length > 0
  ) {
    return "modelRef";
  }

  return "primitive";
};

export const resolveContentResource = (
  snapshot: SchemaDescriptorSnapshot | null,
  value: string | string[] | undefined,
): AdminContentResource | null => {
  const descriptor = snapshot?.descriptor;
  if (!isRecord(descriptor)) {
    return null;
  }

  const path = (Array.isArray(value) ? value.join("/") : (value ?? "")).replace(
    /^\/+|\/+$/g,
    "",
  );

  if (!path) {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  const [firstSegment, ...rest] = segments;
  if (!firstSegment) {
    return null;
  }

  if (firstSegment === "models") {
    const modelName = rest[0];
    const models = isRecord(descriptor.models) ? descriptor.models : {};
    const modelDescriptor = modelName ? models[modelName] : null;

    if (!modelName || !isRecord(modelDescriptor)) {
      return null;
    }

    const editorDescriptor: SchemaDescriptor = {
      type: "object",
      properties: isRecord(modelDescriptor.properties)
        ? modelDescriptor.properties
        : {},
      required: Array.isArray(modelDescriptor.required)
        ? modelDescriptor.required
        : [],
    };

    return {
      apiPath: `models/${modelName}`,
      descriptor: {
        type: "array",
        items: editorDescriptor,
      },
      displayName: modelName,
      editorDescriptor,
      fields: readDescriptorFields(editorDescriptor),
      kind: "array",
      segments: ["models", modelName],
    };
  }

  const roots = isRecord(descriptor.roots) ? descriptor.roots : {};
  const rootDescriptor = roots[firstSegment];
  if (!isRecord(rootDescriptor)) {
    return null;
  }

  let current = rootDescriptor as SchemaDescriptor;
  const resolvedSegments = [firstSegment];

  for (const segment of rest) {
    const kind = getDescriptorKind(current);

    if (kind === "array") {
      const itemDescriptor = isRecord(current.items)
        ? (current.items as SchemaDescriptor)
        : {};
      current = itemDescriptor;

      if (/^\d+$/.test(segment)) {
        continue;
      }
    }

    if (getDescriptorKind(current) !== "object") {
      return null;
    }

    const properties = isRecord(current.properties) ? current.properties : {};
    const nextDescriptor = properties[segment];
    if (!isRecord(nextDescriptor)) {
      return null;
    }

    current = nextDescriptor as SchemaDescriptor;
    resolvedSegments.push(segment);
  }

  const kind = getDescriptorKind(current);
  const editorDescriptor =
    kind === "array" && isRecord(current.items)
      ? (current.items as SchemaDescriptor)
      : current;

  return {
    apiPath: path,
    descriptor: current,
    displayName: resolvedSegments.at(-1) ?? firstSegment,
    editorDescriptor,
    fields: readDescriptorFields(editorDescriptor),
    kind,
    segments: resolvedSegments,
  };
};
