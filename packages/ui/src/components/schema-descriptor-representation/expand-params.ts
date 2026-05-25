import type { SchemaDescriptor } from "@cms0/admin-contract";

type ExpandSets = {
  expand: Set<string>;
  expandArrays: Set<string>;
  expandObjects: Set<string>;
};

export type ExpandParams = {
  expand?: string;
  expandArrays?: string;
  expandObjects?: string;
};

const isRecord = (
  value: unknown,
): value is Record<string, SchemaDescriptor | unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function collectExpandPaths(
  descriptor: SchemaDescriptor | undefined,
  basePath: string,
  output: ExpandSets,
) {
  if (!descriptor) return;

  const kind = descriptor.kind;
  const type = descriptor.type;

  if (kind === "modelRef") {
    if (basePath) output.expand.add(basePath);
    return;
  }

  if (kind === "union") {
    const branches = Array.isArray(descriptor.anyOf)
      ? (descriptor.anyOf as SchemaDescriptor[])
      : [];
    for (const branch of branches) {
      collectExpandPaths(branch, basePath, output);
    }
    return;
  }

  if (type === "object") {
    if (basePath) output.expandObjects.add(basePath);
    const properties = isRecord(descriptor.properties)
      ? descriptor.properties
      : {};
    for (const [propName, propDescriptor] of Object.entries(properties)) {
      const nextPath = basePath ? `${basePath}.${propName}` : propName;
      collectExpandPaths(propDescriptor as SchemaDescriptor, nextPath, output);
    }
    return;
  }

  if (type === "array") {
    if (basePath) output.expandArrays.add(basePath);
    const items = descriptor.items;
    if (items) {
      collectExpandPaths(items as SchemaDescriptor, basePath, output);
      if ((items as SchemaDescriptor).type === "object") {
        const itemsAsDesc = items as SchemaDescriptor;
        const childProps = isRecord(itemsAsDesc.properties)
          ? itemsAsDesc.properties
          : {};
        for (const [childName, childDescriptor] of Object.entries(childProps)) {
          collectExpandPaths(
            childDescriptor as SchemaDescriptor,
            `${basePath}.${childName}`,
            output,
          );
        }
      }
    }
  }
}

function toExpandParams(output: ExpandSets): ExpandParams {
  return {
    expand:
      output.expand.size > 0 ? Array.from(output.expand).join(",") : undefined,
    expandArrays:
      output.expandArrays.size > 0
        ? Array.from(output.expandArrays).join(",")
        : undefined,
    expandObjects:
      output.expandObjects.size > 0
        ? Array.from(output.expandObjects).join(",")
        : undefined,
  };
}

export function buildExpandParamsFromDescriptorProperties(
  properties: Record<string, SchemaDescriptor> | undefined,
  options?: {
    prefix?: string;
    includePrefixInExpand?: boolean;
  },
): ExpandParams {
  if (!properties) {
    return {
      expand: undefined,
      expandArrays: undefined,
      expandObjects: undefined,
    };
  }

  const output: ExpandSets = {
    expand: new Set<string>(),
    expandArrays: new Set<string>(),
    expandObjects: new Set<string>(),
  };

  const prefix = options?.prefix?.trim();
  if (prefix && options?.includePrefixInExpand) {
    output.expand.add(prefix);
  }

  for (const [propName, propDescriptor] of Object.entries(properties)) {
    const basePath = prefix ? `${prefix}.${propName}` : propName;
    collectExpandPaths(propDescriptor, basePath, output);
  }

  return toExpandParams(output);
}

export function buildExpandParamsFromFields(
  fields: Array<{ descriptor: SchemaDescriptor; name: string }> | undefined,
): ExpandParams {
  if (!fields || fields.length === 0) {
    return {
      expand: undefined,
      expandArrays: undefined,
      expandObjects: undefined,
    };
  }

  const output: ExpandSets = {
    expand: new Set<string>(),
    expandArrays: new Set<string>(),
    expandObjects: new Set<string>(),
  };

  for (const field of fields) {
    collectExpandPaths(field.descriptor, field.name, output);
  }

  return toExpandParams(output);
}
