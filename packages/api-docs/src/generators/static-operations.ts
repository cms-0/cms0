/**
 * Static Operations Generator
 *
 * Generates OpenAPI specs for admin server static operations.
 */

import type { OpenApiPathItem } from "../types";

export function generateStaticOperations(): Record<string, OpenApiPathItem> {
  return {
    "/api/content": {
      get: {
        operationId: "getRuntimeOverview",
        summary: "Get runtime overview",
        description: "Returns the bound target, latest snapshot summary, and runtime route map.",
        tags: ["Runtime"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Runtime overview payload",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    target: {
                      type: "object",
                      properties: {
                        descriptorVersion: { type: "string" },
                        environmentKey: { type: "string" },
                      },
                    },
                    snapshot: { type: ["object", "null"] },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/content/health": {
      get: {
        operationId: "checkRuntimeHealth",
        summary: "Check runtime health",
        description: "Confirms the runtime is alive and reports the active descriptor version.",
        tags: ["Runtime"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Health status",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    status: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/content/latest-snapshot": {
      get: {
        operationId: "getLatestSnapshot",
        summary: "Get latest schema snapshot",
        description: "Returns the most recent published schema descriptor and checksum.",
        tags: ["Schema"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Latest snapshot",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    checksum: { type: "string" },
                    descriptor: { type: "object" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/content/backups": {
      get: {
        operationId: "listBackups",
        summary: "List backups",
        description: "Returns all backups for the current environment.",
        tags: ["Backups"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "List of backups",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    backups: {
                      type: "array",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createBackup",
        summary: "Create backup",
        description: "Creates a new backup of the current environment.",
        tags: ["Backups"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  reason: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Backup created",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/content/backups/{backupId}": {
      get: {
        operationId: "getBackup",
        summary: "Get backup",
        description: "Returns a specific backup by ID.",
        tags: ["Backups"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "backupId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Backup details",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
      delete: {
        operationId: "deleteBackup",
        summary: "Delete backup",
        description: "Deletes a specific backup by ID.",
        tags: ["Backups"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "backupId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "204": {
            description: "Backup deleted",
          },
        },
      },
    },
    "/api/content/backups/{backupId}/restore": {
      post: {
        operationId: "restoreBackup",
        summary: "Restore backup",
        description: "Restores the environment from a backup.",
        tags: ["Backups"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "backupId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Backup restored",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/content/api-keys": {
      get: {
        operationId: "listApiKeys",
        summary: "List API keys",
        description: "Returns all API keys for the current environment.",
        tags: ["API Keys"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "List of API keys",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    apiKeys: {
                      type: "array",
                      items: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: "createApiKey",
        summary: "Create API key",
        description: "Creates a new API key for the current environment.",
        tags: ["API Keys"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  scope: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "API key created",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/content/api-keys/{keyId}/revoke": {
      post: {
        operationId: "revokeApiKey",
        summary: "Revoke API key",
        description: "Revokes a specific API key.",
        tags: ["API Keys"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        parameters: [
          {
            name: "keyId",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "API key revoked",
          },
        },
      },
    },
    "/api/content/data-transfer/export": {
      post: {
        operationId: "exportDataTransfer",
        summary: "Export data transfer archive",
        description: "Exports a data transfer archive for the current environment.",
        tags: ["Data Transfer"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  tables: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Export archive",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/api/content/data-transfer/import": {
      post: {
        operationId: "importDataTransfer",
        summary: "Import data transfer archive",
        description: "Imports a data transfer archive into the current environment.",
        tags: ["Data Transfer"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  archive: {
                    type: "string",
                    format: "binary",
                  },
                  skipMissingTables: {
                    type: "boolean",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Import completed",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/content/uploads/export": {
      post: {
        operationId: "exportUploads",
        summary: "Export uploads archive",
        description: "Exports all uploads as an archive.",
        tags: ["Uploads"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        responses: {
          "200": {
            description: "Uploads archive",
            content: {
              "application/octet-stream": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
        },
      },
    },
    "/api/content/uploads/import": {
      post: {
        operationId: "importUploads",
        summary: "Import uploads archive",
        description: "Imports an uploads archive.",
        tags: ["Uploads"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                properties: {
                  archive: {
                    type: "string",
                    format: "binary",
                  },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Uploads imported",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
    "/api/content/schema/publish": {
      post: {
        operationId: "publishSchema",
        summary: "Publish schema descriptor",
        description: "Publishes a new schema descriptor for the environment.",
        tags: ["Schema"],
        security: [{ bearerAuth: [] }, { apiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  descriptor: { type: "object" },
                  version: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Schema published",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: { type: "boolean" },
                    checksum: { type: "string" },
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
