import { betterAuth } from "better-auth";
import { apiKey } from "@better-auth/api-key";
import {
  admin,
  bearer,
  openAPI,
  organization,
} from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import {
  ac,
  apiKeyDefaultPermissions,
  ensureSessionDefaults,
  organizationRoles,
} from "@cms0/auth";
import { sendTeamInvite } from "@cms0/transactional";

import { getSelfHostedEmailService } from "@/lib/email/service";

import {
  getSelfHostedAuthConfig,
  getSelfHostedGoogleProviderConfig,
} from "./config";
import { requireSelfHostedInvitationForUserCreate } from "./invitations";

type BetterAuthDatabase = NonNullable<Parameters<typeof betterAuth>[0]["database"]>;

const defaultOrganizationName = (userName?: string | null) => {
  const normalizedName = userName?.trim();
  return normalizedName ? `${normalizedName}'s Team` : "My Team";
};

const isOrganizationAlreadyExistsError = (error: unknown) => {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

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

export const createSelfHostedAuth = (database: BetterAuthDatabase) => {
  const config = getSelfHostedAuthConfig();
  const googleProviderConfig = getSelfHostedGoogleProviderConfig();
  let createDefaultOrganizationForUser:
    | ((input: { userId: string; userName?: string | null }) => Promise<void>)
    | null = null;

  const authInstance = betterAuth({
    appName: config.appName,
    basePath: config.basePath,
    database,
    ...(config.secret ? { secret: config.secret } : {}),
    trustedOrigins: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    ...(googleProviderConfig
      ? {
          socialProviders: {
            google: googleProviderConfig,
          },
        }
      : {}),
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: requireSelfHostedInvitationForUserCreate,
          async after(user) {
            if (!user?.id) {
              return;
            }

            await createDefaultOrganizationForUser?.({
              userId: String(user.id),
              userName: typeof user.name === "string" ? user.name : null,
            });
          },
        },
      },
      session: {
        create: {
          async before(session, context) {
            if (!context || !session?.userId) {
              return;
            }

            return ensureSessionDefaults(session, context.context?.adapter);
          },
        },
      },
    },
    advanced: {
      database: {
        generateId: false,
      },
      useSecureCookies: config.baseUrl?.startsWith("https://") ?? false,
      defaultCookieAttributes: {
        secure: config.baseUrl?.startsWith("https://") ?? false,
        httpOnly: true,
        sameSite: config.baseUrl?.startsWith("https://") ? "none" : "lax",
      },
    },
    plugins: [
      openAPI(),
      apiKey({
        enableMetadata: true,
        permissions: {
          defaultPermissions: apiKeyDefaultPermissions,
        },
      }),
      organization({
        teams: {
          enabled: true,
          defaultTeam: {
            enabled: true,
          },
        },
        ac: ac as never,
        roles: organizationRoles as never,
        async sendInvitationEmail(data) {
          const baseUrl =
            config.baseUrl ?? config.trustedOrigins[0] ?? "http://localhost:3000";
          const invitePath = `/settings/team/accept-invitation/${data.id}`;
          const inviteUrl = new URL(invitePath, baseUrl).toString();

          await sendTeamInvite(
            data.invitation.email,
            {
              inviteUrl,
              inviterName: config.appName,
              recipientEmail: data.invitation.email,
              teamName: config.appName,
            },
            {
              service: getSelfHostedEmailService(),
            },
          );
        },
      }),
      admin(),
      bearer(),
      nextCookies(),
    ],
  });

  createDefaultOrganizationForUser = async ({ userId, userName }) => {
    try {
      await authInstance.api.createOrganization({
        body: {
          userId,
          keepCurrentActiveOrganization: false,
          name: defaultOrganizationName(userName),
          slug: userId,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : "";
      if (
        message.includes("slug") ||
        message.includes("duplicate") ||
        isOrganizationAlreadyExistsError(error)
      ) {
        return;
      }

      throw error;
    }
  };

  return authInstance;
};
