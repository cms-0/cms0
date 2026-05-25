/**
 * Core Auth Factory
 *
 * Shared better-auth configuration for cms0 runtimes.
 */

import {
  APIError,
  betterAuth,
  type Auth,
  type BetterAuthOptions,
  type DBAdapter,
} from "better-auth";
import { apiKey } from "@better-auth/api-key";
import { admin, bearer, openAPI, organization } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import {
  ac,
  apiKeyDefaultPermissions,
  organizationRoles,
} from "../permissions";
import {
  applySessionDefaultsToUserSessions,
  ensureSessionDefaults,
} from "../session-defaults";
import type {
  AuthFactoryConfig,
  BetterAuthDatabase,
  InvitationData,
} from "./types";

const defaultOrganizationName = (userName?: string | null) => {
  const normalizedName = userName?.trim();
  return normalizedName ? `${normalizedName}'s Team` : "User's Team";
};

const isOrganizationAlreadyExistsError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();

  if (message.includes("organization already exists")) {
    return true;
  }

  if (typeof error === "object" && error !== null) {
    const maybeBody = (error as { body?: { code?: unknown } }).body;
    const code = typeof maybeBody?.code === "string" ? maybeBody.code : null;
    if (code?.toUpperCase() === "ORGANIZATION_ALREADY_EXISTS") {
      return true;
    }
  }

  return false;
};

export type Cms0Auth = Auth<any> & { api: any };

/**
 * Create a better-auth instance with shared configuration
 */
