import { describe, expect, it } from "vitest";

import {
  resolveAdminServerApiKeyPermissions,
  resolveAdminServerPolicyAction,
  resolveAdminServerSessionPermissionCheck,
} from "@cms0/admin-server";

describe("@cms0/admin-server auth policy mapping", () => {
  it("maps segments and methods to stable actions", () => {
    expect(resolveAdminServerPolicyAction(["content", "pages"], "GET")).toBe(
      "content:read",
    );
    expect(resolveAdminServerPolicyAction(["content", "pages"], "POST")).toBe(
      "content:write",
    );
    expect(resolveAdminServerPolicyAction(["schema"], "POST")).toBe(
      "schema:publish",
    );
    expect(resolveAdminServerPolicyAction(["uploads", "import"], "GET")).toBe(
      "schema:read",
    );
  });

  it("provides session permission checks for each action", () => {
    expect(resolveAdminServerSessionPermissionCheck("content:read")).toEqual({
      generatedModels: ["read"],
    });
    expect(resolveAdminServerSessionPermissionCheck("content:write")).toEqual({
      generatedModels: ["create", "update", "delete"],
    });
    expect(resolveAdminServerSessionPermissionCheck("schema:publish")).toEqual({
      descriptorSchema: ["create", "update"],
    });
  });

  it("provides API-key permission fallbacks for each action", () => {
    expect(resolveAdminServerApiKeyPermissions("content:read")).toEqual([
      "content:read",
      "content:write",
    ]);
    expect(resolveAdminServerApiKeyPermissions("server:inspect")).toEqual([
      "server:inspect",
      "schema:read",
      "schema:publish",
    ]);
  });
});
