import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const originalEnv = { ...process.env };

describe("self-host email config", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("requires the email transport to be explicit", async () => {
    delete process.env.CMS0_EMAIL_TRANSPORT;

    const { resolveSelfHostedEmailTransportConfig } = await import(
      "@/lib/email/config"
    );

    expect(() => resolveSelfHostedEmailTransportConfig()).toThrow(
      "CMS0_EMAIL_TRANSPORT is required.",
    );
  });

  it("reads smtp transport settings", async () => {
    process.env.CMS0_EMAIL_TRANSPORT = "smtp";
    process.env.CMS0_EMAIL_SMTP_HOST = "smtp.example.com";
    process.env.CMS0_EMAIL_SMTP_PORT = "2525";
    process.env.CMS0_EMAIL_SMTP_SECURE = "true";
    process.env.CMS0_EMAIL_SMTP_USERNAME = "mailer";
    process.env.CMS0_EMAIL_SMTP_PASSWORD = "secret";

    const { resolveSelfHostedEmailTransportConfig } = await import(
      "@/lib/email/config"
    );

    expect(resolveSelfHostedEmailTransportConfig()).toEqual({
      host: "smtp.example.com",
      kind: "smtp",
      password: "secret",
      port: 2525,
      secure: true,
      username: "mailer",
    });
  });

  it("reads plunk transport settings", async () => {
    process.env.CMS0_EMAIL_TRANSPORT = "plunk";
    process.env.CMS0_EMAIL_PLUNK_SECRET_KEY = "sk_test_key";
    process.env.CMS0_EMAIL_PLUNK_BASE_URL = "https://mail.example.com";

    const { resolveSelfHostedEmailTransportConfig } = await import(
      "@/lib/email/config"
    );

    expect(resolveSelfHostedEmailTransportConfig()).toEqual({
      baseUrl: "https://mail.example.com",
      kind: "plunk",
      secretKey: "sk_test_key",
    });
  });

  it("requires a Plunk secret key", async () => {
    process.env.CMS0_EMAIL_TRANSPORT = "plunk";
    process.env.CMS0_EMAIL_PLUNK_SECRET_KEY = "invalid";

    const { resolveSelfHostedEmailTransportConfig } = await import(
      "@/lib/email/config"
    );

    expect(() => resolveSelfHostedEmailTransportConfig()).toThrow(
      'CMS0_EMAIL_PLUNK_SECRET_KEY must start with "sk_".',
    );
  });
});
