/**
 * Backup Store Adapter
 *
 * Shared BackupStoreAdapter implementation for both self-hosted and hosted apps.
 */

import type { BackupStoreAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import {
  listSchemaBackups,
  getSchemaBackupRow,
  getSchemaBackupDescriptor,
  getSchemaBackupArchive,
  createSchemaBackup,
  deleteSchemaBackup,
  restoreSchemaBackupData,
} from "../schema-backup";

/**
 * Create a backup store adapter
 */
export function createBackupStoreAdapter(
  config: AdapterConfig & { supportsArchive?: boolean },
): BackupStoreAdapter {
  const { pool, supportsArchive = false } = config;

  return {
    async list(limit = 50) {
      const backups = await listSchemaBackups(pool, limit);
      return backups.map((b) => ({
        id: b.id,
        reason: b.reason ?? "backup",
        status: b.status === "archived" ? "archived" : "ready",
        fromVersion: b.fromVersion ?? null,
        toVersion: b.toVersion ?? null,
        fromChecksum: b.fromChecksum ?? null,
        toChecksum: b.toChecksum ?? null,
        descriptor: {} as any,
        rowCounts: b.rowCounts ?? {},
        tableCount: b.tableCount ?? 0,
        sizeBytes: b.sizeBytes ?? 0,
        createdAt: b.createdAt ?? new Date().toISOString(),
        restoredAt: b.restoredAt ?? null,
      }));
    },

    async create(input) {
      const summary = await createSchemaBackup(pool, {
        descriptor: input.descriptor,
        fromChecksum: input.fromChecksum,
        fromVersion: input.fromVersion,
        reason: input.reason,
        toChecksum: input.toChecksum,
        toVersion: input.toVersion,
      });
      if (!summary) throw new Error("Failed to create backup");
      return {
        id: summary.id,
        reason: input.reason,
        status: "ready" as const,
        fromVersion: input.fromVersion,
        toVersion: input.toVersion,
        fromChecksum: input.fromChecksum,
        toChecksum: input.toChecksum,
        descriptor: input.descriptor,
        rowCounts: summary.rowCounts ?? {},
        tableCount: summary.tableCount ?? 0,
        sizeBytes: summary.sizeBytes ?? 0,
        createdAt: summary.createdAt ?? new Date().toISOString(),
        restoredAt: null,
      };
    },

    async delete(backupId) {
      await deleteSchemaBackup(pool, backupId);
    },

    async getRow(backupId) {
      const row = await getSchemaBackupRow(pool, backupId);
      if (!row) return null;
      return {
        id: row.id,
        reason: row.reason,
        status: row.status === "archived" ? "archived" : "ready",
        fromVersion: row.from_version,
        toVersion: row.to_version,
        fromChecksum: row.from_checksum,
        toChecksum: row.to_checksum,
        descriptor: row.descriptor as any,
        rowCounts: row.row_counts,
        tableCount: row.table_count,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        restoredAt: row.restored_at,
      };
    },

    async getDescriptor(backupId) {
      return getSchemaBackupDescriptor(pool, backupId);
    },

    async getArchive(backupId) {
      if (!supportsArchive) return null;
      const archive = await getSchemaBackupArchive(pool, backupId);
      if (!archive) return null;
      return {
        data: archive.data,
        fileName: archive.fileName,
        checksum: archive.checksum,
        sizeBytes: archive.data.length,
      };
    },

    async restore(backupId) {
      await restoreSchemaBackupData(pool, backupId);
    },
  };
}
