/**
 * Better-Auth Generator
 *
 * Generates OpenAPI specs for better-auth endpoints.
 */

import type { OpenApiPathItem, OpenApiSpec } from "../types";

export function generateBetterAuthPaths(): Record<string, OpenApiPathItem> {
  return {
    "/api/auth/signup/email": {
      post: {
        operationId: "signupWithEmail",
        summary: "Sign up with email",
        description: "Register a new user account with email and password.",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string", minLength: 8 },
                  name: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "User registered successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/signin/email": {
      post: {
        operationId: "signinWithEmail",
        summary: "Sign in with email",
        description: "Authenticate with email and password.",
        tags: ["Authentication"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["email", "password"],
                properties: {
                  email: { type: "string", format: "email" },
                  password: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Authentication successful",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    token: { type: "string" },
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/signout": {
      post: {
        operationId: "signout",
        summary: "Sign out",
        description: "Sign out the current user.",
        tags: ["Authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Signed out successfully",
          },
        },
      },
    },
    "/api/auth/session": {
      get: {
        operationId: "getSession",
        summary: "Get current session",
        description: "Returns the current user session.",
        tags: ["Authentication"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Current session",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    user: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        email: { type: "string" },
                        name: { type: "string" },
                      },
                    },
                    session: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        expiresAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/organization/list": {
      get: {
        operationId: "listOrganizations",
        summary: "List organizations",
        description: "Returns organizations the user belongs to.",
        tags: ["Organizations"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "List of organizations",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      name: { type: "string" },
                      slug: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/organization/create": {
      post: {
        operationId: "createOrganization",
        summary: "Create organization",
        description: "Create a new organization.",
        tags: ["Organizations"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name", "slug"],
                properties: {
                  name: { type: "string" },
                  slug: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Organization created",
          },
        },
      },
    },
  };
}

export function getBetterAuthComponents(): NonNullable<
  OpenApiSpec["components"]
> {
  return {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Better Auth session token",
      },
    },
  };
}
