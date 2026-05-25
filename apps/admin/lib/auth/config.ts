import {
  getBetterAuthSecret,
  getBetterAuthUrl,
  getDatabaseUrl,
  getPublicAppUrl,
  getTrustedOrigins,
  readOptionalEnv,
} from "@/lib/env";

type GoogleProviderConfig = {
  clientId: string;
  clientSecret: string;
  disableImplicitSignUp: boolean;
};

export const getSelfHostedGoogleProviderConfig =
  (): GoogleProviderConfig | null => {
    const clientId = readOptionalEnv("GOOGLE_CLIENT_ID") ?? "";
    const clientSecret = readOptionalEnv("GOOGLE_CLIENT_SECRET") ?? "";

    if (!clientId || !clientSecret) {
      return null;
    }

    return {
      clientId,
      clientSecret,
      disableImplicitSignUp: true,
    };
  };

export const getSelfHostedAuthConfig = () => {
  const baseUrl = getBetterAuthUrl();
  const trustedOrigins = Array.from(
    new Set(
      [
        ...getTrustedOrigins(),
        baseUrl,
        getPublicAppUrl(),
      ].filter((value): value is string => Boolean(value)),
    ),
  );

  return {
    appName: "cms0 Admin",
    basePath: "/api/auth",
    baseUrl,
    databaseUrl: getDatabaseUrl(),
    secret: getBetterAuthSecret(),
    trustedOrigins,
  };
};
