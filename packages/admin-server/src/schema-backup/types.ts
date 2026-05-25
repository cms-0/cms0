/**
 * Schema Backup Types
 */

import type { SchemaDescriptor } from "@cms0/admin-contract";

export const BACKUP_FORMAT_VERSION = "cms0-db-backup-v3";

export type SchemaBackupSummary = {
  id: string;
  reason: string;
  status: string;
  fromVersion: string | null;
  toVersion: string | null;
  fromChecksum: string | null;
  toChecksum: string | null;
  descriptorChecksum: string;
  dataFingerprint: string;
  tableCount: number;
  sizeBytes: number;
  rowCounts: Record<string, number>;
  createdAt: string;
  restoredAt: string | null;
};

export type BackupPayload = {
  format: typeof BACKUP_FORMAT_VERSION;
  createdAt: string;
  descriptor: SchemaDescriptor;
  descriptorChecksum: string;
  tables: { name: string; rows: Record<string, unknown>[] }[];
};

export type SchemaBackupRow = {
  id: string;
  reason: string;
  status: string;
  from_version: string | null;
  to_version: string | null;
  from_checksum: string | null;
  to_checksum: string | null;
  descriptor: unknown;
  descriptor_checksum: string;
  data_fingerprint: string;
  data_file_name: string;
  data_checksum: string;
  row_counts: Record<string, number>;
  table_count: number;
  size_bytes: number;
  restored_at: string | null;
  created_at: string;
};
