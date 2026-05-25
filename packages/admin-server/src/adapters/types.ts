/**
 * Adapter Configuration Types
 *
 * Type definitions for creating shared binding adapters.
 */

import type pg from "pg";
import type { FullDescriptor } from "@cms0/shared";

/**
 * Base configuration required by all adapters
 */
export type AdapterConfig = {
  /** Environment identifier */
  environmentKey: string;
  /** PostgreSQL connection pool */
  pool: pg.Pool;
  /** Optional Drizzle database instance (legacy, not used by modern content engine) */
  db?: any;
  /** Optional Drizzle schema definition (legacy, not used by modern content engine) */
  schema?: any;
  /** Auth instance (static) or getter function (dynamic) */
  auth: any | (() => any | Promise<any>);
  /** Optional runtime asset store for generated content assets */
  assetStore?: import("../storage-driver").RuntimeAssetStore;
};

/**
 * Self-hosted environment configuration
 */
export type SelfHostedConfig = AdapterConfig & {
  type: "self-hosted";
  /** Execute manual trigger HTTP requests instead of using the local stub */
  manualTriggerFullExecute?: boolean;
  /** Function to regenerate schema files */
  regenerateSchema: (descriptor: FullDescriptor) => Promise<void>;
  /** Function to run database push */
  runDbPush: () => Promise<void>;
  /** Storage root path for local storage */
  storageRoot: string;
  /** Optional storage driver for uploads */
  storage?: import("../storage-driver").StorageDriverAdapter;
};

/**
 * Union type for all adapter configurations
 */
export type AdapterConfigUnion = SelfHostedConfig;

/**
 * Type guard for self-hosted config
 */
export function isSelfHostedConfig(
  config: AdapterConfigUnion,
): config is SelfHostedConfig {
  return config.type === "self-hosted";
}

/**
 * Helper to get auth instance (handles both static and dynamic)
 */
export async function getAuthInstance(
  auth: AdapterConfig["auth"],
): Promise<any> {
  if (typeof auth === "function") {
    return auth();
  }
  return auth;
}
