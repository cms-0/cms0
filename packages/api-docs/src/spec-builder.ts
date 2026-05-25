/**
 * Spec Builder
 *
 * Assembles complete OpenAPI spec from generators.
 */

import type { SpecBuilderOptions, OpenApiSpec } from "./types";
import { generateStaticOperations } from "./generators/static-operations";
import { generateDynamicRoutes } from "./generators/dynamic-routes";
import {
  generateBetterAuthPaths,
  getBetterAuthComponents,
} from "./generators/better-auth";

export function buildOpenApiSpec(options: SpecBuilderOptions): OpenApiSpec {
  const { config, descriptor } = options;

  // Start with static operations
  const paths = generateStaticOperations();

  // Add dynamic routes if descriptor available
  if (descriptor) {
    const dynamicPaths = generateDynamicRoutes(descriptor);
    Object.assign(paths, dynamicPaths);
  }

  // Add better-auth endpoints for self-hosted
  if (config.includeAuth) {
    const authPaths = generateBetterAuthPaths();
    Object.assign(paths, authPaths);
  }

  // Build components
  const components: OpenApiSpec["components"] = {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "API key or Better Auth session token",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "x-api-key",
        description: "Runtime API key for environment access",
      },
    },
  };

  // Add better-auth specific components
  if (config.includeAuth) {
    const authComponents = getBetterAuthComponents();
    Object.assign(
      components.securitySchemes!,
      authComponents.securitySchemes!,
    );
  }

  return {
    openapi: "3.0.3",
    info: config.info,
    servers: config.servers,
    paths,
    components,
  };
}
