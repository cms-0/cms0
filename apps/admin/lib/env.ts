import "server-only";

import type { StorageProviderConfig } from "@cms0/shared";

type StorageDriver = "filesystem" | "s3";

const DEPRECATED_ENV_VARS = {
  CMS0_STORAGE_PUBLIC_BASE_URL: "CMS0_ASSET_BASE_URL",
} as const;

function assertNoDeprecatedEnvVars() {
  for (const [name, replacement] of Object.entries(DEPRECATED_ENV_VARS)) {
    if (Object.prototype.hasOwnProperty.call(process.env, name)) {
      throw new Error(`${name} has been removed. Use ${replacement} instead.`);
    }
  }
}

export function readOptionalEnv(name: string): string | undefined {
  assertNoDeprecatedEnvVars();
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function readRequiredEnv(name: string): string {
  const value = readOptionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function readBooleanEnv(name: string): boolean {
  const value = readRequiredEnv(name).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  throw new Error(`${name} must be a boolean value.`);
}

export function readPositiveIntegerEnv(name: string): number {
  const value = Number.parseInt(readRequiredEnv(name), 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function readOptionalUrl(name: string): string | undefined {
  const value = readOptionalEnv(name);
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

function readRequiredUrl(name: string): string {
  const value = readOptionalUrl(name);
  if (!value) {
    throw new Error(`${name} is required and must be a valid URL.`);
  }
  return value;
}

function readStorageDriver(name: string): StorageDriver {
  const value = readRequiredEnv(name);
  if (value === "filesystem" || value === "s3") {
    return value;
  }
  throw new Error(`${name} must be "filesystem" or "s3".`);
}

export function getDatabaseUrl() {
  return readRequiredEnv("DATABASE_URL");
}

export function getPublicAppUrl() {
  return readRequiredUrl("CMS0_PUBLIC_APP_URL");
}

export function getPublicDocsBaseUrl() {
  return readOptionalUrl("NEXT_PUBLIC_CMS0_DOCS_BASE_URL") ?? "http://localhost:3008";
}

export function getAppAssetBaseUrl() {
  return readRequiredUrl("CMS0_ASSET_BASE_URL");
}

export function getBetterAuthUrl() {
  return readRequiredUrl("BETTER_AUTH_URL");
}

export function getBetterAuthSecret() {
  return readRequiredEnv("BETTER_AUTH_SECRET");
}

export function getTrustedOrigins() {
  return readRequiredEnv("TRUSTED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getManualTriggerFullExecute() {
  const value = readOptionalEnv("CMS0_MANUAL_TRIGGER_FULL_EXECUTE");
  if (!value) {
    return false;
  }

  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("CMS0_MANUAL_TRIGGER_FULL_EXECUTE must be a boolean value.");
}

export function getSelfHostedStorageProviderConfig(): StorageProviderConfig {
  const driver = readStorageDriver("CMS0_STORAGE_DRIVER");

  if (driver === "filesystem") {
    return {
      kind: "filesystem",
      rootPath: readRequiredEnv("CMS0_STORAGE_PATH"),
    };
  }

  return {
    accessKeyId: readRequiredEnv("CMS0_STORAGE_ACCESS_KEY_ID"),
    bucket: readRequiredEnv("CMS0_STORAGE_BUCKET"),
    endpoint: readOptionalUrl("CMS0_STORAGE_ENDPOINT"),
    forcePathStyle: readBooleanEnv("CMS0_STORAGE_FORCE_PATH_STYLE"),
    kind: "s3",
    prefix: readOptionalEnv("CMS0_STORAGE_PREFIX"),
    region: readRequiredEnv("CMS0_STORAGE_REGION"),
    secretAccessKey: readRequiredEnv("CMS0_STORAGE_SECRET_ACCESS_KEY"),
  };
}
