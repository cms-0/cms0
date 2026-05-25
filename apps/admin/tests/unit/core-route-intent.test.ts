import { describe, expect, it } from "vitest";

import {
  buildAuthRedirectPath,
  invitationMatchesSessionEmail,
  matchesRedirectPattern,
  normalizeRedirectTarget,
} from "@/lib/auth/route-intent";

describe("core route intent helpers", () => {
  it("normalizes safe redirects and rejects unsafe targets", () => {
    expect(normalizeRedirectTarget("/settings/team")).toBe("/settings/team");
    expect(normalizeRedirectTarget("https://app.example.com/evil")).toBe(
      "/dashboard",
    );
    expect(normalizeRedirectTarget("//evil")).toBe("/dashboard");
  });

  it("matches team invitation redirects and builds auth URLs", () => {
    const invitationPath = "/settings/team/accept-invitation/invite_123";

    expect(
      matchesRedirectPattern(invitationPath, [
        "/settings/team/accept-invitation/",
      ]),
    ).toBe(true);
    expect(buildAuthRedirectPath("/login", invitationPath)).toBe(
      `/login?redirect=${encodeURIComponent(invitationPath)}`,
    );
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
