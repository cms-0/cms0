export type ContentNavigationTreeNode = {
  children?: ContentNavigationTreeNode[];
  label: string;
  pathSegments: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isObjectDescriptor = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && value.type === "object" && isRecord(value.properties);

const isArrayDescriptor = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && value.type === "array" && value.items !== undefined;

export const normalizeContentNavigationNameOrder = (
  names: string[],
  hint?: string[] | null,
): string[] => {
  const uniqueNames = Array.from(new Set(names));
  if (!Array.isArray(hint) || hint.length === 0) {
    return uniqueNames;
  }

  const normalizedHint = hint
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  const hinted = normalizedHint.filter((name, index) => {
    return uniqueNames.includes(name) && normalizedHint.indexOf(name) === index;
  });

  const remaining = uniqueNames.filter((name) => !hinted.includes(name));
  return [...hinted, ...remaining];
};

const orderEntriesByName = <T extends [string, unknown]>(
  entries: T[],
  orderedNames: string[],
): T[] => {
  const indexMap = new Map(orderedNames.map((name, index) => [name, index]));
  return [...entries].sort((left, right) => {
    const leftIndex = indexMap.get(left[0]);
    const rightIndex = indexMap.get(right[0]);
    if (leftIndex === undefined && rightIndex === undefined) {
      return 0;
    }
    if (leftIndex === undefined) {
      return 1;
    }
    if (rightIndex === undefined) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
};

const buildContentNavigationTreeNode = (
  name: string,
  descriptor: unknown,
  path: string[],
  isRoot: boolean,
): ContentNavigationTreeNode | null => {
  const currentPath = [...path, name];

  if (isArrayDescriptor(descriptor)) {
    const itemsDescriptor = descriptor.items;
    const children = isArrayDescriptor(itemsDescriptor)
      ? [
          buildContentNavigationTreeNode(
            "items",
            itemsDescriptor,
            currentPath,
            false,
          ),
        ].filter((item): item is ContentNavigationTreeNode => Boolean(item))
      : [];

    return {
      children: children.length ? children : undefined,
      label: name,
      pathSegments: currentPath,
    };
  }

  if (isObjectDescriptor(descriptor)) {
    const properties = descriptor.properties as Record<string, unknown>;
    const children = Object.entries(properties)
      .map(([propertyName, propertyDescriptor]) =>
        buildContentNavigationTreeNode(
          propertyName,
          propertyDescriptor,
          currentPath,
          false,
        ),
      )
      .filter((item): item is ContentNavigationTreeNode => Boolean(item));

    return {
      children: children.length ? children : undefined,
      label: name,
      pathSegments: currentPath,
    };
  }

  if (isRoot) {
    return {
      label: name,
      pathSegments: currentPath,
    };
  }

  return null;
};

export const buildContentNavigationTree = (
  roots: Record<string, unknown> | null,
  rootsOrderHint?: string[] | null,
): ContentNavigationTreeNode[] => {
  if (!roots) {
    return [];
  }

  const orderedRootNames = normalizeContentNavigationNameOrder(
    Object.keys(roots),
    rootsOrderHint,
  );
  const orderedRoots = orderEntriesByName(
    Object.entries(roots),
    orderedRootNames,
  );

  return orderedRoots
    .map(([name, descriptor]) =>
      buildContentNavigationTreeNode(name, descriptor, [], true),
    )
    .filter((item): item is ContentNavigationTreeNode => Boolean(item));
};
