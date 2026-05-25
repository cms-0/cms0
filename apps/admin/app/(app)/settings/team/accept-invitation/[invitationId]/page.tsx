import {
  AcceptTeamInvitationCard,
  type PublicInvitationData,
} from "@/components/auth/accept-team-invitation-card";
import { loadSelfHostedInvitation } from "@/lib/auth/invitations";
import { getSelfHostedSession } from "@/lib/auth/session";

type PageProps = {
  params: Promise<{ invitationId: string }>;
};

const loadPublicInvitation = async (
  invitationId: string,
): Promise<PublicInvitationData | null> => {
  const row = await loadSelfHostedInvitation(invitationId);
  if (!row) {
    return null;
  }

  return {
    email: row.email,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    id: row.id,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    role: row.role,
    status: row.status,
    teamId: row.teamId,
    userExists: row.userExists,
  };
};

export default async function Page({ params }: PageProps) {
  const { invitationId } = await params;
  const [initialInvitation, session] = await Promise.all([
    loadPublicInvitation(invitationId),
    getSelfHostedSession(),
  ]);

  return (
    <AcceptTeamInvitationCard
      invitationId={invitationId}
      initialInvitation={initialInvitation}
      initialSignedInEmail={session?.user.email ?? null}
      fallbackHref="/settings/team"
    />
  );
}
