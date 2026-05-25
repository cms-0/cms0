import { createSelfHostedAuth, createAuthDatabaseAdapter } from "@cms0/auth";
import { sendTeamInvite } from "@cms0/transactional";

import * as authSchema from "../../db/auth-schema";
import {
  getSelfHostedAuthConfig,
  getSelfHostedGoogleProviderConfig,
} from "./config";
import { requireSelfHostedInvitationForUserCreate } from "./invitations";
import { getSelfHostedEmailService } from "@/lib/email/service";

const config = getSelfHostedAuthConfig();
const googleProvider = getSelfHostedGoogleProviderConfig();

export const auth = createSelfHostedAuth(
  createAuthDatabaseAdapter(
    { connectionString: config.databaseUrl! },
    authSchema,
  ),
  {
    appName: config.appName,
    basePath: config.basePath,
    trustedOrigins: config.trustedOrigins,
    baseUrl: config.baseUrl,
    secret: config.secret ?? undefined,
    googleProvider: googleProvider ?? undefined,
    databaseHooks: {
      user: {
        create: {
          before: requireSelfHostedInvitationForUserCreate,
        },
      },
    },
    sendInvitationEmail: async (data) => {
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
  },
);

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
