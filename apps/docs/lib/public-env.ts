function readOptionalPublicEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readRequiredPublicEnv(name: string): string {
  const value = readOptionalPublicEnv(name);
  if (value) return value;
  throw new Error(`${name} is required.`);
}

export function readPublicBooleanEnv(name: string): boolean {
  const value = readRequiredPublicEnv(name).toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(value)) {
    return false;
  }
  throw new Error(`${name} must be a boolean value.`);
}

function readOptionalPublicBooleanEnv(name: string, fallback: boolean): boolean {
  if (!readOptionalPublicEnv(name)) {
    return fallback;
  }
  return readPublicBooleanEnv(name);
}

function readOptionalUrl(name: string): string | undefined {
  const value = readOptionalPublicEnv(name);
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".localhost")
  );
}

export function getPublicAppUrl() {
  return readOptionalUrl("CMS0_PUBLIC_APP_URL") ?? "http://localhost:3001";
}

export function getBaseDomain() {
  const value = readOptionalPublicEnv("CMS0_BASE_DOMAIN");
  if (value) {
    return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  }

  return new URL(getPublicAppUrl()).host;
}

export function isPublicEnvPathRuntimeEnabled() {
  return readOptionalPublicBooleanEnv(
    "CMS0_PUBLIC_ENV_PATH_RUNTIME_ENABLED",
    true,
  );
}

export function isPublicEnvSubdomainRuntimeEnabled() {
  return readOptionalPublicBooleanEnv(
    "CMS0_PUBLIC_ENV_SUBDOMAIN_RUNTIME_ENABLED",
    true,
  );
}

export type EnvironmentRuntimeCapabilities = {
  publicPathRuntimeEnabled: boolean;
  publicSubdomainRuntimeEnabled: boolean;
};

export function getEnvironmentRuntimeCapabilities(): EnvironmentRuntimeCapabilities {
  return {
    publicPathRuntimeEnabled: isPublicEnvPathRuntimeEnabled(),
    publicSubdomainRuntimeEnabled: isPublicEnvSubdomainRuntimeEnabled(),
  };
}

function getHostedEnvironmentSubdomainOrigin(environmentKey: string) {
  const appUrl = new URL(getPublicAppUrl());
  const baseDomain = getBaseDomain();
  const hostname = baseDomain.split(":")[0]?.toLowerCase() ?? "";
  const protocol = isLocalHost(hostname) ? appUrl.protocol : "https:";
  return `${protocol}//${environmentKey}.${baseDomain}`;
}

export function getHostedEnvironmentEndpointExamples(
  environmentKey = "environment-key",
) {
  const endpoints: string[] = [];
  const capabilities = getEnvironmentRuntimeCapabilities();

  if (capabilities.publicSubdomainRuntimeEnabled) {
    endpoints.push(`${getHostedEnvironmentSubdomainOrigin(environmentKey)}/api`);
  }

  if (capabilities.publicPathRuntimeEnabled) {
    endpoints.push(
      `${getPublicAppUrl()}/api/content/${encodeURIComponent(environmentKey)}`,
    );
  }

  return endpoints;
}
