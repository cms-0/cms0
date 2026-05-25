import { describe, expect, it, vi } from "vitest";

import {
  AdminClientError,
  buildAdminManualTriggerRunsPath,
  buildSelfHostedAdminBasePath,
  createAdminClient,
} from "@cms0/admin-client";

describe("@cms0/admin-client", () => {
  it("builds the expected runtime paths", () => {
    expect(buildSelfHostedAdminBasePath()).toBe("/api");
    expect(
      buildAdminManualTriggerRunsPath({ limit: 10, triggerId: "trigger_123" }),
    ).toBe("/content/triggers/runs?limit=10&triggerId=trigger_123");
  });

  it("serializes schema publish requests and parses json responses", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(
          JSON.stringify({
            ok: true,
            changed: true,
            migration: null,
            snapshot: {
              checksum: "abc",
              descriptor: { roots: {}, models: {} },
              publishedAt: "2026-04-23T10:00:00.000Z",
              version: "2026-04-23T10:00:00.000Z",
            },
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
    );
    const client = createAdminClient({
      baseUrl: buildSelfHostedAdminBasePath(),
      fetch: fetchMock,
    });

    const response = await client.schema.publish({
      descriptor: { roots: {}, models: {} },
    });

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(requestUrl).toBe("/api/content/schema");
    expect(requestInit?.body).toBe(
      JSON.stringify({ descriptor: { roots: {}, models: {} } }),
    );
    expect(requestInit?.method).toBe("POST");
    expect(new Headers(requestInit?.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(response.changed).toBe(true);
  });

  it("throws AdminClientError for non-ok responses", async () => {
    const client = createAdminClient({
      baseUrl: buildSelfHostedAdminBasePath(),
      fetch: async () =>
        new Response("Forbidden", {
          headers: { "content-type": "text/plain" },
          status: 403,
        }),
    });

    await expect(client.health()).rejects.toBeInstanceOf(AdminClientError);
    await expect(client.health()).rejects.toMatchObject({
      body: "Forbidden",
      path: "/content/health",
      status: 403,
    });
  });
});
