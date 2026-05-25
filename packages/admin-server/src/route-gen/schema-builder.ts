import { z } from "zod";
import type { FullDescriptor } from "@cms0/shared";
import { buildZodSchemasFromDescriptor } from "@cms0/shared";
import type { Resource, ResourceSchemas } from "./types";
import { descriptorToZod } from "./helpers";

export function buildResourceSchemas(
  descriptor: FullDescriptor,
  resources: Resource[],
): ResourceSchemas {
  const { modelZodSchemas } = buildZodSchemasFromDescriptor(descriptor);
  const schemas: ResourceSchemas = {};

  for (const res of resources) {
    if (res.kind === "collection") {
      const itemSchema = descriptorToZod(res.item, modelZodSchemas, {
        allowModelRefId: true,
      });
      schemas[res.path] = {
        item: itemSchema,
        array: z.array(itemSchema),
      };
    } else {
      const itemSchema = descriptorToZod(res.descriptor, modelZodSchemas, {
        loose: true,
      });
      schemas[res.path] = {
        item: itemSchema,
        array: z.array(itemSchema),
      };
    }
  }

  return schemas;
}
