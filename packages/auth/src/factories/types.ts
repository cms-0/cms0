/**
 * Auth Factory Types
 *
 * Configuration types for creating better-auth instances with
 * environment-specific presets.
 */

import type { BetterAuthOptions } from "better-auth";
import type { DBAdapter } from "better-auth/adapters";

/**
 * Cookie configuration options
 */
export type CookieConfig = {
  secure: boolean;
  httpOnly: boolean;
  sameSite: "none" | "lax" | "strict";
  domain?: string;
};

/**
 * Invitation data for email hooks
 */
export type InvitationData = {
  id: string;
  invitation: {
    email: string;
    teamId?: string | null;
  };
  inviter: {
    user: {
      name?: string | null;
    };
  };
  organization: {
    name: string;
  };
};

export type UserDeleteHook = (user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) => Promise<void>;

export type OrganizationCreateGuard = (user: {
  id: string;
  email?: string | null;
  name?: string | null;
}) => Promise<boolean> | boolean;

/**
 * Google OAuth provider configuration
 */
export type GoogleProviderConfig = {
  clientId: string;
  clientSecret: string;
  /** Whether to disable implicit signup via OAuth */
  disableImplicitSignUp?: boolean;
  /** Additional OAuth prompt options */
  prompt?: "none" | "login" | "consent" | "select_account";
};

/**
 * Base configuration for auth factory
 */
export type AuthFactoryConfig = {
  /** Required base path for auth routes */
  basePath: string;
  /** Required trusted origins for CORS */
  trustedOrigins: string[];

  /** Optional app name for emails/UI */
  appName?: string;
  /** Optional secret for encryption */
  secret?: string;
  /** Optional base URL for callbacks */
  baseUrl?: string;

  /** Hook called after user creation */
  onUserCreated?: (user: { id: string; name?: string | null }) => Promise<void>;
  /** Hook for sending invitation emails */
  sendInvitationEmail?: (data: InvitationData) => Promise<void>;
  /** Hook for sending verification emails */
  sendVerificationEmail?: NonNullable<
    BetterAuthOptions["emailVerification"]
  >["sendVerificationEmail"];
  /** Hook for sending password reset emails */
  sendResetPassword?: NonNullable<
    NonNullable<BetterAuthOptions["emailAndPassword"]>
  >["sendResetPassword"];

  /** Better Auth request lifecycle hooks. */
  hooks?: BetterAuthOptions["hooks"];
  /** Better Auth database lifecycle hooks. */
  databaseHooks?: BetterAuthOptions["databaseHooks"];

  /** Feature toggle for signup */
  allowSignup?: boolean;
  /** Enable cross-subdomain cookies for deployments that share a root domain. */
  enableCrossSubdomainCookies?: boolean;
  /** Cookie configuration */
  cookieConfig?: CookieConfig;

  /** Google OAuth provider configuration */
  googleProvider?: GoogleProviderConfig;

  /** Session behavior overrides. */
  session?: {
    cookieCache?: {
      enabled: boolean;
      maxAge?: number;
    };
  };

  /** Additional plugins to include */
  extraPlugins?: NonNullable<BetterAuthOptions["plugins"]>;

  /** Optional role and permission surface for environment-specific auth. */
  permissions?: {
    accessControl?: any;
    apiKeyDefaultPermissions?: Record<string, readonly string[]>;
    organizationRoles?: Record<string, any>;
  };

  /** Billing / plan guard hooks */
  billing?: {
    requireActiveOrganization?: (organizationId: string) => Promise<void>;
    requireCanCreateTeam?: (organizationId: string) => Promise<void>;
    requireCanAddTeamMember?: (
      organizationId: string,
      teamId: string,
    ) => Promise<void>;
    requireCanInviteTeamMember?: (
      organizationId: string,
      teamId?: string | null,
    ) => Promise<void>;
  };

  /** Organization-specific policy hooks */
  organization?: {
    allowUserToCreateOrganization?: OrganizationCreateGuard;
  };

  /** User lifecycle hooks */
  user?: {
    beforeDeleteUser?: UserDeleteHook;
    changeEmail?: {
      enabled?: boolean;
      sendChangeEmailConfirmation?: NonNullable<
        NonNullable<BetterAuthOptions["user"]>["changeEmail"]
      >["sendChangeEmailConfirmation"];
      updateEmailWithoutVerification?: boolean;
    };
  };
};

/**
 * Self-hosted environment specific options
 */
export type SelfHostedAuthOptions = AuthFactoryConfig;

/**
 * BetterAuth database adapter type
 */
export type BetterAuthDatabase = (
  options: BetterAuthOptions,
) => DBAdapter<BetterAuthOptions>;
