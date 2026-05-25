/**
 * Auth Client Factory
 *
 * Shared better-auth React client factory for Next.js SSR/CSR.
 */

"use client";

import { createAuthClient as createBetterAuthClient } from "better-auth/react";
import { apiKeyClient } from "@better-auth/api-key/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";
import type { BetterAuthClientOptions } from "better-auth";

import { ac, organizationRoles } from "./permissions";

/**
 * Configuration for creating auth client
 */
export type AuthClientConfig = {
  /** Base path for auth API routes (default: "/api/auth") */
  basePath?: string;
  /** Additional client plugins */
  extraPlugins?: NonNullable<BetterAuthClientOptions["plugins"]>;
};

type BetterAuthReactClient = ReturnType<
  typeof createBetterAuthClient<BetterAuthClientOptions>
>;

type AuthClientResult<TData> = Promise<{
  data: TData;
  error?: { message?: string | null } | null;
}>;

type AuthClientOrganizationMember = {
  id?: unknown;
  role?: string | null;
  userId?: unknown;
  user?: {
    email?: string | null;
    name?: string | null;
  } | null;
};

type AuthClientTeamMember = {
  createdAt?: Date | string | null;
  userId?: unknown;
};

type AuthClientInvitation = {
  createdAt?: Date | string | null;
  email: string;
  expiresAt?: Date | string | null;
  id?: unknown;
  role?: string | null;
  status?: string | null;
  teamId?: unknown;
};

type AuthClientOrganizationApi = Record<string, any> & {
  listInvitations: (...args: any[]) => AuthClientResult<AuthClientInvitation[]>;
  listMembers: (...args: any[]) => AuthClientResult<{
    members: AuthClientOrganizationMember[];
  }>;
  listTeamMembers: (...args: any[]) => AuthClientResult<AuthClientTeamMember[]>;
};

export type AuthClient = Omit<
  BetterAuthReactClient,
  "organization" | "useActiveMember" | "useSession"
> & {
  organization: AuthClientOrganizationApi;
  useActiveMember: () => { data?: any; isPending: boolean };
  useSession: () => {
    data?: { user?: any; session?: any } | null;
    isPending: boolean;
  };
} & Record<string, any>;

/**
 * Create a better-auth React client
 *
 * @param config - Client configuration
 * @returns Auth client instance with hooks and methods
 *
 * @example
 * ```typescript
 * // apps/my-app/lib/auth/client.ts
 * import { createAuthClient } from "@cms0/auth/client";
 *
 * export const authClient = createAuthClient({
 *   basePath: "/api/auth",
 * });
 *
 * export type AuthSession = typeof authClient.$Infer.Session;
 * export const { useSession } = authClient;
 * ```
 */
export function createAuthClient(
  config: AuthClientConfig = {},
): AuthClient {
  const { basePath = "/api/auth", extraPlugins = [] } = config;

  const client = createBetterAuthClient({
    basePath,
    plugins: [
      apiKeyClient(),
      adminClient(),
      organizationClient({
        teams: {
          enabled: true,
        },
        ac,
        roles: organizationRoles,
      }),
      ...extraPlugins,
    ],
  });

  return client as unknown as AuthClient;
}
