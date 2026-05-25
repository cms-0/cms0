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

describe("graph API handler", () => {
  const originalConfig = getAdminServerConfig();

  afterEach(() => {
    configureAdminServer(originalConfig);
  });

  const makeBinding = (
    overrides?: Partial<AdminServerBinding>,
  ): AdminServerBinding => {
    const base: AdminServerBinding = {
      createApiKey: async () => {
        throw new Error("not implemented");
      },
      createBackup: async () => null,
      createContentEntry: async () => undefined,
      createManualTrigger: async () => {
        throw new Error("not implemented");
      },
      deleteBackup: async () => undefined,
      deleteContentEntry: async () => undefined,
      deleteManualTrigger: async () => undefined,
      exportDataTransferArchive: async () => {
        throw new Error("not implemented");
      },
      exportUploadsArchive: async () => {
        throw new Error("not implemented");
      },
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
    return { ...base, ...overrides } as AdminServerBinding;
  };

  describe("GET /_graph/:path", () => {
    it("returns 200 with resolved graph data", async () => {
      const binding = makeBinding({
        readGraphValue: async ({ path }) => ({
          path,
          title: "Hello",
        }),
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "GET",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ path: "homePage", title: "Hello" });
    });

    it("forwards query params to readGraphValue", async () => {
      let capturedOptions: any;
      const binding = makeBinding({
        readGraphValue: async ({ options }) => {
          capturedOptions = options;
          return { ok: true };
        },
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      await server.handleRequest({
        method: "GET",
        segments: ["_graph", "models", "Testimonial", "123"],
        searchParams: new URLSearchParams({
          locale: "en",
          maxDepth: "3",
          fields: "title,body",
          resolveModelRefs: "true",
        }),
        headers: new Headers(),
      });

      expect(capturedOptions).toMatchObject({
        locale: "en",
        resolveModelRefs: true,
        maxDepth: 3,
        fields: ["title", "body"],
      });
      expect(capturedOptions).toMatchObject({
        pageSize: undefined,
      });
      expect(capturedOptions.fields).toEqual(["title", "body"]);
      expect(capturedOptions.exclude).toBeUndefined();
    });

    it("parses global pagination options", async () => {
      let capturedOptions: any;
      const binding = makeBinding({
        readGraphValue: async ({ options }) => {
          capturedOptions = options;
          return { ok: true };
        },
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      await server.handleRequest({
        method: "GET",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams({
          page: "2",
          pageSize: "full",
          orderBy: "createdAt",
          orderDir: "desc",
          search: "test query",
        }),
        headers: new Headers(),
      });

      expect(capturedOptions).toMatchObject({
        page: 2,
        pageSize: "full",
        orderBy: "createdAt",
        orderDir: "desc",
        search: "test query",
      });
    });

    it("parses per-path pagination options", async () => {
      let capturedOptions: any;
      const binding = makeBinding({
        readGraphValue: async ({ options }) => {
          capturedOptions = options;
          return { ok: true };
        },
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      await server.handleRequest({
        method: "GET",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams({
          "testimonials.page": "1",
          "testimonials.pageSize": "full",
          "testimonials.orderBy": "orderIndex",
          "features.page": "2",
          "features.pageSize": "10",
        }),
        headers: new Headers(),
      });

      expect(capturedOptions).toMatchObject({
        paths: {
          testimonials: {
            page: 1,
            pageSize: "full",
            orderBy: "orderIndex",
          },
          features: {
            page: 2,
            pageSize: 10,
          },
        },
      });
    });

    it("parses POST graph query paths", async () => {
      let capturedOptions: any;
      const binding = makeBinding({
        readGraphValue: async ({ options }) => {
          capturedOptions = options;
          return { ok: true };
        },
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      await server.handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_query"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: {
          fields: "seo",
          pageSize: "full",
          paths: {
            "seo.openGraph.images": {
              pageSize: "full",
            },
          },
        },
      });

      expect(capturedOptions).toMatchObject({
        fields: ["seo"],
        pageSize: "full",
        paths: {
          "seo.openGraph.images": {
            pageSize: "full",
          },
        },
      });
    });

    it("returns 400 when path is missing", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "GET",
        segments: ["_graph"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 when resource is not found", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "GET",
        segments: ["_graph", "unknown"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      });

      expect(response.status).toBe(404);
    });

    it("returns 405 for non-GET methods", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "POST",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: {},
      });

      expect(response.status).toBe(405);
    });

  });

  describe("POST /_graph/:path/_mutate", () => {
    it("returns 200 with mutated graph data", async () => {
      let capturedOps: any;
      const binding = makeBinding({
        mutateGraphValue: async ({ ops }) => {
          capturedOps = ops;
          return { title: "Updated" };
        },
      });

      configureAdminServer({ resolveBinding: async () => binding });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/title", value: "Updated" }] },
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ title: "Updated" });
      expect(capturedOps).toEqual([
        { op: "set", path: "/title", value: "Updated" },
      ]);
    });

    it("returns 400 for invalid mutation body", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: "not-an-array" },
      });

      expect(response.status).toBe(400);
    });

    it("returns 404 when mutation target is not found", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "POST",
        segments: ["_graph", "missing", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/x", value: 1 }] },
      });

      expect(response.status).toBe(404);
    });

    it("returns 405 for non-POST methods", async () => {
      configureAdminServer({ resolveBinding: async () => makeBinding() });
      const server = createAdminServer({ environmentKey: "test" });

      const response = await server.handleRequest({
        method: "GET",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      });

      expect(response.status).toBe(405);
    });
  });
});
