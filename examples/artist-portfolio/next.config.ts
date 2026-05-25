import type { NextConfig } from "next";

function parseAssetBaseUrl() {
  const value =
    process.env.CMS0_ASSET_BASE_URL ??
    process.env.CMS0_ENV_ASSET_BASE_URL ??
    process.env.CMS0_API_BASE_URL;

  if (!value) return undefined;

  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

const cms0AssetBaseUrl = parseAssetBaseUrl();

const nextConfig: NextConfig = {
  images: {
    dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
    remotePatterns: cms0AssetBaseUrl
      ? [
          {
            protocol: cms0AssetBaseUrl.protocol.replace(":", "") as
              | "http"
              | "https",
            hostname: cms0AssetBaseUrl.hostname,
            port: cms0AssetBaseUrl.port,
            pathname: "/assets/**",
          },
          {
            protocol: cms0AssetBaseUrl.protocol.replace(":", "") as
              | "http"
              | "https",
            hostname: cms0AssetBaseUrl.hostname,
            port: cms0AssetBaseUrl.port,
            pathname: "/uploads/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
