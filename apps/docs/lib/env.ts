import "server-only";

export {
  getBaseDomain,
  getEnvironmentRuntimeCapabilities,
  getHostedEnvironmentEndpointExamples,
  getPublicAppUrl,
  isPublicEnvPathRuntimeEnabled,
  isPublicEnvSubdomainRuntimeEnabled,
  readPublicBooleanEnv,
} from "./public-env";

export function readOptionalEnv(name: string): string | undefined {
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

export function getEnvironment() {
  return readRequiredEnv("ENVIRONMENT");
}

export function isProductionEnvironment() {
  return getEnvironment() === "production";
}

export function getDocsRepositoryBase() {
  return readOptionalEnv("DOCS_REPOSITORY_BASE");
}

export function getProjectRepositoryLink() {
  return readOptionalUrl("PROJECT_REPOSITORY_LINK");
}

export function getDocsPublicUrl() {
  const explicitUrl = readOptionalUrl("CMS0_DOCS_PUBLIC_URL");
  if (explicitUrl) {
    return explicitUrl;
  }

  const port = readOptionalEnv("PORT") ?? "3008";
  return `http://localhost:${port}`;
}

export function getDocsBasePath() {
  const value = readOptionalEnv("CMS0_DOCS_BASE_PATH");
  if (!value || value === "/") {
    return "";
  }

  const normalized = `/${value.replace(/^\/+/, "").replace(/\/+$/, "")}`;
  if (normalized.includes("//")) {
    throw new Error("CMS0_DOCS_BASE_PATH must be a valid path prefix.");
  }

  return normalized;
}
