/**
 * Admin Binding Adapters
 *
 * Thin wrapper around shared adapters from @cms0/admin-server
 */

import path from "node:path";
import {
  createAdminServerBinding,
  createSelfHostedAdapters,
  createLocalStorageDriver,
  createScopedStorageDriver,
  createS3StorageDriver,
  createRuntimeAssetStore,
  createDbUsageTracker,
  type StorageDriverAdapter,
} from "@cms0/admin-server";
import type { StorageProviderConfig } from "@cms0/shared";
import { pool } from "./config.db";
import { auth } from "@/lib/auth/auth";
import { regenerateGeneratedSchema } from "./db-schema-ops/generate-schema";
import { runDbPushSafe } from "@cms0/db-schema-ops";
import { resolveFromAppRoot } from "./app-paths";
import {
  getSelfHostedAssetBasePath,
  getSelfHostedAssetBaseUrl,
} from "./assets";
import { getDatabaseUrl, getManualTriggerFullExecute } from "./env";
import { resolveSelfHostedStorageProviderConfig } from "./storage/config";
import pg from "pg";
const { Pool } = pg;

export function createSelfHostedUsageTracker() {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    max: 2,
  });
  return createDbUsageTracker(pool);
}

function resolveStorageRootPath(rootPath: string) {
  return path.isAbsolute(rootPath) ? rootPath : resolveFromAppRoot(rootPath);
}

export function createSelfHostedStorageDriver(
  config: StorageProviderConfig = resolveSelfHostedStorageProviderConfig(),
): StorageDriverAdapter {
  if (config.kind === "filesystem") {
    return createLocalStorageDriver(resolveStorageRootPath(config.rootPath));
  }

  const storage = createS3StorageDriver({
    accessKeyId: config.accessKeyId,
    bucket: config.bucket,
    endpoint: config.endpoint ?? undefined,
    forcePathStyle: config.forcePathStyle,
    region: config.region,
    secretAccessKey: config.secretAccessKey,
  });

  return config.prefix
    ? createScopedStorageDriver(storage, config.prefix)
    : storage;
}

export function createSelfHostedAdminBinding(environmentKey: string) {
  const storageConfig = resolveSelfHostedStorageProviderConfig();
  const storage = createSelfHostedStorageDriver(storageConfig);
  const storageRoot =
    storageConfig.kind === "filesystem"
      ? resolveStorageRootPath(storageConfig.rootPath)
      : "";
  const assetStore = createRuntimeAssetStore(storage, {
    publicBasePath: getSelfHostedAssetBasePath(),
    publicBaseUrl: getSelfHostedAssetBaseUrl(),
  });

  const adapters = createSelfHostedAdapters({
    environmentKey,
    pool,
    auth,
    storage,
    assetStore,
    regenerateSchema: regenerateGeneratedSchema,
    runDbPush: runDbPushSafe,
    manualTriggerFullExecute: getManualTriggerFullExecute(),
    storageRoot,
  });

  return createAdminServerBinding({
    environmentKey,
    assetStore,
    ...adapters,
  });
}
