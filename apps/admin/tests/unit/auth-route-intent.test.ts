import { describe, expect, it } from "vitest";

import {
  invitationMatchesSessionEmail,
  isInvitationPath,
  normalizeRedirectTarget,
} from "@/lib/auth/route-intent";

describe("self-host auth route intent", () => {
  it("keeps the team invitation path as a valid redirect target", () => {
    const invitationPath = "/settings/team/accept-invitation/invite_123";

    expect(isInvitationPath(invitationPath)).toBe(true);
    expect(normalizeRedirectTarget(invitationPath)).toBe(invitationPath);
  });

  it("falls back to the dashboard for unsafe redirects", () => {
    expect(normalizeRedirectTarget("https://app.example.com/evil")).toBe(
      "/dashboard",
    );
    expect(normalizeRedirectTarget("//evil")).toBe("/dashboard");
  });

  it("matches invitation emails case-insensitively", () => {
    expect(
      invitationMatchesSessionEmail("Owner@Example.com", "owner@example.com"),
    ).toBe(true);
    expect(
      invitationMatchesSessionEmail("owner@example.com", "other@example.com"),
    ).toBe(false);
  });
});
