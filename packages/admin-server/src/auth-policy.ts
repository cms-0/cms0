import type { AdminRequestMethod } from "@cms0/admin-contract";

export type AdminServerPolicyAction =
  | "content:read"
  | "content:write"
  | "schema:publish"
  | "schema:read"
  | "server:inspect";

export const resolveAdminServerPolicyAction = (
  segments: string[],
  method: AdminRequestMethod,
): AdminServerPolicyAction => {
  if (segments[0] === "schema") {
    return method === "POST" ? "schema:publish" : "schema:read";
  }

  if (segments[0] === "content") {
    return method === "GET" || method === "HEAD"
      ? "content:read"
      : "content:write";
  }

  if (segments[0] === "api-keys") {
    return "schema:publish";
  }

  if (segments[0] === "data-transfer" || segments[0] === "uploads") {
    return method === "GET" || method === "HEAD"
      ? "schema:read"
      : "schema:publish";
  }

  return "server:inspect";
};

export const resolveAdminServerSessionPermissionCheck = (
  action: AdminServerPolicyAction,
): Record<string, string[]> => {
  switch (action) {
    case "content:read":
      return {
        generatedModels: ["read"],
      };
    case "content:write":
      return {
        generatedModels: ["create", "update", "delete"],
      };
    case "schema:read":
    case "server:inspect":
      return {
        descriptorSchema: ["read"],
      };
    case "schema:publish":
      return {
        descriptorSchema: ["create", "update"],
      };
  }
};

export const resolveAdminServerApiKeyPermissions = (
  action: AdminServerPolicyAction,
): string[] => {
  switch (action) {
    case "content:read":
      return ["content:read", "content:write"];
    case "content:write":
      return ["content:write"];
    case "schema:read":
      return ["schema:read", "schema:publish"];
    case "schema:publish":
      return ["schema:publish"];
    case "server:inspect":
      return ["server:inspect", "schema:read", "schema:publish"];
  }
};
