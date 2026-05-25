/**
 * Schema Store Adapter
 *
 * Shared SchemaStoreAdapter implementation for both self-hosted and hosted apps.
 */

import type { SchemaStoreAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import {
  loadLatestSchemaSnapshotRecord,
  saveSchemaSnapshot,
} from "../schema-store";

/**
 * Create a schema store adapter
 */
export function createSchemaStoreAdapter(
  config: AdapterConfig,
): SchemaStoreAdapter {
  const { pool } = config;

  return {
    async loadLatestSnapshot() {
      const record = await loadLatestSchemaSnapshotRecord(pool);
      if (!record) return null;
      return {
        checksum: record.checksum ?? "",
        descriptor: record.descriptor,
        publishedAt: record.publishedAt ?? new Date().toISOString(),
        version: record.version ?? "",
      };
    },

    async saveSnapshot(descriptor, version) {
      await saveSchemaSnapshot(descriptor, version, pool);
    },

    async loadAppliedChecksum() {
      const record = await loadLatestSchemaSnapshotRecord(pool);
      return record?.checksum ?? null;
    },
  };
}
