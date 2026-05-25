/**
 * API Documentation Package
 *
 * OpenAPI spec generation and modern UI rendering for cms0.
 */

export { buildOpenApiSpec } from "./spec-builder";
export { renderScalarUIHtml } from "./ui/scalar-ui";

export type {
  ApiDocsConfig,
  OpenApiSpec,
  OpenApiPathItem,
  OpenApiOperation,
  SpecBuilderOptions,
} from "./types";
