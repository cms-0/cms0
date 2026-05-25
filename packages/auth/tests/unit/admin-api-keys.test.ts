import { describe, expect, it, vi } from "vitest";

import {
  authorizeAdminServerRequest,
  createOrganizationApiKey,
  getOrganizationApiKeyAccess,
  listOrganizationApiKeys,
  roleHasPermission,
} from "../../src";

const headers = new Headers();

const sessionFor = (
  userId: string,
  activeOrganizationId: string | null = "org_active",
) => ({
  session: {
    activeOrganizationId,
  },
  user: {
    id: userId,
  },
});

describe("@cms0/auth organization API keys", () => {
  it("uses Better Auth's singular apiKey resource for role checks", () => {
    expect(roleHasPermission("admin", { apiKey: ["read"] })).toBe(true);
    expect(roleHasPermission("admin", { apiKeys: ["read"] })).toBe(false);
  });

  it("checks API-key access against the route organization context", async () => {
    const hasPermission = vi.fn().mockResolvedValue({ success: true });
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(sessionFor("user_1")),
        hasPermission,
      },
    };

    await expect(
      getOrganizationApiKeyAccess(auth, headers, {
        organizationId: "org_route",
      }),
    ).resolves.toEqual({
      canCreate: true,
      canDelete: true,
      canRead: true,
      canUpdate: true,
    });

    expect(hasPermission.mock.calls.map(([input]) => input.body)).toEqual([
      { organizationId: "org_route", permissions: { apiKey: ["create"] } },
      { organizationId: "org_route", permissions: { apiKey: ["read"] } },
      { organizationId: "org_route", permissions: { apiKey: ["update"] } },
      { organizationId: "org_route", permissions: { apiKey: ["delete"] } },
    ]);
  });

  it("lists and filters API keys using the route organization context", async () => {
    const listApiKeys = vi.fn().mockResolvedValue({
      apiKeys: [
        {
          createdAt: "2026-05-21T00:00:00.000Z",
          enabled: true,
          expiresAt: null,
          id: "key_route",
          lastRequest: null,
          metadata: {
            environmentKey: "env_route",
            organizationId: "org_route",
          },
          name: "Route key",
          permissions: { generatedModels: ["read"] },
          prefix: "cms0",
          referenceId: "org_route",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
        {
          createdAt: "2026-05-21T00:00:00.000Z",
          enabled: true,
          expiresAt: null,
          id: "key_active",
          lastRequest: null,
          metadata: {
            environmentKey: "env_route",
            organizationId: "org_active",
          },
          name: "Active key",
          permissions: { generatedModels: ["read"] },
          prefix: "cms0",
          referenceId: "org_active",
          updatedAt: "2026-05-21T00:00:00.000Z",
        },
      ],
    });
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(sessionFor("user_1")),
        listApiKeys,
      },
    };

    const result = await listOrganizationApiKeys(auth, headers, "env_route", {
      organizationId: "org_route",
    });

    expect(listApiKeys).toHaveBeenCalledWith({
      headers,
      query: {
        configId: "default",
        organizationId: "org_route",
      },
    });
    expect(result.map((key) => key.id)).toEqual(["key_route"]);
  });

  it("creates API keys for the route organization even without an active organization", async () => {
    const createApiKey = vi.fn().mockImplementation(async ({ body }) => ({
      configId: body.configId,
      createdAt: "2026-05-21T00:00:00.000Z",
      enabled: true,
      expiresAt: null,
      id: "key_created",
      key: "cms0_secret",
      lastRequest: null,
      metadata: body.metadata,
      name: body.name,
      permissions: body.permissions,
      prefix: body.prefix ?? "cms0",
      referenceId: body.organizationId,
      updatedAt: "2026-05-21T00:00:00.000Z",
    }));
    const auth = {
      api: {
        createApiKey,
        deleteApiKey: vi.fn(),
        getSession: vi.fn().mockResolvedValue(sessionFor("user_1", null)),
        listApiKeys: vi.fn(),
        updateApiKey: vi.fn(),
      },
    };

    await expect(
      createOrganizationApiKey(
        auth,
        headers,
        { name: "Route key", prefix: "rk" },
        "env_route",
        { organizationId: "org_route" },
      ),
    ).resolves.toMatchObject({
      key: {
        id: "key_created",
        metadata: {
          environmentKey: "env_route",
          organizationId: "org_route",
        },
      },
      secret: "cms0_secret",
    });

    expect(createApiKey).toHaveBeenCalledWith({
      body: expect.objectContaining({
        metadata: expect.objectContaining({
          environmentKey: "env_route",
          organizationId: "org_route",
        }),
        organizationId: "org_route",
        userId: "user_1",
      }),
    });
  });

  it("authorizes admin server requests against an explicit organization", async () => {
    const hasPermission = vi.fn().mockResolvedValue({ success: true });
    const auth = {
      api: {
        getSession: vi.fn().mockResolvedValue(sessionFor("user_1", null)),
        hasPermission,
        verifyApiKey: vi.fn(),
      },
    };

    await expect(
      authorizeAdminServerRequest({
        auth,
        headers,
        method: "GET",
        organizationId: "org_route",
        resolveApiKeyPermissions: () => [],
        resolvePolicyAction: () => "schema:read",
        resolveSessionPermissionCheck: () => ({ descriptorSchema: ["read"] }),
        segments: ["schema"],
      }),
    ).resolves.toEqual({ ok: true });

    expect(hasPermission).toHaveBeenCalledWith({
      body: {
        organizationId: "org_route",
        permissions: {
          descriptorSchema: ["read"],
        },
      },
      headers,
    });
  });
});
