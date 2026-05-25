/**
 * Dynamic Routes Generator
 *
 * Generates OpenAPI specs for schema-derived content routes.
 */

import type { OpenApiPathItem, OpenApiOperation } from "../types";

export function generateDynamicRoutes(
  descriptor: {
    collections?: Record<string, unknown>;
    singletons?: Record<string, unknown>;
    roots?: Record<string, unknown>;
  },
): Record<string, OpenApiPathItem> {
  const paths: Record<string, OpenApiPathItem> = {};

  // Generate collection routes
  for (const [collectionName] of Object.entries(descriptor.collections ?? {})) {
    const basePath = `/api/content/${collectionName}`;
    const schemaRef = `#/components/schemas/${collectionName}`;

    // List endpoint: GET /{collection}
    paths[basePath] = {
      get: generateListOperation(collectionName, schemaRef),
      post: generateCreateOperation(collectionName, schemaRef),
    };

    // Detail endpoint: GET /{collection}/{id}
    paths[`${basePath}/{id}`] = {
      get: generateGetOperation(collectionName, schemaRef),
      put: generateUpdateOperation(collectionName, schemaRef),
      patch: generatePatchOperation(collectionName, schemaRef),
      delete: generateDeleteOperation(collectionName),
    };
  }

  // Generate singleton routes
  for (const [singletonName] of Object.entries(descriptor.singletons ?? {})) {
    const basePath = `/api/content/${singletonName}`;
    const schemaRef = `#/components/schemas/${singletonName}`;

    paths[basePath] = {
      get: generateSingletonGetOperation(singletonName, schemaRef),
      put: generateSingletonUpdateOperation(singletonName, schemaRef),
    };
  }

  // Generate graph query routes
  for (const rootName of Object.keys(descriptor.roots ?? {})) {
    const graphPath = `/api/content/graph/${rootName}`;
    paths[graphPath] = {
      get: generateGraphQueryOperation(rootName),
    };
  }

  return paths;
}

function generateListOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `list${capitalize(name)}`,
    summary: `List ${name}`,
    description: `Returns a paginated list of ${name} items.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "page",
        in: "query",
        schema: { type: "integer", default: 1 },
        description: "Page number for pagination",
      },
      {
        name: "pageSize",
        in: "query",
        schema: { type: "integer", default: 20 },
        description: "Number of items per page",
      },
      {
        name: "search",
        in: "query",
        schema: { type: "string" },
        description: "Search query string",
      },
      {
        name: "filters",
        in: "query",
        schema: { type: "object" },
        description: "Field filters as JSON object",
      },
    ],
    responses: {
      "200": {
        description: `List of ${name} items`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: {
                  type: "array",
                  items: { $ref: schemaRef },
                },
                pagination: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    pageSize: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

function generateCreateOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `create${capitalize(name)}`,
    summary: `Create ${name}`,
    description: `Creates a new ${name} item.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: schemaRef },
        },
      },
    },
    responses: {
      "201": {
        description: `${name} created`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
    },
  };
}

function generateGetOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `get${capitalize(name)}ById`,
    summary: `Get ${name} by ID`,
    description: `Returns a specific ${name} item by ID.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `${name} ID`,
      },
    ],
    responses: {
      "200": {
        description: `${name} item`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
      "404": {
        description: `${name} not found`,
      },
    },
  };
}

function generateUpdateOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `update${capitalize(name)}`,
    summary: `Update ${name}`,
    description: `Updates a ${name} item by ID.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `${name} ID`,
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: schemaRef },
        },
      },
    },
    responses: {
      "200": {
        description: `${name} updated`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
      "404": {
        description: `${name} not found`,
      },
    },
  };
}

function generatePatchOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `patch${capitalize(name)}`,
    summary: `Partial update ${name}`,
    description: `Partially updates a ${name} item by ID.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `${name} ID`,
      },
    ],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: schemaRef },
        },
      },
    },
    responses: {
      "200": {
        description: `${name} patched`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
      "404": {
        description: `${name} not found`,
      },
    },
  };
}

function generateDeleteOperation(name: string): OpenApiOperation {
  return {
    operationId: `delete${capitalize(name)}`,
    summary: `Delete ${name}`,
    description: `Deletes a ${name} item by ID.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string" },
        description: `${name} ID`,
      },
    ],
    responses: {
      "204": {
        description: `${name} deleted`,
      },
      "404": {
        description: `${name} not found`,
      },
    },
  };
}

function generateSingletonGetOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `get${capitalize(name)}`,
    summary: `Get ${name}`,
    description: `Returns the ${name} singleton.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    responses: {
      "200": {
        description: `${name} singleton`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
    },
  };
}

function generateSingletonUpdateOperation(
  name: string,
  schemaRef: string,
): OpenApiOperation {
  return {
    operationId: `update${capitalize(name)}`,
    summary: `Update ${name}`,
    description: `Updates the ${name} singleton.`,
    tags: ["Content", capitalize(name)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    requestBody: {
      required: true,
      content: {
        "application/json": {
          schema: { $ref: schemaRef },
        },
      },
    },
    responses: {
      "200": {
        description: `${name} updated`,
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { $ref: schemaRef },
              },
            },
          },
        },
      },
    },
  };
}

function generateGraphQueryOperation(rootName: string): OpenApiOperation {
  return {
    operationId: `query${capitalize(rootName)}Graph`,
    summary: `Query ${rootName} graph`,
    description: `Graph query for ${rootName} with relation resolution.`,
    tags: ["Graph", capitalize(rootName)],
    security: [{ bearerAuth: [] }, { apiKey: [] }],
    parameters: [
      {
        name: "depth",
        in: "query",
        schema: { type: "integer", default: 2 },
        description: "Maximum relation depth to resolve",
      },
      {
        name: "fields",
        in: "query",
        schema: { type: "array", items: { type: "string" } },
        description: "Fields to include",
      },
    ],
    responses: {
      "200": {
        description: "Graph query result",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                data: { type: "object" },
              },
            },
          },
        },
      },
    },
  };
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
