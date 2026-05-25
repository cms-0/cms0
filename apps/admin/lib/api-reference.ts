import { buildOpenApiSpec, type ApiDocsConfig } from "@cms0/api-docs";

export interface DescriptorLike {
  collections?: Record<string, unknown>;
  singletons?: Record<string, unknown>;
  roots?: Record<string, unknown>;
}

export function createSelfHostedApiReference(descriptor?: DescriptorLike) {
  const config: ApiDocsConfig = {
    includeAuth: true,
    info: {
      title: "cms0 Self-Hosted Admin API",
      version: "1.0.0",
      description:
        "Complete API reference for self-hosted cms0 including virtual server operations and authentication.",
    },
    servers: [
      { url: "/api/content", description: "Virtual server base path" },
      { url: "/api/auth", description: "Better Auth endpoints" },
    ],
  };

  return {
    spec: buildOpenApiSpec({ config, descriptor }),
  };
}
