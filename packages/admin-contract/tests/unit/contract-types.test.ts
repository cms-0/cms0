import { describe, expect, it } from "vitest";

import type {
  AdminRequestInput,
  AdminServerOverviewResponse,
} from "../../src/index";

describe("@cms0/admin-contract", () => {
  it("keeps request and overview contracts typeable", () => {
    const request: AdminRequestInput = {
      body: { ok: true },
      headers: new Headers(),
      method: "POST",
      searchParams: new URLSearchParams("preview=1"),
      segments: ["schema"],
    };

    const overview: AdminServerOverviewResponse = {
      ok: true,
      routes: {
        apiKeys: "/api-keys",
        backupArchive: "/backups/id/archive",
        backupDescriptor: "/backups/id/descriptor",
        backupRestore: "/backups/id/restore",
        backupTypescript: "/backups/id/typescript",
        backups: "/backups",
        content: "/content",
        context: "/context",
        dataTransferExport: "/data-transfer/export",
        dataTransferImport: "/data-transfer/import",
        dataTransferPreflight: "/data-transfer/preflight",
        health: "/health",
        latestSnapshot: "/schema/latest",
        latestTypescript: "/schema/typescript",
        manualTriggerRun: "/manual-triggers/id/runs/id",
        manualTriggerRuns: "/manual-triggers/id/runs",
        manualTriggers: "/manual-triggers",
        publishSchema: "/schema",
        uploadsExport: "/uploads/export",
        uploadsImport: "/uploads/import",
        uploadsPreflight: "/uploads/preflight",
        usage: "/usage",
      },
      snapshot: null,
      target: { environmentKey: "stage" },
    };

    expect(request.method).toBe("POST");
    expect(overview.routes.health).toBe("/health");
  });
});
