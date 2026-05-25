import vm from "node:vm";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as pgCore from "drizzle-orm/pg-core";
import type { FullDescriptor } from "@cms0/shared";
import { generateRuntimeSchemaCode } from "./schema-generator";
import { buildResources } from "./route-gen/resource-builder";
import { buildResourceSchemas } from "./route-gen/schema-builder";
import { buildCollectionHandlers } from "./route-gen/collection-handlers";
import { buildSingletonHandlers } from "./route-gen/singleton-handlers";
import type { Resource } from "./route-gen/types";
import type { RuntimeAssetStore } from "./storage-driver";

export type ContentEngineHandlers = {
  collectionHandlers: Map<string, ReturnType<typeof buildCollectionHandlers>>;
  singletonHandlers: Map<string, ReturnType<typeof buildSingletonHandlers>>;
  resourceMap: Map<string, Resource>;
};

export function evaluateSchemaInMemory(
  descriptor: FullDescriptor,
): Record<string, unknown> {
  const { cjsCode } = generateRuntimeSchemaCode(descriptor);

  const moduleObj = { exports: {} as Record<string, unknown> };
  const context = vm.createContext({
    module: moduleObj,
    exports: moduleObj.exports,
    require: (id: string) => {
      if (id === "drizzle-orm/pg-core") return pgCore;
      throw new Error(`Cannot require "${id}" in schema eval context`);
    },
    console,
  });

  vm.runInContext(cjsCode, context);
  return moduleObj.exports as Record<string, unknown>;
}

export function buildContentEngineHandlers(
  pool: pg.Pool,
  descriptor: FullDescriptor,
  assetStore?: RuntimeAssetStore,
): ContentEngineHandlers {
  const schema = evaluateSchemaInMemory(descriptor);
  const db = drizzle(pool, { schema: schema as any });

  const resources = buildResources(descriptor, schema);
  const resourceSchemas = buildResourceSchemas(descriptor, resources);

  const tableResourceByName = new Map<string, Resource>();
  const resourceMap = new Map<string, Resource>();
  const collectionHandlers = new Map<string, ReturnType<typeof buildCollectionHandlers>>();
  const singletonHandlers = new Map<string, ReturnType<typeof buildSingletonHandlers>>();

  for (const resource of resources) {
    resourceMap.set(resource.path, resource);
    tableResourceByName.set(resource.table.name, resource);
  }

  for (const resource of resources) {
    if (resource.kind === "collection") {
      collectionHandlers.set(
        resource.path,
        buildCollectionHandlers(
          db,
          schema,
          resource,
          resource.path,
          resourceSchemas[resource.path]?.item,
          resourceSchemas[resource.path]?.array,
          tableResourceByName,
          assetStore,
        ),
      );
    } else {
      singletonHandlers.set(
        resource.path,
        buildSingletonHandlers(
          db,
          schema,
          resource,
          resource.path,
          resource.descriptor,
          resourceSchemas[resource.path]?.item,
          tableResourceByName,
        ),
      );
    }
  }

  return { collectionHandlers, singletonHandlers, resourceMap };
}
