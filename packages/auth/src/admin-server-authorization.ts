import {
  apiKeyPermissionsToStatements,
  readApiKeyFromHeaders,
  verifyOrganizationApiKey,
} from "./admin-api-keys";

type AdminRequestMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

type BetterAuthLike = {
  api: {
    verifyApiKey: (input: {
      body: {
        key: string;
        permissions: Record<string, string[]>;
      };
    }) => Promise<{ key: unknown; valid: boolean } | null>;
    getSession: (input: { headers: Headers }) => Promise<{
      session?: { activeOrganizationId?: string | null };
      user?: { id?: string | null };
    } | null>;
    hasPermission: (input: {
      body: {
        organizationId?: string;
        permissions: Record<string, string[]>;
      };
      headers: Headers;
    }) => Promise<{ success?: boolean } | null>;
  };
};

type AuthorizationResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      body: {
        error: string;
        route: string;
      };
    };

const buildRoute = (segments: string[]) =>
  segments.length === 0 ? "/" : `/${segments.join("/")}`;

const readString = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const deny = (
  status: number,
  route: string,
  error: string,
): AuthorizationResult => ({
  ok: false,
  status,
  body: {
    error,
    route,
  },
});

export const authorizeAdminServerRequest = async (input: {
  allowApiKeys?: boolean;
  auth: BetterAuthLike;
  method: AdminRequestMethod;
  resolveApiKeyPermissions: (action: string) => string[];
  resolvePolicyAction: (
    segments: string[],
    method: AdminRequestMethod,
  ) => string;
  resolveSessionPermissionCheck: (action: string) => Record<string, string[]>;
  segments: string[];
  headers: Headers;
  environmentKey?: string;
  organizationId?: string | null;
}): Promise<AuthorizationResult> => {
  const route = buildRoute(input.segments);
  const action = input.resolvePolicyAction(input.segments, input.method);
  const apiKey = readApiKeyFromHeaders(input.headers);
  const allowApiKeys = input.allowApiKeys ?? true;

  if (apiKey) {
    if (!allowApiKeys) {
      return deny(403, route, "Forbidden");
    }

    if (input.segments[0] === "api-keys") {
      return deny(403, route, "Forbidden");
    }

    const permissions = apiKeyPermissionsToStatements(
      input.resolveApiKeyPermissions(action),
    );
    const matchingKey = await verifyOrganizationApiKey(
      input.auth,
      apiKey,
      permissions,
      input.environmentKey,
    );

    if (!matchingKey) {
      return deny(401, route, "Unauthorized");
    }

    return { ok: true };
  }

  const session = await input.auth.api.getSession({
    headers: input.headers,
  });

  if (!session?.user?.id) {
    return deny(401, route, "Unauthorized");
  }

  const organizationId =
    readString(input.organizationId) ||
    readString(session.session?.activeOrganizationId);

  if (!organizationId) {
    return deny(403, route, "No active organization.");
  }

  const permissionCheck = input.resolveSessionPermissionCheck(action);
  let hasPermission = false;
  try {
    const result = await input.auth.api.hasPermission({
      body: {
        organizationId,
        permissions: permissionCheck,
      },
      headers: input.headers,
    });
    hasPermission = Boolean(result?.success);
  } catch {
    hasPermission = false;
  }

  if (!hasPermission) {
    return deny(403, route, "Forbidden");
  }

  return { ok: true };
};
