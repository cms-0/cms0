/**
 * Auth Factories
 *
 * Environment-specific presets for creating better-auth instances.
 */

export { createAuthFactory, type Cms0Auth } from "./core";
export { createSelfHostedAuth } from "./self-hosted";

export type {
  AuthFactoryConfig,
  SelfHostedAuthOptions,
  BetterAuthDatabase,
  CookieConfig,
  InvitationData,
  GoogleProviderConfig,
  OrganizationCreateGuard,
  UserDeleteHook,
} from "./types";
