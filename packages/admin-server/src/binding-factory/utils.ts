/**
 * Binding Factory Utilities
 *
 * Helper functions for the admin server binding factory.
 */

import type {
  SchemaDescriptor,
  SchemaDescriptorSnapshot,
  ServerBackupRecord,
} from "@cms0/admin-contract";
import type { FullDescriptor } from "@cms0/shared";
import type { BackupRow } from "./types";

/** Measure JSON bytes for usage tracking */
export function measureJsonBytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return 0;
  }
}

/** Get month key in YYYY-MM format */
export function getMonthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Format month key as readable label */
export function formatMonthLabel(monthKey: string): string {
  const [yearValue, monthValue] = monthKey.split("-");
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) return monthKey;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthIndex, 1)));
}

/** Type guard for plain records */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Type guard for FullDescriptor */
export function isFullDescriptor(value: unknown): value is FullDescriptor {
  return isRecord(value);
}

/** Count total descriptor fields across roots and models */
export function countDescriptorFields(
  snapshot: SchemaDescriptorSnapshot | null,
): number {
  const countCollection = (key: "models" | "roots") => {
    const descriptorRoot = snapshot?.descriptor as
      | Record<string, unknown>
      | undefined;
    const collection = descriptorRoot?.[key];
    if (!isRecord(collection)) return 0;
    return Object.values(collection).reduce<number>((count, descriptor) => {
      if (!isRecord(descriptor) || !isRecord(descriptor.properties))
        return count;
      return count + Object.keys(descriptor.properties).length;
    }, 0);
  };
  return countCollection("roots") + countCollection("models");
}

/** Count descriptor entries for a collection key */
export function countDescriptorEntries(
  snapshot: SchemaDescriptorSnapshot | null,
  key: "models" | "roots",
): number {
  const descriptorRoot = snapshot?.descriptor as
    | Record<string, unknown>
    | undefined;
  const collection = descriptorRoot?.[key];
  return isRecord(collection) ? Object.keys(collection).length : 0;
}

/** Convert BackupRow to ServerBackupRecord */
export function toServerBackupRecord(backup: BackupRow): ServerBackupRecord {
  return {
    createdAt: backup.createdAt,
    description: backup.reason,
    fromChecksum: backup.fromChecksum,
    fromVersion: backup.fromVersion,
    id: backup.id,
    reason: backup.reason,
    restoredAt: backup.restoredAt,
    rowCounts: backup.rowCounts,
    sizeBytes: backup.sizeBytes,
    status: backup.status === "archived" ? "archived" : "ready",
    tableCount: backup.tableCount,
    toChecksum: backup.toChecksum,
    toVersion: backup.toVersion,
  };
}

/** Compute checksum for descriptor */
export function computeChecksum(descriptor: SchemaDescriptor): string {
  const str = JSON.stringify(descriptor);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = Math.trunc((hash << 5) - hash + char);
  }
  return Math.abs(hash).toString(16);
}
