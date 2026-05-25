/**
 * Data Transfer Adapter
 *
 * Shared DataTransferAdapter implementation for both self-hosted and hosted apps.
 */

import type { SchemaStoreAdapter, SchemaPushAdapter } from "../binding-factory/types";
import type { FullDescriptor } from "@cms0/shared";
import type { DataTransferAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import {
  encodePayload,
  decodePayload,
  exportDatabaseArchive,
  importDatabaseArchiveBuffer,
  normalizeModelRefArchivePayload,
} from "../schema-backup";
import { listPublicTables } from "../schema-backup";

type DataTransferAdapterConfig = AdapterConfig & {
  schemaPush?: SchemaPushAdapter;
  schemaStore?: SchemaStoreAdapter;
};

const RUNTIME_INTERNAL_TABLES = new Set([
  "__drizzle_migrations",
  "schema_backup_data",
  "usage_outbox",
]);

const SAAS_PLATFORM_TABLES = new Set([
  "account",
  "apikey",
  "billing_account",
  "billing_subscription",
  "environment_member",
  "invitation",
  "member",
  "organization",
  "organization_role",
  "project",
  "project_environment",
  "project_team",
  "session",
  "subscription",
  "team",
  "team_member",
  "usage_control_months",
  "usage_months",
  "usage_storage_dirty",
  "usage_storage_snapshot",
  "usage_traffic_event",
  "usage_traffic_rollup_month",
  "user",
  "verification",
]);

function isImportIgnoredTable(tableName: string): boolean {
  return (
    RUNTIME_INTERNAL_TABLES.has(tableName) || SAAS_PLATFORM_TABLES.has(tableName)
  );
}

function deriveImportVersion(payload: { createdAt?: string }): string {
  return payload.createdAt || new Date().toISOString();
}

function computeMissingTables(
  availableTables: Set<string>,
  payloadTables: Array<{ name: string }>,
): string[] {
  return payloadTables
    .map((table) => table.name)
    .filter((tableName) => !availableTables.has(tableName));
}

function filterEnvironmentPayloadTables<
  TPayload extends { tables: Array<{ name: string; rows: Record<string, unknown>[] }> },
>(payload: TPayload): {
  filteredPayload: TPayload;
  ignoredTables: string[];
} {
  const ignoredTables = payload.tables
    .map((table) => table.name)
    .filter((tableName) => isImportIgnoredTable(tableName))
    .sort((left, right) => left.localeCompare(right));

  const filteredPayload = {
    ...payload,
    tables: payload.tables.filter((table) => !isImportIgnoredTable(table.name)),
  };

  return { filteredPayload, ignoredTables };
}

function formatModelRefNormalizationWarning(
  changes: ReturnType<typeof normalizeModelRefArchivePayload>["changes"],
): string | null {
  if (!changes.length) return null;
  const preview = changes
    .slice(0, 8)
    .map(
      (change) =>
        `${change.tableName}.${change.legacyDbName} -> ${change.canonicalDbName} (${change.rowCount} rows)`,
    )
    .join(", ");
  const suffix = changes.length > 8 ? `, +${changes.length - 8} more` : "";
  return `Legacy modelRef archive columns will be normalized to descriptor field columns before import: ${preview}${suffix}.`;
}

/**
 * Create a data transfer adapter
 */
export function createDataTransferAdapter(
  config: DataTransferAdapterConfig,
): DataTransferAdapter {
  const { pool, schemaPush, schemaStore } = config;

  return {
    async export() {
      const archive = await exportDatabaseArchive(pool, {
        includeTable: (tableName) => !isImportIgnoredTable(tableName),
      });
      return {
        data: archive.data,
        checksum: archive.checksum,
        fileName: archive.fileName,
        sizeBytes: archive.sizeBytes,
      };
    },

    async preflight(archive) {
      const buf = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
      const payload = decodePayload(buf);

      if (!payload) {
        throw new Error("Invalid or unsupported backup archive format.");
      }

      const { filteredPayload, ignoredTables } =
        filterEnvironmentPayloadTables(payload);
      const availableTables = new Set(await listPublicTables(pool));
      const incomingTables = filteredPayload.tables.map((table) => table.name);
      const missingTables = computeMissingTables(
        availableTables,
        filteredPayload.tables,
      );
      const latestSnapshot = await schemaStore?.loadLatestSnapshot();
      const archiveMatchesCurrentSchema =
        latestSnapshot?.checksum != null &&
        latestSnapshot.checksum === payload.descriptorChecksum;

      const compatibilityWarnings: string[] = [];

      if (ignoredTables.length > 0) {
        compatibilityWarnings.push(
          `Skipped non-runtime tables from archive: ${ignoredTables.join(", ")}`,
        );
      }

      if (filteredPayload.descriptor && missingTables.length > 0) {
        compatibilityWarnings.push(
          "Archive descriptor will be applied to materialize missing runtime tables before data import.",
        );
      } else if (!archiveMatchesCurrentSchema && filteredPayload.descriptor) {
        compatibilityWarnings.push(
          "Archive descriptor will be applied to this runtime before data import.",
        );
      } else if (filteredPayload.descriptor && schemaPush && schemaStore) {
        compatibilityWarnings.push(
          "Archive descriptor will be verified before data import to realign runtime storage columns if needed.",
        );
      }

      const modelRefNormalization =
        normalizeModelRefArchivePayload(filteredPayload);
      const modelRefNormalizationWarning = formatModelRefNormalizationWarning(
        modelRefNormalization.changes,
      );
      if (modelRefNormalizationWarning) {
        compatibilityWarnings.push(modelRefNormalizationWarning);
      }
      compatibilityWarnings.push(...modelRefNormalization.warnings);

      return {
        archiveType: "json-snapshot" as const,
        canImportBestEffort: true,
        canImportStrict:
          filteredPayload.descriptor != null || missingTables.length === 0,
        compatibilityWarnings,
        missingTables,
        ok: true as const,
        tableCount: incomingTables.length,
      };
    },

    async import(input) {
      const buf = Buffer.isBuffer(input.archive)
        ? input.archive
        : Buffer.from(input.archive);
      const payload = decodePayload(buf);

      if (!payload) {
        throw new Error("Invalid or unsupported backup archive format.");
      }

      const { filteredPayload } = filterEnvironmentPayloadTables(payload);
      let availableTables = new Set(await listPublicTables(pool));
      let missingTables = computeMissingTables(
        availableTables,
        filteredPayload.tables,
      );

      const shouldApplyDescriptor =
        filteredPayload.descriptor != null &&
        schemaPush != null &&
        schemaStore != null;

      if (shouldApplyDescriptor) {
        const version = deriveImportVersion(payload);
        await schemaPush.push(payload.descriptor as FullDescriptor);
        availableTables = new Set(await listPublicTables(pool));
        missingTables = computeMissingTables(
          availableTables,
          filteredPayload.tables,
        );

        if (missingTables.length > 0 && !input.skipMissingTables) {
          throw new Error(
            `Archive descriptor was applied, but the runtime is still missing tables: ${missingTables.join(", ")}`,
          );
        }

        await schemaStore.saveSnapshot(payload.descriptor, version);
      }

      const importArchiveBuffer = encodePayload(filteredPayload);
      const result = await importDatabaseArchiveBuffer(pool, importArchiveBuffer, {
        skipMissingTables: input.skipMissingTables,
        reason: input.reason,
      });
      return {
        importedBackupId: result.importedBackupId ?? "import",
        ok: true as const,
        restoredTables: result.restoredTables,
        safetyBackupId: result.importedBackupId ?? "import",
        skippedMissingTables: result.skippedTables.length > 0,
        skippedTables: result.skippedTables,
      };
    },
  };
}