export function createAuthFactory(
  database: BetterAuthDatabase,
  config: AuthFactoryConfig,
): Cms0Auth {
  const {
    basePath,
    trustedOrigins,
    appName = "CMS",
    secret,
    baseUrl,
    onUserCreated,
    sendInvitationEmail,
    sendResetPassword,
    sendVerificationEmail,
    hooks,
    databaseHooks,
    allowSignup = true,
    enableCrossSubdomainCookies = false,
    cookieConfig,
    googleProvider,
    session: sessionOptions,
    extraPlugins = [],
    permissions,
    billing,
    organization: organizationOptions,
    user,
  } = config;
  const authAccessControl = permissions?.accessControl ?? ac;
  const authApiKeyDefaultPermissions =
    permissions?.apiKeyDefaultPermissions ?? apiKeyDefaultPermissions;
  const authOrganizationRoles =
    permissions?.organizationRoles ?? organizationRoles;

  const requireActiveOrganization = billing?.requireActiveOrganization;
  const requireCanCreateTeam = billing?.requireCanCreateTeam;
  const requireCanAddTeamMember = billing?.requireCanAddTeamMember;
  const requireCanInviteTeamMember = billing?.requireCanInviteTeamMember;
  const allowUserToCreateOrganization =
    organizationOptions?.allowUserToCreateOrganization;
  const beforeDeleteUser = user?.beforeDeleteUser;
  const changeEmailConfig = user?.changeEmail;
  const userCreateHooks = databaseHooks?.user?.create;
  const sessionCreateHooks = databaseHooks?.session?.create;

  // Store reference for organization creation callback
  let createDefaultOrganizationForUser:
    | ((input: { userId: string; userName?: string | null }) => Promise<void>)
    | null = null;
  let authAdapter: DBAdapter<BetterAuthOptions> | undefined;

  const databaseWithAdapter = (options: BetterAuthOptions) => {
    authAdapter = database(options);
    return authAdapter;
  };

  const enforceBilling = async (organizationId?: string | null) => {
    if (!requireActiveOrganization || !organizationId) return;
    await requireActiveOrganization(String(organizationId));
  };

  const enforceTeamCreationPolicy = async (organizationId?: string | null) => {
    if (!requireCanCreateTeam || !organizationId) return;

    try {
      await requireCanCreateTeam(String(organizationId));
    } catch (error) {
      throw new APIError("FORBIDDEN", {
        message:
          error instanceof Error ? error.message : "Plan limit reached.",
      });
    }
  };

  const enforceTeamMemberPolicy = async (params: {
    organizationId?: string | null;
    teamId?: string | null;
  }) => {
    const organizationId = params.organizationId
      ? String(params.organizationId)
      : "";
    const teamId = params.teamId ? String(params.teamId) : "";

    if (!requireCanAddTeamMember || !organizationId || !teamId) return;

    try {
      await requireCanAddTeamMember(organizationId, teamId);
    } catch (error) {
      throw new APIError("FORBIDDEN", {
        message:
          error instanceof Error ? error.message : "Plan limit reached.",
      });
    }
  };

  const enforceTeamInvitationPolicy = async (params: {
    organizationId?: string | null;
    teamId?: string | null;
  }) => {
    const organizationId = params.organizationId
      ? String(params.organizationId)
      : "";

    if (!requireCanInviteTeamMember || !organizationId) return;

    try {
      await requireCanInviteTeamMember(organizationId, params.teamId ?? null);
    } catch (error) {
      throw new APIError("FORBIDDEN", {
        message:
          error instanceof Error ? error.message : "Plan limit reached.",
      });
    }
  };

  const authInstance = betterAuth({
    appName,
    basePath,
    database: databaseWithAdapter,
    ...(secret ? { secret } : {}),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowSignup,
      ...(sendResetPassword
        ? {
            sendResetPassword,
          }
        : {}),
    },
    ...(sendVerificationEmail
      ? {
          emailVerification: {
            sendOnSignUp: true,
            sendVerificationEmail,
          },
        }
      : {}),
    ...(googleProvider
      ? {
          socialProviders: {
            google: {
              clientId: googleProvider.clientId,
              clientSecret: googleProvider.clientSecret,
              disableImplicitSignUp:
                googleProvider.disableImplicitSignUp ?? false,
              ...(googleProvider.prompt
                ? { prompt: googleProvider.prompt }
                : {}),
            },
          },
      }
      : {}),
    user: {
      ...(changeEmailConfig
        ? {
            changeEmail: {
              enabled: changeEmailConfig.enabled ?? true,
              ...(changeEmailConfig.sendChangeEmailConfirmation
                ? {
                    sendChangeEmailConfirmation:
                      changeEmailConfig.sendChangeEmailConfirmation,
                  }
                : {}),
              ...(changeEmailConfig.updateEmailWithoutVerification !== undefined
                ? {
                    updateEmailWithoutVerification:
                      changeEmailConfig.updateEmailWithoutVerification,
                  }
                : {}),
            },
          }
        : {}),
      deleteUser: {
        enabled: true,
        beforeDelete: async (targetUser) => {
          if (!beforeDeleteUser) return;

          await beforeDeleteUser({
            id: targetUser.id,
            email: targetUser.email ?? null,
            name: targetUser.name ?? null,
          });
        },
      },
    },
    hooks,
    session: {
      cookieCache: sessionOptions?.cookieCache ?? {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    databaseHooks: {
      ...databaseHooks,
      user: {
        ...databaseHooks?.user,
        create: {
          ...userCreateHooks,
          async before(user, context) {
            return userCreateHooks?.before?.(user, context);
          },
          async after(user, context) {
            await userCreateHooks?.after?.(user, context);

            if (!user?.id) {
              return;
            }

            // Call custom hook if provided
            if (onUserCreated) {
              await onUserCreated({
                id: String(user.id),
                name: typeof user.name === "string" ? user.name : null,
              });
            }

            // Create default organization
            await createDefaultOrganizationForUser?.({
              userId: String(user.id),
              userName: typeof user.name === "string" ? user.name : null,
            });
          },
        },
      },
      session: {
        ...databaseHooks?.session,
        create: {
          ...sessionCreateHooks,
          async before(session, context) {
            const nextSession = await sessionCreateHooks?.before?.(
              session,
              context,
            );
            if (nextSession === false) {
              return false;
            }

            const sessionDefaultsInput =
              nextSession && typeof nextSession === "object" && "data" in nextSession
                ? { ...session, ...nextSession.data }
                : session;

            if (!context || !session?.userId) {
              return nextSession;
            }

            const adapter = context.context?.adapter as
              | DBAdapter<BetterAuthOptions>
              | undefined;

            if (!adapter) {
              return nextSession;
            }

            return ensureSessionDefaults(sessionDefaultsInput, adapter);
          },
        },
      },
    },
    advanced: {
      database: {
        generateId: false,
      },
      ...(cookieConfig
        ? {
            useSecureCookies: cookieConfig.secure,
            ...(enableCrossSubdomainCookies && cookieConfig.domain
              ? {
                  crossSubDomainCookies: {
                    enabled: true,
                    domain: cookieConfig.domain,
                  },
                }
              : {}),
            defaultCookieAttributes: {
              secure: cookieConfig.secure,
              httpOnly: cookieConfig.httpOnly,
              sameSite: cookieConfig.sameSite,
            },
          }
        : {}),
    },
    plugins: [
      openAPI(),
      apiKey({
        enableMetadata: true,
        permissions: {
          defaultPermissions: authApiKeyDefaultPermissions,
        },
        references: "organization",
      }),
      organization({
        allowUserToCreateOrganization: async (targetUser: {
          id: string;
          email?: string | null;
          name?: string | null;
        }) => {
          if (!allowUserToCreateOrganization) return true;

          return await allowUserToCreateOrganization({
            id: String(targetUser.id),
            email:
              typeof targetUser.email === "string"
                ? String(targetUser.email)
                : undefined,
            name:
              typeof targetUser.name === "string"
                ? String(targetUser.name)
                : undefined,
          });
        },
        teams: {
          enabled: true,
          defaultTeam: {
            enabled: true,
          },
        },
        ac: authAccessControl,
        roles: authOrganizationRoles,
        organizationHooks: {
          beforeCreateTeam: async ({
            team,
            organization,
          }: {
            team: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(team.organizationId ?? organization?.id);
            await enforceTeamCreationPolicy(
              team.organizationId ?? organization?.id,
            );
          },
          beforeUpdateTeam: async ({
            team,
            organization,
          }: {
            team: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(team.organizationId ?? organization?.id);
          },
          beforeDeleteTeam: async ({
            team,
            organization,
          }: {
            team: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(team.organizationId ?? organization?.id);
          },
          beforeAddMember: async ({
            member,
            organization,
          }: {
            member: { organizationId?: string | null; teamId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(member.organizationId ?? organization?.id);
            await enforceTeamMemberPolicy({
              organizationId: member.organizationId ?? organization?.id,
              teamId: member.teamId ?? null,
            });
          },
          beforeRemoveMember: async ({
            member,
            organization,
          }: {
            member: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(member.organizationId ?? organization?.id);
          },
          beforeCreateInvitation: async ({
            invitation,
            organization,
          }: {
            invitation: {
              organizationId?: string | null;
              teamId?: string | null;
            };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(
              invitation.organizationId ?? organization?.id,
            );
            await enforceTeamInvitationPolicy({
              organizationId: invitation.organizationId ?? organization?.id,
              teamId: invitation.teamId ?? null,
            });
          },
          beforeCancelInvitation: async ({
            invitation,
            organization,
          }: {
            invitation: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(
              invitation.organizationId ?? organization?.id,
            );
          },
          beforeAddTeamMember: async ({
            team,
            organization,
          }: {
            team: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(team.organizationId ?? organization?.id);
          },
          beforeRemoveTeamMember: async ({
            team,
            organization,
          }: {
            team: { organizationId?: string | null };
            organization?: { id?: string | null };
          }) => {
            await enforceBilling(team.organizationId ?? organization?.id);
          },
        },
        ...(sendInvitationEmail
          ? {
              sendInvitationEmail: async (data: InvitationData) => {
                await sendInvitationEmail(data);
              },
            }
          : {}),
      }),
      admin(),
      bearer(),
      nextCookies(),
      ...extraPlugins,
    ],
  });

  // Set up default organization creation callback
  createDefaultOrganizationForUser = async ({ userId, userName }) => {
    let shouldApplySessionDefaults = false;

    try {
      await authInstance.api.createOrganization({
        body: {
          userId,
          keepCurrentActiveOrganization: false,
          name: defaultOrganizationName(userName),
          slug: userId,
        },
      });
      shouldApplySessionDefaults = true;
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        message.includes("slug") ||
        message.includes("duplicate") ||
        isOrganizationAlreadyExistsError(error)
      ) {
        shouldApplySessionDefaults = true;
      } else {
        throw error;
      }
    }

    if (shouldApplySessionDefaults) {
      await applySessionDefaultsToUserSessions(userId, authAdapter);
    }
  };

  return authInstance as unknown as Cms0Auth;
}
