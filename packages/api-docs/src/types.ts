/**
 * API Documentation Types
 *
 * Type definitions for OpenAPI spec generation and UI rendering.
 */

export type ApiDocsConfig = {
  /** Include better-auth endpoints (self-hosted only) */
  includeAuth: boolean;
  /** OpenAPI info */
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{
    url: string;
    description: string;
  }>;
};

export type OpenApiPathItem = {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  patch?: OpenApiOperation;
  delete?: OpenApiOperation;
};

export type OpenApiOperation = {
  operationId: string;
  summary: string;
  description: string;
  tags: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Array<{
    name: string;
    in: "query" | "path" | "header";
    required?: boolean;
    schema: unknown;
    description?: string;
  }>;
  requestBody?: {
    required?: boolean;
    content: Record<string, { schema: unknown }>;
  };
  responses: Record<
    string,
    {
      description: string;
      content?: Record<string, { schema: unknown }>;
    }
  >;
};

export type OpenApiSpec = {
  openapi: "3.0.3";
  info: {
    title: string;
    version: string;
    description: string;
  };
  servers: Array<{ url: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
};

export interface SpecBuilderOptions {
  config: ApiDocsConfig;
  descriptor?: {
    collections?: Record<string, unknown>;
    singletons?: Record<string, unknown>;
    roots?: Record<string, unknown>;
  };
}
