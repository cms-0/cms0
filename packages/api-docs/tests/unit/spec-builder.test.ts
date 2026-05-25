import { describe, expect, it } from "vitest";

import { buildOpenApiSpec } from "../../src/index";

describe("@cms0/api-docs spec builder", () => {
  it("builds a self-hosted OpenAPI document with auth security schemes", () => {
    const spec = buildOpenApiSpec({
      config: {
        includeAuth: true,
        info: {
          description: "cms0 API",
          title: "cms0",
          version: "0.0.1",
        },
        servers: [{ description: "local", url: "http://localhost:3000" }],
      },
      descriptor: {
        roots: {
          HomePage: {
            properties: {
              title: { kind: "primitive", type: "string" },
            },
            type: "object",
          },
        },
      },
    });

    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("cms0");
    expect(spec.components?.securitySchemes?.apiKey).toMatchObject({
      in: "header",
      type: "apiKey",
    });
    expect(Object.keys(spec.paths).length).toBeGreaterThan(0);
  });
});
