"use client";

import * as React from "react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cms0/ui";
import {
  getPrimaryOrganizationRole,
  organizationRoleOrder,
  roleHasPermission,
  type AppRole,
} from "@cms0/auth/permissions";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, MailPlus, Trash2 } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { isPublicEmailEnabled } from "@/lib/public-client-env";

type TeamMemberRow = {
  createdAt: string | null;
  email: string;
  memberId: string;
  name: string;
  role: AppRole;
  userId: string;
};

type InvitationRow = {
  createdAt: string | null;
  email: string;
  expiresAt: string | null;
  invitationId: string;
  role: AppRole;
  status: string;
};

type TeamPanelData = {
  invitations: InvitationRow[];
  members: TeamMemberRow[];
};

type SelfHostedTeamManagerProps = {
  activeOrganizationId: string | null;
  activeTeamId: string | null;
};

const teamStateQueryKey = (organizationId: string, teamId: string) =>
  ["self-hosted-team", organizationId, teamId] as const;

const readAuthError = (
  value: { error?: { message?: string | null } | null } | null | undefined,
  fallback: string,
) => value?.error?.message?.trim() || fallback;

const formatDate = (value: string | null) => {
  if (!value) {
    return "Pending";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Pending";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const parseInvitationTeamIds = (value: string | null | undefined) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const mapTeamState = async (
  organizationId: string,
  teamId: string,
): Promise<TeamPanelData> => {
  const [teamMembersResponse, membersResponse, invitationsResponse] =
    await Promise.all([
      authClient.organization.listTeamMembers({
        query: { teamId },
      }),
      authClient.organization.listMembers({
        query: {
          limit: 500,
          offset: 0,
          organizationId,
          sortBy: "createdAt",
          sortDirection: "desc",
        },
      }),
      authClient.organization.listInvitations({
        query: {
          organizationId,
        },
      }),
    ]);

  if (teamMembersResponse.error) {
    throw new Error(
      readAuthError(teamMembersResponse, "Unable to load team members."),
    );
  }

  if (membersResponse.error) {
    throw new Error(
      readAuthError(membersResponse, "Unable to load organization members."),
    );
  }

  if (invitationsResponse.error) {
    throw new Error(
      readAuthError(invitationsResponse, "Unable to load invitations."),
    );
  }

  const membersByUserId = new Map(
    membersResponse.data.members.map((member) => [String(member.userId), member]),
  );

  const members = teamMembersResponse.data.map((teamMember) => {
    const member = membersByUserId.get(String(teamMember.userId));
    const resolvedRole = getPrimaryOrganizationRole(member?.role);

    return {
      createdAt:
        typeof teamMember.createdAt === "string"
          ? teamMember.createdAt
          : teamMember.createdAt instanceof Date
            ? teamMember.createdAt.toISOString()
            : null,
      email: member?.user?.email ?? "",
      memberId: String(member?.id ?? ""),
      name: member?.user?.name?.trim() || member?.user?.email || "User",
      role: resolvedRole,
      userId: String(teamMember.userId),
    };
  });

  const invitations = invitationsResponse.data
    .filter(
      (invitation) =>
        invitation.status === "pending" &&
        parseInvitationTeamIds(invitation.teamId ? String(invitation.teamId) : null).includes(
          teamId,
        ),
    )
    .map((invitation) => ({
      createdAt:
        typeof invitation.createdAt === "string"
          ? invitation.createdAt
          : invitation.createdAt instanceof Date
            ? invitation.createdAt.toISOString()
            : null,
      email: invitation.email,
      expiresAt:
        typeof invitation.expiresAt === "string"
          ? invitation.expiresAt
          : invitation.expiresAt instanceof Date
            ? invitation.expiresAt.toISOString()
            : null,
      invitationId: String(invitation.id),
      role: getPrimaryOrganizationRole(invitation.role),
      status: invitation.status ?? "pending",
    }))
    .sort((left, right) => (right.createdAt ?? "").localeCompare(left.createdAt ?? ""));

  return {
    invitations,
    members,
  };
};

export function SelfHostedTeamManager({
  activeOrganizationId,
  activeTeamId,
}: Readonly<SelfHostedTeamManagerProps>) {
  const queryClient = useQueryClient();
  const activeMemberQuery = authClient.useActiveMember();
  const activeRole = getPrimaryOrganizationRole(activeMemberQuery.data?.role);
  const canInvite = roleHasPermission(activeRole, { invitation: ["create"] });
  const canCancelInvitations = roleHasPermission(activeRole, {
    invitation: ["cancel"],
  });
  const canManageMembers = roleHasPermission(activeRole, {
    member: ["update", "delete"],
  });
  const emailDeliveryEnabled = isPublicEmailEnabled();
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [feedbackTone, setFeedbackTone] = React.useState<"error" | "success">(
    "success",
  );

  const teamQuery = useQuery({
    enabled: Boolean(activeOrganizationId && activeTeamId),
    queryKey:
      activeOrganizationId && activeTeamId
        ? teamStateQueryKey(activeOrganizationId, activeTeamId)
        : ["self-hosted-team", "inactive"],
    queryFn: async () => mapTeamState(activeOrganizationId!, activeTeamId!),
  });

  const invalidate = async () => {
    if (!activeOrganizationId || !activeTeamId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: teamStateQueryKey(activeOrganizationId, activeTeamId),
    });
  };

  const inviteMutation = useMutation({
    mutationFn: async (input: { email: string; role: AppRole }) => {
      const response = await authClient.organization.inviteMember({
        email: input.email,
        organizationId: activeOrganizationId!,
        role: input.role as never,
        teamId: activeTeamId!,
      });

      if (response.error) {
        throw new Error(readAuthError(response, "Unable to send invitation."));
      }

      return response.data;
    },
    onMutate: () => {
      setFeedback(null);
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedback(
        error instanceof Error ? error.message : "Unable to send invitation.",
      );
    },
    onSuccess: async () => {
      setFeedbackTone("success");
      setFeedback(
        emailDeliveryEnabled
          ? "Invitation sent."
          : "Invitation created. Use the logged invite URL from the server output.",
      );
      await invalidate();
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async (input: { memberId: string; role: AppRole }) => {
      const response = await authClient.organization.updateMemberRole({
        memberId: input.memberId,
        organizationId: activeOrganizationId!,
        role: input.role as never,
      });

      if (response.error) {
        throw new Error(readAuthError(response, "Unable to update role."));
      }

      return response.data;
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedback(
        error instanceof Error ? error.message : "Unable to update role.",
      );
    },
    onSuccess: async () => {
      setFeedbackTone("success");
      setFeedback("Team member role updated.");
      await invalidate();
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await authClient.organization.removeTeamMember({
        teamId: activeTeamId!,
        userId,
      });

      if (response.error) {
        throw new Error(readAuthError(response, "Unable to remove member."));
      }

      return response.data;
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedback(
        error instanceof Error ? error.message : "Unable to remove member.",
      );
    },
    onSuccess: async () => {
      setFeedbackTone("success");
      setFeedback("Team member removed.");
      await invalidate();
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const response = await authClient.organization.cancelInvitation({
        invitationId,
      });

      if (response.error) {
        throw new Error(
          readAuthError(response, "Unable to cancel invitation."),
        );
      }

      return response.data;
    },
    onError: (error) => {
      setFeedbackTone("error");
      setFeedback(
        error instanceof Error ? error.message : "Unable to cancel invitation.",
      );
    },
    onSuccess: async () => {
      setFeedbackTone("success");
      setFeedback("Invitation cancelled.");
      await invalidate();
    },
  });

  const inviteForm = useForm({
    defaultValues: {
      email: "",
      role: "viewer" as AppRole,
    },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      if (!email) {
        setFeedbackTone("error");
        setFeedback("Email is required.");
        return;
      }

      await inviteMutation.mutateAsync({
        email,
        role: value.role,
      });
      inviteForm.reset();
    },
  });

  if (!activeOrganizationId || !activeTeamId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team unavailable</CardTitle>
          <CardDescription>
            This session has no active organization or team binding yet.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const memberCount = teamQuery.data?.members.length ?? 0;
  const invitationCount = teamQuery.data?.invitations.length ?? 0;

  return (
    <section className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-3">
          <div className="space-y-1">
            <CardTitle>Operators</CardTitle>
            <CardDescription>
              Manage the self-hosted operator roster, invitation flow, and current
              team access.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Role: {activeRole}</Badge>
            <Badge variant="secondary">
              {memberCount} member{memberCount === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {invitationCount} pending invitation
              {invitationCount === 1 ? "" : "s"}
            </Badge>
          </div>

          {feedback ? (
            <div
              className={
                feedbackTone === "error"
                  ? "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
                  : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300"
              }
            >
              {feedback}
            </div>
          ) : null}

          <form
            className="grid gap-3 rounded-lg border p-4 md:grid-cols-[minmax(0,1fr)_minmax(180px,220px)_auto]"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void inviteForm.handleSubmit();
            }}
          >
            <inviteForm.Field name="email">
              {(field) => (
                <Field>
                  <FieldLabel>Invite operator</FieldLabel>
                  <FieldContent>
                    <Input
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="operator@company.com"
                      type="email"
                      value={field.state.value}
                    />
                  </FieldContent>
                  <FieldDescription>
                    {emailDeliveryEnabled
                      ? "Send an email invitation into the self-hosted team."
                      : "Email delivery is not configured. The invitation URL is logged to the server output."}
                  </FieldDescription>
                </Field>
              )}
            </inviteForm.Field>
            <inviteForm.Field name="role">
              {(field) => (
                <Field>
                  <FieldLabel>Role</FieldLabel>
                  <FieldContent>
                    <Select
                      onValueChange={(value) =>
                        field.handleChange(value as AppRole)
                      }
                      value={field.state.value}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select role" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizationRoleOrder.map((roleOption) => (
                          <SelectItem key={roleOption} value={roleOption}>
                            {roleOption}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldContent>
                </Field>
              )}
            </inviteForm.Field>
            <div className="flex items-end">
              <Button
                disabled={!canInvite || inviteMutation.isPending}
                type="submit"
              >
                {inviteMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <MailPlus className="h-4 w-4" />
                )}
                Send invitation
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current members</CardTitle>
          <CardDescription>
            Operators who already have access to this self-hosted admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead className="w-[180px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamQuery.isLoading ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={4}>
                      Loading team members...
                    </TableCell>
                  </TableRow>
                ) : memberCount === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={4}>
                      No operators are assigned yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  teamQuery.data?.members.map((member) => (
                    <TableRow key={`${member.userId}:${member.memberId}`}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{member.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {member.email || "No email available"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          disabled={!canManageMembers || !member.memberId}
                          onValueChange={(value) => {
                            void updateRoleMutation.mutateAsync({
                              memberId: member.memberId,
                              role: value as AppRole,
                            });
                          }}
                          value={member.role}
                        >
                          <SelectTrigger className="w-[160px]">
                            <SelectValue placeholder="Role" />
                          </SelectTrigger>
                          <SelectContent>
                            {organizationRoleOrder.map((roleOption) => (
                              <SelectItem key={roleOption} value={roleOption}>
                                {roleOption}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(member.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          disabled={!canManageMembers || removeMemberMutation.isPending}
                          onClick={() => {
                            void removeMemberMutation.mutateAsync(member.userId);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {removeMemberMutation.isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pending invitations</CardTitle>
          <CardDescription>
            Invitations that have been issued but not yet accepted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-[160px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamQuery.isLoading ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      Loading invitations...
                    </TableCell>
                  </TableRow>
                ) : invitationCount === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      No pending invitations.
                    </TableCell>
                  </TableRow>
                ) : (
                  teamQuery.data?.invitations.map((invitation) => (
                    <TableRow key={invitation.invitationId}>
                      <TableCell className="font-medium">
                        {invitation.email}
                      </TableCell>
                      <TableCell className="capitalize">
                        {invitation.role}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invitation.createdAt)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(invitation.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          disabled={
                            !canCancelInvitations ||
                            cancelInvitationMutation.isPending
                          }
                          onClick={() => {
                            void cancelInvitationMutation.mutateAsync(
                              invitation.invitationId,
                            );
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {cancelInvitationMutation.isPending ? (
                            <LoaderCircle className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
