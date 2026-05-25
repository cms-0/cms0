import type { NextConfig } from "next";

const nodeOnlyExternals = new Set([
  "node-pty",
  "nodemailer",
  "pg",
  "pg-connection-string",
  "pg-native",
  "pgpass",
]);

const nextConfig: NextConfig = {
  serverExternalPackages: Array.from(nodeOnlyExternals),
  typedRoutes: true,
  webpack(config, { isServer }) {
    if (!isServer) return config;

    const externalNodeOnlyPackage = (
      { request }: { request?: string },
      callback: (error?: Error | null, result?: string) => void,
    ) => {
      if (
        request &&
        (nodeOnlyExternals.has(request) || request.startsWith("node:"))
      ) {
        callback(null, `commonjs ${request}`);
        return;
      }

      callback();
    };

    config.externals = [
      ...(Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : []),
      externalNodeOnlyPackage,
    ];

    return config;
  },
};

export default nextConfig;
