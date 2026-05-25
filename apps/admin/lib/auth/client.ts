"use client";

import { createAuthClient, type AuthClient } from "@cms0/auth/client";

const _authClient: AuthClient = createAuthClient({
  basePath: "/api/auth",
});

export const authClient: AuthClient = _authClient;

export type AuthSession = typeof _authClient.$Infer.Session;
export type AuthUser = AuthSession["user"];

export const { useSession: useBetterAuthSession } = authClient;
