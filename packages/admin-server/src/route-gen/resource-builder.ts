import { camelCase } from "lodash";
import type { FieldDescriptor, FullDescriptor, RootDescriptor } from "@cms0/shared";
import type { Resource, TableSpec } from "./types";
import { resolveTable, capitalize, isArrayField, isObjectField } from "./helpers";

function toGeneratedRefBase(value: string): string {
  return value.replace(/[-_](.)/g, (_, char: string) => char.toUpperCase());
}

export function buildResources(
  descriptor: FullDescriptor,
  schema: Record<string, unknown>,
): Resource[] {
  const resources: Resource[] = [];
  const singletonRootLinkByTable = new Map<
    string,
    { table: TableSpec; column: string }
  >();

  const rootTable = resolveTable(schema, "root");

  const addNestedResources = (
    parentTable: TableSpec,
    props: Record<string, FieldDescriptor>,
    parentPath: string[],
    fromArrayItem: boolean,
    parentIsCollection: boolean = false,
  ) => {
    for (const [propName, propDesc] of Object.entries(props)) {
      if (isArrayField(propDesc)) {
        const tableName = `${parentTable.name}${capitalize(propName)}Item`;
        const itemTable = resolveTable(schema, tableName);
        if (!itemTable) continue;
        const fk = `${camelCase(parentTable.name)}Id`;

        resources.push({
          kind: "collection",
          path: [...parentPath, propName].join("/"),
          table: itemTable,
          parent: { table: parentTable, fk },
          parentRootLink: singletonRootLinkByTable.get(parentTable.name),
          item: propDesc.items,
        });

        if (isObjectField(propDesc.items)) {
          const itemProps = (propDesc.items as any).properties || {};
          addNestedResources(
            itemTable,
            itemProps,
            [...parentPath, propName, "{id}"],
            true,
            false,
          );
        }
      } else if (propDesc.kind === "modelRef") {
        if (fromArrayItem) continue;
        const objTableName = camelCase([...parentPath, propName].join(" "));
        const objTable = resolveTable(schema, objTableName);
        if (objTable) {
          const fk = `${camelCase(parentTable.name)}Id`;
          resources.push({
            kind: "singleton",
            path: [...parentPath, propName].join("/"),
            table: objTable,
            descriptor: propDesc,
            rootLink: { table: parentTable, column: fk },
          });
        }
      } else if (isObjectField(propDesc)) {
        const objTableName = `${parentTable.name}${capitalize(propName)}`;
        const objTable = resolveTable(schema, objTableName);
        if (objTable) {
          const fk = `${camelCase(parentTable.name)}Id`;
          resources.push({
            kind: "singleton",
            path: [...parentPath, propName].join("/"),
            table: objTable,
            descriptor: propDesc,
            rootLink: { table: parentTable, column: fk },
          });
          singletonRootLinkByTable.set(objTable.name, {
            table: parentTable,
            column: fk,
          });
          addNestedResources(
            objTable,
            (propDesc as any).properties,
            [...parentPath, propName],
            false,
          );
        }
      }
    }
  };

  for (const [rootKey, rootDesc] of Object.entries<RootDescriptor>(
    descriptor.roots || {},
  )) {
    const kind = (rootDesc as any).kind ?? (rootDesc as any).type;
    if (kind === "object") {
      const objTable = resolveTable(schema, rootKey);
      if (!objTable || !rootTable) continue;
      resources.push({
        kind: "singleton",
        path: rootKey,
        table: objTable,
        descriptor: rootDesc,
        rootLink: { table: rootTable, column: `${toGeneratedRefBase(rootKey)}Id` },
      });
      if ((rootDesc as any).properties) {
        addNestedResources(
          objTable,
          (rootDesc as any).properties,
          [rootKey],
          false,
        );
      }
      continue;
    }
    if (kind === "array") {
      const itemTable = resolveTable(schema, `${rootKey}Item`);
      if (!itemTable) continue;
      const parentFk = rootTable ? `${camelCase(rootTable.name)}Id` : undefined;
      resources.push({
        kind: "collection",
        path: rootKey,
        table: itemTable,
        parent:
          rootTable && parentFk
            ? { table: rootTable, fk: parentFk }
            : undefined,
        item: (rootDesc as any).items as FieldDescriptor,
      });

      const items = (rootDesc as any).items;
      if (isObjectField(items)) {
        const itemProps = (items as any).properties || {};
        addNestedResources(itemTable, itemProps, [rootKey], true, false);
      }

      continue;
    }
    if (rootTable) {
      resources.push({
        kind: "singleton",
        path: rootKey,
        table: rootTable,
        descriptor: rootDesc,
      });
    }
  }

  for (const [modelName, modelDesc] of Object.entries(
    descriptor.models || {},
  )) {
    const modelTable = resolveTable(schema, modelName);
    if (!modelTable) continue;
    resources.push({
      kind: "collection",
      path: `models/${modelName}`,
      table: modelTable,
      item: {
        type: "object",
        properties: modelDesc.properties,
      } as FieldDescriptor,
    });
    if ((modelDesc as any)?.properties) {
      addNestedResources(
        modelTable,
        (modelDesc as any).properties,
        ["models", modelName, "{id}"],
        true,
      );
    }
  }

  return resources;
}
