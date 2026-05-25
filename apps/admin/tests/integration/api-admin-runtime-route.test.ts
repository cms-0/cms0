import { NextRequest } from "next/server";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handleRequest: vi.fn(),
}));

vi.mock("@/lib/admin-server", () => ({
  getSelfHostedAdminServer: vi.fn(() => ({
    handleRequest: mocks.handleRequest,
  })),
}));

const loadRoute = async () => import("@/app/api/content/[[...slug]]/route");

describe("POST /api/content/[[...slug]]", () => {
  beforeEach(() => {
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("returns the authorization error when the request is not allowed", async () => {
    mocks.handleRequest.mockResolvedValue({
      body: {
        error: "Unauthorized",
        route: "/schema",
      },
      status: 401,
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new NextRequest("http://localhost/api/content/schema", {
        method: "POST",
      }),
      {
        params: Promise.resolve({
          slug: ["schema"],
        }),
      },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "Unauthorized",
      route: "/schema",
    });
    expect(mocks.handleRequest).toHaveBeenCalled();
  });

  it("forwards runtime publish requests after authorization", async () => {
    mocks.handleRequest.mockResolvedValue({
      body: {
        ok: true,
        snapshot: {
          version: "2026-04-23T10:00:00.000Z",
        },
      },
      status: 200,
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new NextRequest("http://localhost/api/content/schema", {
        body: JSON.stringify({
          descriptor: {
            roots: [],
          },
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
      {
        params: Promise.resolve({
          slug: ["schema"],
        }),
      },
    );

    expect(mocks.handleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          descriptor: {
            roots: [],
          },
        },
        method: "POST",
        segments: ["schema"],
      }),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      snapshot: {
        version: "2026-04-23T10:00:00.000Z",
      },
    });
  });

  it("prefixes descriptor content paths for the runtime router", async () => {
    mocks.handleRequest.mockResolvedValue({
      body: {
        ok: true,
        value: [],
      },
      status: 200,
    });

    const { GET } = await loadRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/content/models/Image", {
        method: "GET",
      }),
      {
        params: Promise.resolve({
          slug: ["models", "Image"],
        }),
      },
    );

    expect(mocks.handleRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "GET",
        segments: ["content", "models", "Image"],
      }),
    );
    expect(response.status).toBe(200);
  });

  it("preserves custom runtime response headers for downloads", async () => {
    mocks.handleRequest.mockResolvedValue({
      body: '{"ok":true}',
      headers: {
        "content-disposition": 'inline; filename="snapshot.json"',
        "content-type": "application/json",
      },
      status: 200,
    });

    const { GET } = await loadRoute();
    const response = await GET(
      new NextRequest("http://localhost/api/content/backups/backup_123/descriptor", {
        method: "GET",
      }),
      {
        params: Promise.resolve({
          slug: ["backups", "backup_123", "descriptor"],
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toBe(
      'inline; filename="snapshot.json"',
    );
    await expect(response.text()).resolves.toBe('{"ok":true}');
  });
});
