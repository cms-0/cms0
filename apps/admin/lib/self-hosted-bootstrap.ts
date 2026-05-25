import "server-only";

import type { FullDescriptor } from "@cms0/shared";

import { reloadSchema, pool } from "./config.db";
import { regenerateGeneratedSchema } from "./db-schema-ops/generate-schema";
import { runDbPushSafe } from "@cms0/db-schema-ops";
import {
  loadAppliedSchemaChecksum,
  loadLatestSchemaSnapshotRecord,
} from "@cms0/admin-server";
import {
  normalizeSchemaSnapshotChecksum,
  setCurrentSchemaVersion,
} from "./schema-store";
import {
  resetSelfHostedContentEngineCache,
  warmSelfHostedContentEngine,
} from "./self-hosted-server";

type BootstrapResult = {
  activeChecksum: string | null;
  appliedChecksum: string | null;
  appliedMigration: boolean;
  version: string | null;
};

let bootstrapPromise: Promise<BootstrapResult> | null = null;

const toDescriptor = (value: unknown): FullDescriptor | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const descriptor = value as Record<string, unknown>;
  const roots = descriptor.roots;
  const models = descriptor.models;
  if (
    !roots ||
    typeof roots !== "object" ||
    !models ||
    typeof models !== "object"
  ) {
    return null;
  }

  return descriptor as FullDescriptor;
};

const runBootstrap = async (): Promise<BootstrapResult> => {
  const latest = await loadLatestSchemaSnapshotRecord(pool);
  if (!latest || !latest.version) {
    await runDbPushSafe();
    reloadSchema();
    resetSelfHostedContentEngineCache();
    await warmSelfHostedContentEngine();
    return {
      activeChecksum: null,
      appliedChecksum: await loadAppliedSchemaChecksum(pool),
      appliedMigration: false,
      version: null,
    };
  }

  const descriptor = toDescriptor(latest.descriptor);
  if (!descriptor) {
    throw new Error("Latest schema snapshot descriptor is invalid.");
  }

  const activeChecksum = normalizeSchemaSnapshotChecksum(
    latest.checksum,
    descriptor,
  );
  const appliedChecksum = await loadAppliedSchemaChecksum(pool);
  const shouldApply = appliedChecksum !== activeChecksum;

  regenerateGeneratedSchema(descriptor);

  if (shouldApply) {
    await runDbPushSafe();
    await setCurrentSchemaVersion(latest.version);
  }

  reloadSchema();
  resetSelfHostedContentEngineCache();
  await warmSelfHostedContentEngine();

  return {
    activeChecksum,
    appliedChecksum,
    appliedMigration: shouldApply,
    version: latest.version,
  };
};

export const bootstrapSelfHostedContentServer = async () => {
  if (!bootstrapPromise) {
    bootstrapPromise = runBootstrap().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }

  return bootstrapPromise;
};

export const resetSelfHostedContentBootstrap = () => {
  bootstrapPromise = null;
};
