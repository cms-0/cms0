import { DashboardOverview } from "@/components/dashboard-overview";
import { getSelfHostedSchemaSnapshot } from "@/lib/admin-server";
import { requireSelfHostedSession } from "@/lib/auth/session";

export default async function Page() {
  const session = await requireSelfHostedSession();
  const snapshot = await getSelfHostedSchemaSnapshot();

  return (
    <DashboardOverview
      initialSnapshot={snapshot}
      signedInName={session.user.name || "Admin"}
    />
  );
}
