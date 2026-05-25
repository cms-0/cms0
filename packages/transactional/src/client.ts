import type {
  EmailAddressLike,
  EmailMessage,
  EmailSendResult,
  EmailService,
  EmailServiceConfig,
  EmailTransport,
} from "./types.js";
import type {
  EmailAddress,
  EmailTransportConfig,
} from "@cms0/shared";
import type { Transporter } from "nodemailer";

const DEFAULT_PLUNK_API_BASE_URL = "https://next-api.useplunk.com";
type NodemailerModule = typeof import("nodemailer") & {
  default?: typeof import("nodemailer");
};
type PlunkAddress =
  | string
  | {
      email: string;
      name?: string;
    };
type PlunkSendResponse = {
  data?: {
    emails?: Array<{ email?: string }>;
  };
  error?: string | { message?: string };
  errors?: unknown;
  message?: string;
  success?: boolean;
};

const importNodemailer = new Function(
  "return import('nodemailer')",
) as () => Promise<NodemailerModule>;

const normalizeAddress = (value: EmailAddressLike | undefined) => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  return value.name?.trim()
    ? `${value.name.trim()} <${value.email}>`
    : value.email;
};

const normalizeRecipients = (value: EmailMessage["to"]) =>
  Array.isArray(value)
    ? value
        .map((entry) => normalizeAddress(entry))
        .filter((entry): entry is string => Boolean(entry))
    : ensureEmailAddress(value, "Recipient");

const ensureEmailAddress = (value: EmailAddressLike | undefined, label: string) => {
  if (!value) {
    throw new Error(`${label} email address is required.`);
  }

  return normalizeAddress(value);
};

const stringifyRecipients = (value: EmailMessage["to"]) => {
  const normalized = normalizeRecipients(value);
  return Array.isArray(normalized) ? normalized.join(", ") : normalized;
};

const normalizePlunkAddress = (
  value: EmailAddressLike | undefined,
): PlunkAddress | undefined => {
  if (!value) {
    return undefined;
  }

  if (typeof value === "string") {
    return value;
  }

  const name = value.name?.trim();
  return name ? { email: value.email, name } : value.email;
};

const ensurePlunkAddress = (
  value: EmailAddressLike | undefined,
  label: string,
) => {
  const normalized = normalizePlunkAddress(value);
  if (!normalized) {
    throw new Error(`${label} email address is required.`);
  }

  return normalized;
};

const normalizePlunkRecipients = (value: EmailMessage["to"]) =>
  Array.isArray(value)
    ? value
        .map((entry) => normalizePlunkAddress(entry))
        .filter((entry): entry is PlunkAddress => Boolean(entry))
    : ensurePlunkAddress(value, "Recipient");

const normalizePlunkReplyAddress = (value: EmailAddressLike | undefined) => {
  if (!value) {
    return undefined;
  }

  return typeof value === "string" ? value : value.email;
};

const getPlunkErrorMessage = (
  response: Response,
  payload: PlunkSendResponse | null,
) => {
  const baseMessage =
    (typeof payload?.message === "string" && payload.message.trim()) ||
    (typeof payload?.error === "string" && payload.error.trim()) ||
    (typeof payload?.error === "object" &&
      payload.error?.message?.trim()) ||
    `Failed to send email via Plunk: ${response.status} ${response.statusText}`;

  if (!payload?.errors) {
    return baseMessage;
  }

  return `${baseMessage}: ${JSON.stringify(payload.errors)}`;
};

const createLogEmailTransport = (): EmailTransport => ({
  kind: "log",
  async send(message) {
    console.info(
      "[cms0/transactional:log]",
      JSON.stringify(
        {
          from: normalizeAddress(message.from),
          provider: "log",
          subject: message.subject,
          to: stringifyRecipients(message.to),
        },
        null,
        2,
      ),
    );

    return {
      accepted: true,
      messageId: null,
      provider: "log",
    };
  },
});

const createSmtpEmailTransport = (
  config: Extract<EmailTransportConfig, { kind: "smtp" }>,
): EmailTransport => {
  let transporter: Transporter | null = null;
  const getTransporter = async () => {
    if (!transporter) {
      const nodemailer = await importNodemailer();
      const createTransport =
        nodemailer.default?.createTransport ?? nodemailer.createTransport;
      const nextTransporter = createTransport({
        auth:
          config.username || config.password
            ? {
                pass: config.password ?? undefined,
                user: config.username ?? undefined,
              }
            : undefined,
        host: config.host,
        port: config.port,
        secure: config.secure,
      });
      transporter = nextTransporter;
      return nextTransporter;
    }

    return transporter;
  };

  return {
    kind: "smtp",
    async send(message) {
      const activeTransporter = await getTransporter();
      const info = (await activeTransporter.sendMail({
        attachments: message.attachments,
        from: ensureEmailAddress(message.from, "Sender"),
        headers: message.headers,
        html: message.html,
        replyTo: normalizeAddress(message.replyTo),
        subject: message.subject,
        text: message.text,
        to: normalizeRecipients(message.to),
      })) as {
        accepted?: unknown[];
        messageId?: string;
      };

      return {
        accepted: Boolean(info.accepted?.length ?? 0),
        messageId: info.messageId ?? null,
        provider: "smtp",
      };
    },
  };
};

const createPlunkEmailTransport = (
  config: Extract<EmailTransportConfig, { kind: "plunk" }>,
): EmailTransport => ({
  kind: "plunk",
  async send(message) {
    const response = await fetch(
      `${config.baseUrl ?? DEFAULT_PLUNK_API_BASE_URL}/v1/send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body: message.html,
          from: normalizePlunkAddress(message.from),
          headers: message.headers,
          reply: normalizePlunkReplyAddress(message.replyTo),
          subject: message.subject,
          to: normalizePlunkRecipients(message.to),
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as
      | PlunkSendResponse
      | null;

    if (!response.ok || payload?.success === false) {
      throw new Error(getPlunkErrorMessage(response, payload));
    }

    return {
      accepted: Boolean(payload?.data?.emails?.length ?? 0),
      messageId: null,
      provider: "plunk",
    };
  },
});

export const createEmailTransport = (
  config: EmailTransportConfig,
): EmailTransport => {
  switch (config.kind) {
    case "log":
      return createLogEmailTransport();
    case "smtp":
      return createSmtpEmailTransport(config);
    case "plunk":
      return createPlunkEmailTransport(config);
  }

  throw new Error("Unsupported email transport configuration.");
};

export const createEmailService = (
  config: EmailServiceConfig,
): EmailService => {
  const transport = createEmailTransport(config.transport);

  return {
    send(message) {
      return transport.send({
        ...message,
        from: message.from ?? config.defaultFrom,
        replyTo: message.replyTo ?? config.defaultReplyTo,
      });
    },
  };
};

let defaultEmailService: EmailService | null = null;

export const getDefaultEmailService = () => {
  if (!defaultEmailService) {
    throw new Error(
      "Default email service has not been configured for @cms0/transactional.",
    );
  }

  return defaultEmailService;
};

export const setDefaultEmailService = (service: EmailService) => {
  defaultEmailService = service;
};

export const clearDefaultEmailService = () => {
  defaultEmailService = null;
};
