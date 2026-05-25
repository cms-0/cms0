/**
 * Binding Adapters Factory
 *
 * Adapter implementations for self-hosted admin server bindings.
 */

export type {
  AdapterConfig,
  SelfHostedConfig,
  AdapterConfigUnion,
} from "./types";

export { isSelfHostedConfig, getAuthInstance } from "./types";

// Adapter creators will be exported here as they are implemented
export { createSchemaStoreAdapter } from "./schema-store";
export { createApiKeyAuthAdapter } from "./api-key-auth";
export { createBackupStoreAdapter } from "./backup-store";
export { createContentEngineFactory } from "./content-engine";
export { createTriggerStoreAdapter } from "./trigger-store";
export { createSchemaPushAdapter } from "./schema-push";
export { createDataTransferAdapter } from "./data-transfer";
export { createUploadsTransferAdapter } from "./uploads-transfer";

import type { AdminServerBindingDeps } from "../binding-factory/types";
import type { SelfHostedConfig } from "./types";
import { createSchemaStoreAdapter } from "./schema-store";
import { createApiKeyAuthAdapter } from "./api-key-auth";
import { createBackupStoreAdapter } from "./backup-store";
import { createContentEngineFactory } from "./content-engine";
import { createTriggerStoreAdapter } from "./trigger-store";
import { createSchemaPushAdapter } from "./schema-push";
import { createDataTransferAdapter } from "./data-transfer";
import { createUploadsTransferAdapter } from "./uploads-transfer";

/**
 * Create all adapters for a self-hosted environment
 */
export function createSelfHostedAdapters(
  config: Omit<SelfHostedConfig, "type">,
): Omit<AdminServerBindingDeps, "environmentKey"> {
  const schemaStore = createSchemaStoreAdapter(config);
  const schemaPush = createSchemaPushAdapter({
    ...config,
    type: "self-hosted",
  } as SelfHostedConfig);

  return {
    contentEngineFactory: createContentEngineFactory({
      ...config,
      type: "self-hosted",
    } as SelfHostedConfig),
    schemaStore,
    schemaPush,
    backupStore: createBackupStoreAdapter({
      ...config,
      supportsArchive: true,
    }),
    dataTransfer: createDataTransferAdapter({
      ...config,
      schemaPush,
      schemaStore,
    }),
    uploadsTransfer: createUploadsTransferAdapter(config),
    triggerStore: createTriggerStoreAdapter({
      ...config,
      fullExecute: config.manualTriggerFullExecute,
    }),
    apiKeyAuth: createApiKeyAuthAdapter(config),
    usageTracker: {
      async record() {},
      async getMonth() {
        const emptyMetrics = {
          apiCalls: 0,
          bytesIn: 0,
          bytesOut: 0,
          contentReads: 0,
          contentWrites: 0,
          lastMutationAt: null,
          lastRequestAt: null,
          readCalls: 0,
          schemaPublishes: 0,
          writeCalls: 0,
        };

        return {
          controlMetrics: { ...emptyMetrics },
          metrics: { ...emptyMetrics },
          publicMetrics: { ...emptyMetrics },
          totalMetrics: { ...emptyMetrics },
        };
      },
    },
  };
}
