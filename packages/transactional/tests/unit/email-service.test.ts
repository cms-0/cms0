import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearDefaultEmailService,
  createEmailService,
  getDefaultEmailService,
  setDefaultEmailService,
} from "../../src/client";

describe("@cms0/transactional email service", () => {
  afterEach(() => {
    clearDefaultEmailService();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("sends through the log transport with configured defaults", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const service = createEmailService({
      defaultFrom: "CMS0 <hello@cms0.local>",
      transport: { kind: "log" },
    });

    await expect(
      service.send({
        html: "<p>Hello</p>",
        subject: "Welcome",
        to: "user@example.com",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      provider: "log",
    });
    expect(info).toHaveBeenCalledWith(
      "[cms0/transactional:log]",
      expect.stringContaining("\"subject\": \"Welcome\""),
    );
  });

  it("stores and clears the default email service", () => {
    const service = createEmailService({
      defaultFrom: "hello@cms0.local",
      transport: { kind: "log" },
    });

    setDefaultEmailService(service);
    expect(getDefaultEmailService()).toBe(service);
    clearDefaultEmailService();
    expect(() => getDefaultEmailService()).toThrow(
      "Default email service has not been configured",
    );
  });

  it("sends Plunk email with the configured secret key", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          emails: [{ email: "email_123" }],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createEmailService({
      defaultFrom: { email: "hello@cms0.local", name: "cms0" },
      transport: {
        kind: "plunk",
        secretKey: "sk_test_key",
      },
    });

    await expect(
      service.send({
        html: "<p>Hello</p>",
        subject: "Welcome",
        to: "user@example.com",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      provider: "plunk",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://next-api.useplunk.com/v1/send",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer sk_test_key",
        }),
      }),
    );
  });

  it("sends Plunk addresses in the public API payload shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          emails: [{ email: "email_123" }],
        },
        success: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createEmailService({
      defaultFrom: { email: "hello@cms0.local", name: "cms0" },
      defaultReplyTo: { email: "reply@cms0.local", name: "Support" },
      transport: {
        kind: "plunk",
        secretKey: "sk_test_key",
      },
    });

    await service.send({
      headers: {
        "X-cms0-email-type": "invitation",
      },
      html: "<p>Hello</p>",
      subject: "Welcome",
      to: [
        "user@example.com",
        { email: "named@example.com", name: "Named User" },
      ],
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({
      body: "<p>Hello</p>",
      from: {
        email: "hello@cms0.local",
        name: "cms0",
      },
      headers: {
        "X-cms0-email-type": "invitation",
      },
      reply: "reply@cms0.local",
      subject: "Welcome",
      to: [
        "user@example.com",
        {
          email: "named@example.com",
          name: "Named User",
        },
      ],
    });
  });

  it("surfaces Plunk validation errors with details", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: async () => ({
        errors: [{ path: ["from"], message: "Invalid email address" }],
        message: "Request validation failed",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const service = createEmailService({
      defaultFrom: { email: "hello@cms0.local", name: "cms0" },
      transport: {
        kind: "plunk",
        secretKey: "sk_test_key",
      },
    });

    await expect(
      service.send({
        html: "<p>Hello</p>",
        subject: "Welcome",
        to: "user@example.com",
      }),
    ).rejects.toThrow(/Request validation failed.*Invalid email address/);
  });
});
