import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const queuedRows: unknown[][] = [];
  const builder = {
    from: vi.fn(() => builder),
    leftJoin: vi.fn(() => builder),
    limit: vi.fn(() => Promise.resolve(queuedRows.shift() ?? [])),
    where: vi.fn(() => builder),
  };

  return {
    builder,
    db: {
      select: vi.fn(() => builder),
    },
    getOAuthState: vi.fn(),
    queuedRows,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("better-auth/api", () => ({
  APIError: class APIError extends Error {
    code?: string;
    status: string;

    constructor(status: string, options: { code?: string; message: string }) {
      super(options.message);
      this.code = options.code;
      this.status = status;
    }
  },
  getOAuthState: mocks.getOAuthState,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(() => "eq"),
  sql: vi.fn(() => "sql"),
}));

vi.mock("@/db/auth-schema", () => ({
  invitation: {
    email: "invitation.email",
    expiresAt: "invitation.expiresAt",
    id: "invitation.id",
    organizationId: "invitation.organizationId",
    role: "invitation.role",
    status: "invitation.status",
    teamId: "invitation.teamId",
  },
  organization: {
    id: "organization.id",
    name: "organization.name",
  },
  user: {
    email: "user.email",
    id: "user.id",
  },
}));

vi.mock("@/lib/config.db", () => ({
  db: mocks.db,
}));

const queueInvitation = (overrides: Record<string, unknown> = {}) => {
  mocks.queuedRows.push([
    {
      email: "operator@example.com",
      expiresAt: new Date(Date.now() + 60_000),
      id: "invite_123",
      organizationId: "org_123",
      organizationName: "Acme",
      role: "admin",
      status: "pending",
      teamId: null,
      ...overrides,
    },
  ]);
  mocks.queuedRows.push([]);
};

describe("self-host invitation signup policy", () => {
  beforeEach(() => {
    mocks.queuedRows.length = 0;
    mocks.db.select.mockClear();
    mocks.builder.from.mockClear();
    mocks.builder.leftJoin.mockClear();
    mocks.builder.limit.mockClear();
    mocks.builder.where.mockClear();
    mocks.getOAuthState.mockReset();
  });

  it("does not block direct user creation outside auth signup endpoints", async () => {
    const { requireSelfHostedInvitationForUserCreate } = await import(
      "@/lib/auth/invitations"
    );

    await expect(
      requireSelfHostedInvitationForUserCreate(
        { email: "operator@example.com" },
        null,
      ),
    ).resolves.toBeUndefined();
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("rejects email signup without an invitation id", async () => {
    const { requireSelfHostedInvitationForUserCreate } = await import(
      "@/lib/auth/invitations"
    );

    await expect(
      requireSelfHostedInvitationForUserCreate(
        { email: "operator@example.com" },
        { body: {}, path: "/sign-up/email" },
      ),
    ).rejects.toThrow("Self-hosted account creation requires a valid team invitation.");
  });

  it("allows email signup for a matching pending invitation", async () => {
    const { requireSelfHostedInvitationForUserCreate } = await import(
      "@/lib/auth/invitations"
    );
    queueInvitation();

    await expect(
      requireSelfHostedInvitationForUserCreate(
        { email: "Operator@Example.com" },
        {
          body: { invitationId: "invite_123" },
          path: "/sign-up/email",
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("rejects email signup when the invitation email does not match", async () => {
    const { requireSelfHostedInvitationForUserCreate } = await import(
      "@/lib/auth/invitations"
    );
    queueInvitation();

    await expect(
      requireSelfHostedInvitationForUserCreate(
        { email: "other@example.com" },
        {
          body: { invitationId: "invite_123" },
          path: "/sign-up/email",
        },
      ),
    ).rejects.toThrow("Self-hosted account creation requires a valid team invitation.");
  });

  it("allows OAuth signup when state carries a matching invitation id", async () => {
    const { requireSelfHostedInvitationForUserCreate } = await import(
      "@/lib/auth/invitations"
    );
    mocks.getOAuthState.mockResolvedValue({ invitationId: "invite_123" });
    queueInvitation();

    await expect(
      requireSelfHostedInvitationForUserCreate(
        { email: "operator@example.com" },
        { path: "/callback/:id" },
      ),
    ).resolves.toBeUndefined();
  });
});
