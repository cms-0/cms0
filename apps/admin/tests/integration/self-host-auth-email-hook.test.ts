import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn(),
  createOrganization: vi.fn(),
  getSelfHostedEmailService: vi.fn(),
  organization: vi.fn(),
  sendTeamInvite: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("better-auth", () => ({
  betterAuth: mocks.betterAuth,
}));

vi.mock("better-auth/plugins", () => ({
  admin: () => ({ kind: "admin" }),
  apiKey: () => ({ kind: "apiKey" }),
  bearer: () => ({ kind: "bearer" }),
  openAPI: () => ({ kind: "openAPI" }),
  organization: mocks.organization,
}));

vi.mock("better-auth/next-js", () => ({
  nextCookies: () => ({ kind: "nextCookies" }),
}));

vi.mock("@cms0/auth", () => ({
  ac: {},
  apiKeyDefaultPermissions: {},
  ensureSessionDefaults: vi.fn(),
  organizationRoles: {},
}));

vi.mock("@cms0/transactional", () => ({
  sendTeamInvite: mocks.sendTeamInvite,
}));

vi.mock("@/lib/email/service", () => ({
  getSelfHostedEmailService: mocks.getSelfHostedEmailService,
}));

const originalEnv = { ...process.env };

describe("self-host auth invitation email hook", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      BETTER_AUTH_SECRET: "secret",
      BETTER_AUTH_URL: "http://localhost:4002",
      CMS0_PUBLIC_APP_URL: "http://localhost:4002",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/cms0_test",
      PORT: "4002",
      TRUSTED_ORIGINS: "http://localhost:4002",
    };
    mocks.betterAuth.mockReset();
    mocks.createOrganization.mockReset();
    mocks.getSelfHostedEmailService.mockReset();
    mocks.organization.mockReset();
    mocks.sendTeamInvite.mockReset();

    mocks.betterAuth.mockImplementation(() => ({
      api: {
        createOrganization: mocks.createOrganization,
      },
    }));
    mocks.organization.mockImplementation((options) => options);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("routes Better Auth team invitations through the shared email service", async () => {
    const service = { send: vi.fn() };
    mocks.getSelfHostedEmailService.mockReturnValue(service);

    const { createSelfHostedAuth } = await import("@/lib/auth/create-auth");

    createSelfHostedAuth({} as never);

    const organizationOptions = mocks.organization.mock.calls[0]?.[0] as {
      sendInvitationEmail: (input: {
        id: string;
        invitation: { email: string };
      }) => Promise<void>;
    };

    await organizationOptions.sendInvitationEmail({
      id: "invite_123",
      invitation: {
        email: "owner@example.com",
      },
    });

    expect(mocks.getSelfHostedEmailService).toHaveBeenCalledTimes(1);
    expect(mocks.sendTeamInvite).toHaveBeenCalledWith(
      "owner@example.com",
      expect.objectContaining({
        inviteUrl:
          "http://localhost:4002/settings/team/accept-invitation/invite_123",
        recipientEmail: "owner@example.com",
      }),
      {
        service,
      },
    );
  });
});
