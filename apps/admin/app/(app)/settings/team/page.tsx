import { requireSelfHostedSession } from "@/lib/auth/session";
import { SelfHostedTeamManager } from "@/components/self-hosted-team-manager";

export default async function Page() {
  const session = await requireSelfHostedSession();
  const activeOrganizationId = session.session.activeOrganizationId
    ? String(session.session.activeOrganizationId)
    : null;
  const activeTeamId = session.session.activeTeamId
    ? String(session.session.activeTeamId)
    : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Team</h1>
        <p className="text-sm text-muted-foreground">
          Manage operators, roles, invitations, and membership.
        </p>
      </div>

      <SelfHostedTeamManager
        activeOrganizationId={activeOrganizationId}
        activeTeamId={activeTeamId}
      />
    </div>
  );
}
