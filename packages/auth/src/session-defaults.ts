type MemberRow = { organizationId: string | null };
type TeamMemberRow = { teamId: string | null };
type TeamRow = {
  id: string | null;
  organizationId: string | null;
};

type SessionDefaultsAdapter = {
  findMany<T = unknown>(args: Record<string, unknown>): Promise<T[]>;
  update?(args: Record<string, unknown>): Promise<unknown>;
};

type SessionWithActiveIds = {
  id?: string | null;
  userId?: string;
  activeOrganizationId?: string;
  activeTeamId?: string;
};

export async function ensureSessionDefaults(
  session: SessionWithActiveIds,
  adapter: SessionDefaultsAdapter | undefined,
) {
  if (!session?.userId || !adapter) {
    return;
  }

  const userId = String(session.userId);
  if (userId === "" || userId === "undefined" || userId === "null") {
    return;
  }

  let activeOrganizationId = session.activeOrganizationId
    ? String(session.activeOrganizationId)
    : null;
  let activeTeamId = session.activeTeamId ? String(session.activeTeamId) : null;

  if (activeOrganizationId === null) {
    const members = (await adapter.findMany({
      model: "member",
      where: [{ field: "userId", value: userId }],
      sortBy: { field: "createdAt", direction: "asc" },
      limit: 1,
    })) as MemberRow[];

    activeOrganizationId = members?.[0]?.organizationId ?? null;
  }

  if (activeTeamId === null && activeOrganizationId !== null) {
    const teamMembers = (await adapter.findMany({
      model: "teamMember",
      where: [{ field: "userId", value: userId }],
      sortBy: { field: "createdAt", direction: "asc" },
      limit: 100,
    })) as TeamMemberRow[];

    if (teamMembers?.length) {
      const teamIds = teamMembers
        .map((teamMember) => teamMember.teamId)
        .filter(
          (teamId): teamId is string => teamId !== null && teamId !== undefined,
        );

      if (teamIds.length) {
        const teams = (await adapter.findMany({
          model: "team",
          where: [
            { field: "id", value: teamIds, operator: "in" },
            { field: "organizationId", value: activeOrganizationId },
          ],
          sortBy: { field: "createdAt", direction: "asc" },
          limit: 1,
        })) as TeamRow[];

        activeTeamId = teams?.[0]?.id ?? null;
      }
    }

    if (activeTeamId === null) {
      const teams = (await adapter.findMany({
        model: "team",
        where: [{ field: "organizationId", value: activeOrganizationId }],
        sortBy: { field: "createdAt", direction: "asc" },
        limit: 1,
      })) as TeamRow[];

      activeTeamId = teams?.[0]?.id ?? null;
    }
  }

  const hasOrgChange =
    activeOrganizationId !== null &&
    String(activeOrganizationId) !== String(session.activeOrganizationId ?? "");
  const hasTeamChange =
    activeTeamId !== null &&
    String(activeTeamId) !== String(session.activeTeamId ?? "");

  if (!hasOrgChange && !hasTeamChange) {
    return;
  }

  const nextSession = { ...session } as Record<string, unknown>;

  if (hasOrgChange) {
    nextSession.activeOrganizationId = activeOrganizationId;
  }

  if (hasTeamChange) {
    nextSession.activeTeamId = activeTeamId;
  }

  return { data: nextSession };
}

export async function applySessionDefaultsToUserSessions(
  userId: string,
  adapter: SessionDefaultsAdapter | undefined,
) {
  if (!adapter?.update || !userId) {
    return 0;
  }

  const sessions = await adapter.findMany<SessionWithActiveIds>({
    model: "session",
    where: [{ field: "userId", value: userId }],
    sortBy: { field: "createdAt", direction: "asc" },
    limit: 100,
  });
  let updatedCount = 0;

  for (const session of sessions) {
    const result = await ensureSessionDefaults(session, adapter);
    const nextSession = result?.data as SessionWithActiveIds | undefined;

    if (!nextSession || !session.id) {
      continue;
    }

    const update: Record<string, unknown> = {};

    if (
      nextSession.activeOrganizationId &&
      nextSession.activeOrganizationId !== session.activeOrganizationId
    ) {
      update.activeOrganizationId = nextSession.activeOrganizationId;
    }

    if (
      nextSession.activeTeamId &&
      nextSession.activeTeamId !== session.activeTeamId
    ) {
      update.activeTeamId = nextSession.activeTeamId;
    }

    if (Object.keys(update).length === 0) {
      continue;
    }

    await adapter.update({
      model: "session",
      where: [{ field: "id", value: session.id }],
      update,
    });
    updatedCount += 1;
  }

  return updatedCount;
}
