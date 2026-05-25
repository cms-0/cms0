import { afterEach, beforeEach, describe, expect, it } from "vitest";

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

function createMockBinding(): AdminServerBinding & {
  __graphStore: Map<string, unknown>;
} {
  const graphStore = new Map<string, unknown>();

  const binding: AdminServerBinding & { __graphStore: Map<string, unknown> } = {
    __graphStore: graphStore,
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
    getUsageSummary: async () => ({
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
      storage: { contentStoreBytes: 0, schemaSnapshotBytes: 0, totalBytes: 0 },
    }),
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
    readGraphValue: async ({ path }) => graphStore.get(path) ?? null,
    mutateGraphValue: async ({ path, ops }) => {
      const current = graphStore.get(path);
      if (current === undefined) return null;
      const { applyGraphMutations } = await import("@cms0/admin-server");
      const result = applyGraphMutations(current, { ops });
      if (!result.ok) throw new Error(result.error);
      graphStore.set(path, result.value);
      return result.value;
    },
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

  return binding;
}

describe("graph API integration", () => {
  const originalConfig = getAdminServerConfig();
  let binding: ReturnType<typeof createMockBinding>;

  beforeEach(() => {
    binding = createMockBinding();
    configureAdminServer({ resolveBinding: async () => binding });
  });

  afterEach(() => {
    configureAdminServer(originalConfig);
  });

  const server = () => createAdminServer({ environmentKey: "test" });

  describe("flat singleton", () => {
    it("reads a flat singleton", async () => {
      binding.__graphStore.set("homePage", {
        headline: "Hello",
        body: "World",
      });
      const response = await server().handleRequest({
        method: "GET",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ headline: "Hello", body: "World" });
    });

    it("mutates a flat singleton field", async () => {
      binding.__graphStore.set("homePage", { headline: "Old", body: "World" });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/headline", value: "New" }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ headline: "New", body: "World" });
      expect(binding.__graphStore.get("homePage")).toEqual({
        headline: "New",
        body: "World",
      });
    });

    it("sets nested property", async () => {
      binding.__graphStore.set("homePage", {
        seo: { title: "Old", description: "Desc" },
      });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/seo/title", value: "New Title" }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        seo: { title: "New Title", description: "Desc" },
      });
    });
  });

  describe("nested objects", () => {
    it("creates new intermediate nested path", async () => {
      binding.__graphStore.set("config", { existing: true });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "config", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/new/deep/value", value: 42 }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        existing: true,
        new: { deep: { value: 42 } },
      });
    });
  });

  describe("array CRUD", () => {
    it("inserts into array", async () => {
      binding.__graphStore.set("homePage", { faq: [{ q: "Q1" }] });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "insert", path: "/faq/-", value: { q: "Q2" } }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ faq: [{ q: "Q1" }, { q: "Q2" }] });
    });

    it("deletes array element", async () => {
      binding.__graphStore.set("homePage", {
        faq: [{ q: "Q1" }, { q: "Q2" }, { q: "Q3" }],
      });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "delete", path: "/faq/1" }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ faq: [{ q: "Q1" }, { q: "Q3" }] });
    });

    it("updates array element by index", async () => {
      binding.__graphStore.set("homePage", { faq: [{ q: "Q1" }, { q: "Q2" }] });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/faq/1", value: { q: "Updated" } }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ faq: [{ q: "Q1" }, { q: "Updated" }] });
    });
  });

  describe("batch mutation", () => {
    it("applies multiple ops", async () => {
      binding.__graphStore.set("homePage", {
        headline: "Old",
        items: ["a"],
        count: 1,
      });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: {
          ops: [
            { op: "set", path: "/headline", value: "New" },
            { op: "insert", path: "/items/-", value: "b" },
            { op: "set", path: "/count", value: 2 },
          ],
        },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        headline: "New",
        items: ["a", "b"],
        count: 2,
      });
    });

    it("rejects batch when one op fails", async () => {
      binding.__graphStore.set("homePage", { faq: [{ q: "Q1" }] });
      try {
        await server().handleRequest({
          method: "POST",
          segments: ["_graph", "homePage", "_mutate"],
          searchParams: new URLSearchParams(),
          headers: new Headers(),
          body: {
            ops: [
              { op: "set", path: "/faq/0/q", value: "Good" },
              { op: "insert", path: "/faq/99", value: "x" },
            ],
          },
        });
      } catch {
        /* expected to throw from binding */
      }
      expect(binding.__graphStore.get("homePage")).toEqual({
        faq: [{ q: "Q1" }],
      });
    });
  });

  describe("whole document replace", () => {
    it("replaces root via path /", async () => {
      binding.__graphStore.set("homePage", { old: true });
      const response = await server().handleRequest({
        method: "POST",
        segments: ["_graph", "homePage", "_mutate"],
        searchParams: new URLSearchParams(),
        headers: new Headers(),
        body: { ops: [{ op: "set", path: "/", value: { new: true } }] },
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ new: true });
    });
  });

  describe("query param forwarding", () => {
    it("forwards locale and fields to readGraphValue", async () => {
      let captured: any;
      binding.readGraphValue = async ({ options }) => {
        captured = options;
        return { ok: true };
      };
      await server().handleRequest({
        method: "GET",
        segments: ["_graph", "homePage"],
        searchParams: new URLSearchParams({
          locale: "en",
          fields: "title,body",
        }),
        headers: new Headers(),
      });
      expect(captured).toMatchObject({
        locale: "en",
        fields: ["title", "body"],
      });
    });
  });
});
