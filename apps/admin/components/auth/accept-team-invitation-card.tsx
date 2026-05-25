"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cms0/ui";

import { authClient, useBetterAuthSession } from "@/lib/auth/client";
import { invitationMatchesSessionEmail } from "@/lib/auth/route-intent";

export type PublicInvitationData = {
  email: string;
  expiresAt: string | null;
  id: string;
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
  teamId?: string;
  userExists?: boolean;
};

const createLoginInvitationHref = (
  pathname: string,
  email: string,
): Route => {
  const params = new URLSearchParams();
  params.set("redirect", pathname);
  if (email.trim()) {
    params.set("email", email.trim());
  }
  return (`/login?${params.toString()}`) as Route;
};

const createSignupInvitationHref = (pathname: string, invitationId: string): Route => {
  const params = new URLSearchParams();
  params.set("invitationId", invitationId);
  params.set("redirect", pathname);
  return (`/signup?${params.toString()}`) as Route;
};

const createInvitationContinueHref = (
  invitation: PublicInvitationData,
  pathname: string,
  invitationId: string,
): Route =>
  invitation.userExists
    ? createLoginInvitationHref(pathname, invitation.email)
    : createSignupInvitationHref(pathname, invitationId);

export function AcceptTeamInvitationCard({
  fallbackHref,
  initialInvitation,
  initialSignedInEmail,
  invitationId,
}: Readonly<{
  fallbackHref: string;
  initialInvitation?: PublicInvitationData | null;
  initialSignedInEmail?: string | null;
  invitationId: string;
}>) {
  const pathname = usePathname();
  const router = useRouter();
  const sessionQuery = useBetterAuthSession();
  const [error, setError] = React.useState<string | null>(null);
  const [invitation, setInvitation] = React.useState<PublicInvitationData | null>(
    initialInvitation ?? null,
  );
  const [isPending, setIsPending] = React.useState(false);
  const [isLoadingInvitation, setIsLoadingInvitation] = React.useState(
    initialInvitation === undefined,
  );

  React.useEffect(() => {
    if (initialInvitation !== undefined) {
      setInvitation(initialInvitation);
      setError(null);
      setIsLoadingInvitation(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setIsLoadingInvitation(true);
        setError(null);

        const response = await authClient.organization.getInvitation({
          query: { id: invitationId },
        });

        if (cancelled) {
          return;
        }

        if (response.error) {
          setError(response.error.message || "Failed to load invitation.");
          return;
        }

        if (!response.data) {
          setError("Invitation not found.");
          return;
        }

        setInvitation({
          email: response.data.email,
          expiresAt: response.data.expiresAt
            ? new Date(response.data.expiresAt).toISOString()
            : null,
          id: response.data.id,
          organizationId: response.data.organizationId,
          organizationName:
            response.data.organizationName || "Unknown organization",
          role: response.data.role || "viewer",
          status: response.data.status || "pending",
          teamId: response.data.teamId ? String(response.data.teamId) : undefined,
          userExists: false,
        });
      } catch (nextError) {
        if (cancelled) {
          return;
        }

        setError(
          nextError instanceof Error
            ? nextError.message
            : "Failed to load invitation.",
        );
      } finally {
        if (!cancelled) {
          setIsLoadingInvitation(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialInvitation, invitationId]);

  const handleAccept = async () => {
    setIsPending(true);
    setError(null);

    try {
      const response = await authClient.organization.acceptInvitation({
        invitationId,
      });

      if (response.error) {
        setError(response.error.message || "Failed to accept invitation.");
        return;
      }

      if (invitation?.organizationId) {
        await authClient.organization.setActive({
          organizationId: invitation.organizationId,
        });
      }

      if (invitation?.teamId) {
        await authClient.organization.setActiveTeam({
          teamId: invitation.teamId,
        });
      }

      router.replace("/settings/team" as Route);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to accept invitation.",
      );
    } finally {
      setIsPending(false);
    }
  };

  const handleDecline = async () => {
    setIsPending(true);
    setError(null);

    try {
      const response = await authClient.organization.rejectInvitation({
        invitationId,
      });

      if (response.error) {
        setError(response.error.message || "Failed to decline invitation.");
        return;
      }

      router.replace(fallbackHref as Route);
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to decline invitation.",
      );
    } finally {
      setIsPending(false);
    }
  };

  if (isLoadingInvitation) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Loading invitation</CardTitle>
          <CardDescription>
            Looking up the current invitation state.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error || !invitation) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Invitation unavailable</CardTitle>
          <CardDescription>
            {error || "This invitation could not be found."}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href={fallbackHref as Route}>Return</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const isExpired = invitation.expiresAt
    ? new Date(invitation.expiresAt) < new Date()
    : false;
  const isProcessed = invitation.status !== "pending";
  const session = sessionQuery.data;
  const signedInEmail = session?.user?.email ?? initialSignedInEmail ?? null;
  const isSignedIn = Boolean(session?.user || signedInEmail);
  const invitationEmailMatchesSession = invitationMatchesSessionEmail(
    invitation.email,
    signedInEmail,
  );

  const handleSwitchAccount = async () => {
    setIsPending(true);
    setError(null);

    try {
      await authClient.signOut();
      router.push(createInvitationContinueHref(invitation, pathname, invitationId));
      router.refresh();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : "Failed to switch accounts.",
      );
    } finally {
      setIsPending(false);
    }
  };

  if (isExpired || isProcessed) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>
            {isExpired ? "Invitation expired" : "Invitation already processed"}
          </CardTitle>
          <CardDescription>
            {isExpired
              ? "This invitation is no longer valid. Ask the team owner to send a new one."
              : `This invitation has already been ${invitation.status}.`}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild variant="outline">
            <Link href={fallbackHref as Route}>Return</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!isSignedIn) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Accept team invitation</CardTitle>
          <CardDescription>
            Continue with the invited email to accept this invitation.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium text-foreground">{invitation.organizationName}</p>
            <p>{invitation.email}</p>
            <p className="capitalize">{invitation.role}</p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild>
            <Link
              href={createInvitationContinueHref(
                invitation,
                pathname,
                invitationId,
              )}
            >
              Continue
            </Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  if (!invitationEmailMatchesSession) {
    return (
      <Card className="w-full max-w-xl">
        <CardHeader>
          <CardTitle>Switch to the invited account</CardTitle>
          <CardDescription>
            This invitation was sent to a different email than the one in your active
            session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <div className="rounded-lg border bg-muted/20 p-4">
            <p className="font-medium text-foreground">{invitation.organizationName}</p>
            <p>Invited email: {invitation.email}</p>
            <p>Signed in as: {signedInEmail ?? "Unknown account"}</p>
          </div>
          <p>
            Sign out, then continue with the invited email so Better Auth can accept
            the invitation against the correct account.
          </p>
          {error ? <p className="text-destructive">{error}</p> : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-3">
          <Button asChild type="button" variant="outline">
            <Link href={fallbackHref as Route}>Return</Link>
          </Button>
          <Button
            type="button"
            onClick={() => void handleSwitchAccount()}
            disabled={isPending}
          >
            {isPending ? "Switching..." : "Sign out and continue"}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-xl">
      <CardHeader>
        <CardTitle>Accept team invitation</CardTitle>
        <CardDescription>
          Review the invitation details before joining this team.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm text-muted-foreground">
        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="font-medium text-foreground">{invitation.organizationName}</p>
          <p>{invitation.email}</p>
          <p className="capitalize">{invitation.role}</p>
        </div>
        {error ? <p className="text-destructive">{error}</p> : null}
      </CardContent>
      <CardFooter className="flex flex-wrap gap-3">
        <Button type="button" variant="outline" onClick={() => void handleDecline()} disabled={isPending}>
          Decline
        </Button>
        <Button type="button" onClick={() => void handleAccept()} disabled={isPending}>
          {isPending ? "Processing..." : "Accept invitation"}
        </Button>
      </CardFooter>
    </Card>
  );
}
