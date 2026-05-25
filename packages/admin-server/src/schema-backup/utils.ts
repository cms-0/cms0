/**
 * Schema Backup Utilities
 */

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import type {
  SchemaBackupSummary,
  BackupPayload,
  SchemaBackupRow,
} from "./types";
import { BACKUP_FORMAT_VERSION } from "./types";

export function computeSha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function encodePayload(payload: BackupPayload): Buffer {
  return Buffer.from(gzipSync(Buffer.from(JSON.stringify(payload))));
}

export function decodePayload(buf: Buffer): BackupPayload | null {
  try {
    const raw = gunzipSync(buf);
    const parsed = JSON.parse(raw.toString("utf8"));
    if (parsed?.format === BACKUP_FORMAT_VERSION)
      return parsed as BackupPayload;
    return null;
  } catch {
    return null;
  }
}

export function normalizeRow(row: SchemaBackupRow): SchemaBackupSummary {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    fromVersion: row.from_version ?? null,
    toVersion: row.to_version ?? null,
    fromChecksum: row.from_checksum ?? null,
    toChecksum: row.to_checksum ?? null,
    descriptorChecksum: row.descriptor_checksum,
    dataFingerprint: row.data_fingerprint,
    tableCount: Number(row.table_count ?? 0),
    sizeBytes: Number(row.size_bytes ?? 0),
    rowCounts: (row.row_counts as Record<string, number>) ?? {},
    createdAt: row.created_at,
    restoredAt: row.restored_at ?? null,
  };
}

export function quoteIdent(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}
