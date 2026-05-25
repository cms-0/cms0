import "server-only";

import type { EmailTransportConfig } from "@cms0/shared";
import type { EmailServiceConfig } from "@cms0/transactional";
import {
  readBooleanEnv,
  readOptionalEnv,
  readPositiveIntegerEnv,
  readRequiredEnv,
} from "@/lib/env";

const readAddress = (email: string | undefined, name: string | undefined) => {
  const normalizedEmail = email?.trim();

  if (!normalizedEmail) {
    return undefined;
  }

  const normalizedName = name?.trim();
  return normalizedName
    ? { email: normalizedEmail, name: normalizedName }
    : normalizedEmail;
};

const readPlunkSecretKey = () => {
  const secretKey = readRequiredEnv("CMS0_EMAIL_PLUNK_SECRET_KEY");
  if (!secretKey.startsWith("sk_")) {
    throw new Error('CMS0_EMAIL_PLUNK_SECRET_KEY must start with "sk_".');
  }

  return secretKey;
};

export const resolveSelfHostedEmailTransportConfig = (): EmailTransportConfig => {
  const transport = readRequiredEnv("CMS0_EMAIL_TRANSPORT").toLowerCase();

  switch (transport) {
    case "log":
      return { kind: "log" };
    case "smtp":
      return {
        host: readRequiredEnv("CMS0_EMAIL_SMTP_HOST"),
        kind: "smtp",
        password: readOptionalEnv("CMS0_EMAIL_SMTP_PASSWORD"),
        port: readPositiveIntegerEnv("CMS0_EMAIL_SMTP_PORT"),
        secure: readBooleanEnv("CMS0_EMAIL_SMTP_SECURE"),
        username: readOptionalEnv("CMS0_EMAIL_SMTP_USERNAME"),
      };
    case "plunk":
      return {
        baseUrl: readOptionalEnv("CMS0_EMAIL_PLUNK_BASE_URL"),
        kind: "plunk",
        secretKey: readPlunkSecretKey(),
      };
    default:
      throw new Error(
        "CMS0_EMAIL_TRANSPORT must be one of 'log', 'smtp', or 'plunk'.",
      );
  }
};

export const resolveSelfHostedEmailServiceConfig = (): EmailServiceConfig => ({
  defaultFrom: readAddress(
    readRequiredEnv("CMS0_EMAIL_FROM"),
    readOptionalEnv("CMS0_EMAIL_FROM_NAME"),
  ),
  defaultReplyTo: readAddress(
    readOptionalEnv("CMS0_EMAIL_REPLY_TO"),
    readOptionalEnv("CMS0_EMAIL_REPLY_TO_NAME"),
  ),
  transport: resolveSelfHostedEmailTransportConfig(),
});
