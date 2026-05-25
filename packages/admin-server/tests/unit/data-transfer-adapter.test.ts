import { describe, expect, it } from "vitest";

import { createSelfHostedAdapters } from "../../src/adapters";
import {
  BACKUP_FORMAT_VERSION,
  encodePayload,
  type BackupPayload,
} from "../../src/schema-backup";

function createMockPool(tableNames: string[] = []) {
  return {
    query: async (text: string, values?: unknown[]) => {
      if (text.includes("information_schema.tables")) {
        return {
          rows: tableNames.map((table_name) => ({ table_name })),
        };
      }

      if (text.includes("SELECT * FROM schema_backups WHERE id = $1")) {
        return {
          rows:
            values?.[0] === "backup_123"
              ? [
                  {
                    created_at: "2026-05-19T00:00:00.000Z",
                    data_checksum: "checksum",
                    data_file_name: "backup.tar.gz",
                    data_fingerprint: "fingerprint",
                    descriptor: { models: {}, roots: {} },
                    descriptor_checksum: "descriptor-checksum",
                    from_checksum: null,
                    from_version: null,
                    id: "backup_123",
                    reason: "manual",
                    restored_at: null,
                    row_counts: {},
                    size_bytes: 11,
                    status: "ready",
                    table_count: 0,
                    to_checksum: null,
                    to_version: null,
                  },
                ]
              : [],
        };
      }

      if (text.includes("CREATE TABLE IF NOT EXISTS schema_backup_data")) {
        return { rows: [] };
      }

      if (text.includes("SELECT payload FROM schema_backup_data")) {
        return { rows: [{ payload: Buffer.from("hello world") }] };
      }

      if (
        text.includes("FROM schema_snapshots") ||
        text.includes("FROM schema_meta")
      ) {
        return { rows: [] };
      }

      throw new Error(`Unexpected database query: ${text}`);
    },
  } as never;
}

function createMockSelfHostedConfig(pool = createMockPool()) {
  return {
    auth: {},
    environmentKey: "self-hosted",
    pool,
    regenerateSchema: async () => {},
    runDbPush: async () => {},
    storageRoot: "/tmp/cms0-test-storage",
  };
}

describe("data transfer adapters", () => {
  it("enables data transfer for self-hosted bindings", async () => {
    const adapters = createSelfHostedAdapters(createMockSelfHostedConfig());

    await expect(
      adapters.dataTransfer.preflight(Buffer.from("not-a-valid-archive")),
    ).rejects.toThrow("Invalid or unsupported backup archive format.");
  });

  it("preflights self-hosted runtime tables with the real adapter", async () => {
    const adapters = createSelfHostedAdapters(
      createMockSelfHostedConfig(createMockPool(["home_page"])),
    );
    const payload: BackupPayload = {
      createdAt: "2026-05-19T00:00:00.000Z",
      descriptor: { models: {}, roots: {} },
      descriptorChecksum: "checksum",
      format: BACKUP_FORMAT_VERSION,
      tables: [
        { name: "home_page", rows: [] },
        { name: "user", rows: [] },
      ],
    };

    const result = await adapters.dataTransfer.preflight(encodePayload(payload));

    expect(result).toMatchObject({
      missingTables: [],
      ok: true,
      tableCount: 1,
    });
    expect(result.compatibilityWarnings.join("\n")).toContain(
      "Skipped non-runtime tables from archive: user",
    );
  });

  it("enables backup archive downloads for self-hosted bindings", async () => {
    const adapters = createSelfHostedAdapters(createMockSelfHostedConfig());

    const archive = await adapters.backupStore.getArchive("backup_123");

    expect(archive).toMatchObject({
      checksum: "checksum",
      fileName: "backup.tar.gz",
      sizeBytes: 11,
    });
    expect(archive?.data.toString("utf8")).toBe("hello world");
  });

  it("fails uploads transfer explicitly when storage is not configured", async () => {
    const adapters = createSelfHostedAdapters(createMockSelfHostedConfig());

    await expect(adapters.uploadsTransfer.export()).rejects.toThrow(
      "Uploads transfer storage is not configured.",
    );
  });
});
