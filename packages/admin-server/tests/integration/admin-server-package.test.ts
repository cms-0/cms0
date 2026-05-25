import { afterEach, describe, expect, it } from "vitest";

import type { AdminServerBinding } from "@cms0/admin-server";
import {
  configureAdminServer,
  createAdminServer,
  getAdminServerConfig,
} from "@cms0/admin-server";

const defaultUsageMetrics = {
  apiCalls: 0,
  bytesIn: 0,
  bytesOut: 0,
  contentReads: 0,
  contentWrites: 0,
  lastMutationAt: null,
  lastRequestAt: null,
  readCalls: 0,
  schemaPublishes: 0,
  writeCalls: 0,
};

const defaultUsage = {
  content: {
    collectionCount: 0,
    collectionEntryCount: 0,
    fileBytes: 0,
    singletonCount: 0,
  },
  environmentKey: "test",
  month: {
    controlMetrics: defaultUsageMetrics,
    key: "2026-04",
    label: "April 2026",
    metrics: defaultUsageMetrics,
    publicMetrics: defaultUsageMetrics,
    totalMetrics: defaultUsageMetrics,
  },
  schema: {
    descriptorBytes: 0,
    fieldCount: 0,
    modelCount: 0,
    publishedAt: null,
    rootCount: 0,
    version: null,
  },
  storage: {
    contentStoreBytes: 0,
    schemaSnapshotBytes: 0,
    totalBytes: 0,
  },
};

describe("@cms0/admin-server", () => {
  const originalConfig = getAdminServerConfig();

  afterEach(() => {
    configureAdminServer(originalConfig);
  });

  it("publishes schema snapshots idempotently through a binding", async () => {
    let snapshot: any = null;
    let backups = 0;

    const binding: AdminServerBinding = {
      createApiKey: async () => {
        throw new Error("not implemented");
      },
      createBackup: async () => {
        backups += 1;
        return null;
      },
      createContentEntry: async () => undefined,
      createManualTrigger: async () => {
        throw new Error("not implemented");
      },
      deleteBackup: async () => undefined,
      exportDataTransferArchive: async () => {
        throw new Error("not implemented");
      },
      exportUploadsArchive: async () => {
        throw new Error("not implemented");
      },
      deleteContentEntry: async () => undefined,
      deleteManualTrigger: async () => undefined,
      getBackup: async () => null,
      getBackupArchive: async () => null,
      getBackupDescriptor: async () => null,
      getBackupTypescript: async () => null,
      getLatestSchemaSnapshot: async () => snapshot,
      getUploadAsset: async () => null,
      getUsageSummary: async () => defaultUsage,
      importDataTransferArchive: async () => {
        throw new Error("not implemented");
      },
      importUploadsArchive: async () => {
        throw new Error("not implemented");
      },
      listApiKeys: async () => [],
      listBackups: async () => [],
      listManualTriggerRuns: async () => [],
      listManualTriggers: async () => [],
      publishSchema: async (_target, input) => {
        const checksum = JSON.stringify(input.descriptor);
        if (snapshot && snapshot.checksum === checksum) {
          return {
            changed: false,
            migration: null,
            ok: true,
            snapshot,
          };
        }

        snapshot = {
          checksum,
          descriptor: input.descriptor,
          publishedAt: "2026-04-24T10:00:00.000Z",
          version: input.version ?? "2026-04-24T10:00:00.000Z",
        };

        return {
          changed: true,
          migration: null,
          ok: true,
          snapshot,
        };
      },
      preflightDataTransferImport: async () => {
        throw new Error("not implemented");
      },
      preflightUploadsImport: async () => {
        throw new Error("not implemented");
      },
      readContentValue: async () => [],
      readGraphValue: async () => null,
      mutateGraphValue: async () => null,
      patchContentSingleton: async () => undefined,
      recordRequestUsage: async () => undefined,
      replaceContentSingleton: async () => undefined,
      restoreBackup: async () => null,
      runManualTrigger: async () => null,
      updateContentEntry: async () => undefined,
      updateApiKey: async () => null,
      updateManualTrigger: async () => null,
      revokeApiKey: async () => null,
    };

    configureAdminServer({
      resolveBinding: async () => binding,
    });

    const server = createAdminServer({ environmentKey: "env-test" });
    const descriptor = {
      models: {},
      roots: {
        site: {
          properties: {
            title: { type: "string" },
          },
          type: "object",
        },
      },
    };

    const first = await server.publishSchema({
      descriptor,
      version: "2026-04-24T10:00:00.000Z",
    });
    const second = await server.publishSchema({
      descriptor,
      version: "2026-04-24T11:00:00.000Z",
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(backups).toBe(0);
  });

  it("serves health and context through the configured binding", async () => {
    const binding: AdminServerBinding = {
      createApiKey: async () => {
        throw new Error("not implemented");
      },
      createBackup: async () => null,
      createContentEntry: async () => undefined,
      createManualTrigger: async () => {
        throw new Error("not implemented");
      },
      deleteBackup: async () => undefined,
      exportDataTransferArchive: async () => {
        throw new Error("not implemented");
      },
      exportUploadsArchive: async () => {
        throw new Error("not implemented");
      },
      deleteContentEntry: async () => undefined,
      deleteManualTrigger: async () => undefined,
      getBackup: async () => null,
      getBackupArchive: async () => null,
      getBackupDescriptor: async () => null,
      getBackupTypescript: async () => null,
      getLatestSchemaSnapshot: async () => ({
        checksum: "abc",
        descriptor: { models: {}, roots: {} },
        publishedAt: "2026-04-24T10:00:00.000Z",
        version: "2026-04-24T10:00:00.000Z",
      }),
      getUploadAsset: async () => null,
      getUsageSummary: async () => defaultUsage,
      importDataTransferArchive: async () => {
        throw new Error("not implemented");
      },
      importUploadsArchive: async () => {
        throw new Error("not implemented");
      },
      listApiKeys: async () => [],
      listBackups: async () => [],
      listManualTriggerRuns: async () => [],
      listManualTriggers: async () => [],
      publishSchema: async () => {
        throw new Error("not implemented");
      },
      preflightDataTransferImport: async () => {
        throw new Error("not implemented");
      },
      preflightUploadsImport: async () => {
        throw new Error("not implemented");
      },
      readContentValue: async () => [],
      readGraphValue: async () => null,
      mutateGraphValue: async () => null,
      patchContentSingleton: async () => undefined,
      recordRequestUsage: async () => undefined,
      replaceContentSingleton: async () => undefined,
      restoreBackup: async () => null,
      runManualTrigger: async () => null,
      updateContentEntry: async () => undefined,
      updateApiKey: async () => null,
      updateManualTrigger: async () => null,
      revokeApiKey: async () => null,
    };

    configureAdminServer({
      resolveBinding: async () => binding,
    });

    const server = createAdminServer({ environmentKey: "env-test" });
    const health = await server.handleRequest({
      body: undefined,
      headers: new Headers(),
      method: "GET",
      searchParams: new URLSearchParams(),
      segments: ["health"],
    });
    const context = await server.handleRequest({
      body: undefined,
      headers: new Headers(),
      method: "GET",
      searchParams: new URLSearchParams(),
      segments: ["context"],
    });

    expect(health.status).toBe(200);
    expect(health.body).toMatchObject({
      ok: true,
      server: "cms0-admin-server",
    });
    expect(context.status).toBe(200);
    expect(
      (context.body as { snapshot: { version: string } }).snapshot.version,
    ).toBe("2026-04-24T10:00:00.000Z");
  });
});
