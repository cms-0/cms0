import "server-only";

import { APIError, getOAuthState } from "better-auth/api";
import { eq, sql } from "drizzle-orm";

import { invitation, organization, user as authUser } from "@/db/auth-schema";
import { db } from "@/lib/config.db";

export type SelfHostedInvitation = {
  email: string;
  expiresAt: Date | null;
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  teamId?: string;
  userExists: boolean;
};

type AuthUserCreateContext = {
  body?: Record<string, unknown>;
  path?: string;
};

type OAuthInvitationState = {
  invitationId?: unknown;
};

const INVITE_ONLY_SIGNUP_MESSAGE =
  "Self-hosted account creation requires a valid team invitation.";

export const normalizeInvitationEmail = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
};

const readString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export const hasSelfHostedUserWithEmail = async (email: string) => {
  const normalizedEmail = normalizeInvitationEmail(email);
  if (!normalizedEmail) {
    return false;
  }

  const [row] = await db
    .select({ id: authUser.id })
    .from(authUser)
    .where(sql`lower(${authUser.email}) = ${normalizedEmail}`)
    .limit(1);

  return Boolean(row?.id);
};

export const loadSelfHostedInvitation = async (
  invitationId: string,
): Promise<SelfHostedInvitation | null> => {
  const [row] = await db
    .select({
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      id: invitation.id,
      organizationId: invitation.organizationId,
      organizationName: organization.name,
      role: invitation.role,
      status: invitation.status,
      teamId: invitation.teamId,
    })
    .from(invitation)
    .leftJoin(organization, eq(invitation.organizationId, organization.id))
    .where(eq(invitation.id, invitationId))
    .limit(1);

  if (!row) {
    return null;
  }

  const email = row.email ?? "";

  return {
    email,
    expiresAt: row.expiresAt ?? null,
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName ?? "Unknown organization",
    role: row.role ?? "viewer",
    status: row.status ?? "pending",
    teamId: row.teamId ?? undefined,
    userExists: await hasSelfHostedUserWithEmail(email),
  };
};

export const isSelfHostedInvitationAvailable = (
  value: Pick<SelfHostedInvitation, "expiresAt" | "status"> | null,
) => {
  if (!value || value.status !== "pending") {
    return false;
  }

  return value.expiresAt ? value.expiresAt >= new Date() : true;
};

const getInvitationIdFromUserCreateContext = async (
  context: AuthUserCreateContext | null | undefined,
) => {
  if (context?.path === "/sign-up/email") {
    return readString(context.body?.invitationId);
  }

  if (
    context?.path === "/callback/:id" ||
    context?.path === "/oauth2/callback/:providerId"
  ) {
    const state = (await getOAuthState()) as OAuthInvitationState | null;
    return readString(state?.invitationId);
  }

  return null;
};

export const requireSelfHostedInvitationForUserCreate = async (
  user: { email?: unknown },
  context: AuthUserCreateContext | null | undefined,
) => {
  if (
    context?.path !== "/sign-up/email" &&
    context?.path !== "/callback/:id" &&
    context?.path !== "/oauth2/callback/:providerId"
  ) {
    return;
  }

  const email = normalizeInvitationEmail(user.email);
  const invitationId = await getInvitationIdFromUserCreateContext(context);

  if (!email || !invitationId) {
    throw new APIError("FORBIDDEN", {
      code: "SELF_HOST_INVITATION_REQUIRED",
      message: INVITE_ONLY_SIGNUP_MESSAGE,
    });
  }

  const currentInvitation = await loadSelfHostedInvitation(invitationId);
  const invitationEmail = normalizeInvitationEmail(currentInvitation?.email);

  if (
    !isSelfHostedInvitationAvailable(currentInvitation) ||
    !invitationEmail ||
    invitationEmail !== email
  ) {
    throw new APIError("FORBIDDEN", {
      code: "SELF_HOST_INVITATION_REQUIRED",
      message: INVITE_ONLY_SIGNUP_MESSAGE,
    });
  }
};
