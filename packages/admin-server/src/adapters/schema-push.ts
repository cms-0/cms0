/**
 * Schema Push Adapter
 *
 * SchemaPushAdapter implementation for self-hosted apps.
 */

import type { SchemaPushAdapter } from "../binding-factory/types";
import type { FullDescriptor } from "@cms0/shared";
import type { SelfHostedConfig } from "./types";
import { realignDirectModelRefColumns } from "./model-ref-column-realignment";

/**
 * Create a schema push adapter
 */
export function createSchemaPushAdapter(
  config: SelfHostedConfig,
): SchemaPushAdapter {
  const realignModelRefColumns = async (descriptor: FullDescriptor) => {
    const result = await realignDirectModelRefColumns(config.pool, descriptor);
    for (const warning of result.warnings) {
      console.warn(`[schema-push] ${warning}`);
    }
  };

  return {
    async push(descriptor) {
      const { regenerateSchema, runDbPush } = config;
      await regenerateSchema(descriptor);
      await realignModelRefColumns(descriptor);
      await runDbPush();
    },
  };
}
