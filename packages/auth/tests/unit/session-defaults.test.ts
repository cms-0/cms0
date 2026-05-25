import { describe, expect, it, vi } from "vitest";

import {
  applySessionDefaultsToUserSessions,
  ensureSessionDefaults,
} from "../../src/session-defaults";

describe("@cms0/auth session defaults", () => {
  it("fills missing active organization and team from adapter rows", async () => {
    const adapter = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ organizationId: "org_1" }])
        .mockResolvedValueOnce([{ teamId: "team_1" }])
        .mockResolvedValueOnce([{ id: "team_1", organizationId: "org_1" }]),
    };

    await expect(
      ensureSessionDefaults({ userId: "user_1" }, adapter),
    ).resolves.toEqual({
      data: {
        activeOrganizationId: "org_1",
        activeTeamId: "team_1",
        userId: "user_1",
      },
    });
  });

  it("does not query when the session already has active ids", async () => {
    const adapter = { findMany: vi.fn() };

    await expect(
      ensureSessionDefaults(
        {
          activeOrganizationId: "org_1",
          activeTeamId: "team_1",
          userId: "user_1",
        },
        adapter,
      ),
    ).resolves.toBeUndefined();
    expect(adapter.findMany).not.toHaveBeenCalled();
  });

  it("persists active organization and team defaults into existing sessions", async () => {
    const adapter = {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([
          { id: "session_1", userId: "user_1" },
        ])
        .mockResolvedValueOnce([{ organizationId: "org_1" }])
        .mockResolvedValueOnce([{ teamId: "team_1" }])
        .mockResolvedValueOnce([{ id: "team_1", organizationId: "org_1" }]),
      update: vi.fn().mockResolvedValue(null),
    };

    await expect(
      applySessionDefaultsToUserSessions("user_1", adapter),
    ).resolves.toBe(1);

    expect(adapter.update).toHaveBeenCalledWith({
      model: "session",
      where: [{ field: "id", value: "session_1" }],
      update: {
        activeOrganizationId: "org_1",
        activeTeamId: "team_1",
      },
    });
  });
});
