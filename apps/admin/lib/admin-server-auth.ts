import "server-only";

import { authorizeAdminServerRequest } from "@cms0/auth";
import {
  resolveAdminServerApiKeyPermissions,
  resolveAdminServerPolicyAction,
  resolveAdminServerSessionPermissionCheck,
} from "@cms0/admin-server";

import { auth } from "@/lib/auth/auth";

export const authorizeSelfHostedAdminRequest = async (
  request: {
    headers: Headers;
    method: string;
  },
  segments: string[],
): ReturnType<typeof authorizeAdminServerRequest> => {
  return authorizeAdminServerRequest({
    auth,
    environmentKey: "self-hosted",
    headers: request.headers,
    method: request.method as
      | "DELETE"
      | "GET"
      | "HEAD"
      | "OPTIONS"
      | "PATCH"
      | "POST"
      | "PUT",
    resolveApiKeyPermissions: (action) =>
      resolveAdminServerApiKeyPermissions(action as never),
    resolvePolicyAction: resolveAdminServerPolicyAction,
    resolveSessionPermissionCheck: (action) =>
      resolveAdminServerSessionPermissionCheck(action as never),
    segments,
  });
};
