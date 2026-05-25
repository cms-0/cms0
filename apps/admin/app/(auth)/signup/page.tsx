import { SignupForm } from "@/components/signup-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@cms0/ui";
import { getSelfHostedGoogleProviderConfig } from "@/lib/auth/config";
import {
  isSelfHostedInvitationAvailable,
  loadSelfHostedInvitation,
} from "@/lib/auth/invitations";

type SignupPageProps = {
  searchParams: Promise<{
    invitationId?: string;
    redirect?: string;
  }>;
};

export default async function Page({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const invitationId = params.invitationId?.trim();
  const invitation = invitationId
    ? await loadSelfHostedInvitation(invitationId)
    : null;

  if (!isSelfHostedInvitationAvailable(invitation)) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invitation required</CardTitle>
          <CardDescription>
            Account creation is available only from a valid team invitation.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const activeInvitation = invitation!;

  return (
    <SignupForm
      googleEnabled={Boolean(getSelfHostedGoogleProviderConfig())}
      invitation={{
        email: activeInvitation.email,
        id: activeInvitation.id,
        organizationName: activeInvitation.organizationName,
        role: activeInvitation.role,
      }}
      redirect={params.redirect}
    />
  );
}
