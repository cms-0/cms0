import { describe, expect, it } from "vitest";

import {
  buildZodSchemasFromDescriptor,
  plunkEmailTransportConfigSchema,
  resolveDescriptorPath,
  slugify,
} from "@cms0/shared";

const descriptor = {
  models: {
    article: {
      properties: {
        title: { type: "string" },
      },
      type: "object",
    },
  },
  roots: {
    site: {
      properties: {
        articles: {
          items: {
            properties: {
              slug: { type: "string" },
            },
            type: "object",
          },
          type: "array",
        },
        hero: {
          properties: {
            title: { type: "string" },
          },
          type: "object",
        },
        featuredArticle: {
          model: "article",
        },
      },
      type: "object",
    },
  },
};

describe("@cms0/shared descriptor helpers", () => {
  it("slugifies text consistently", () => {
    expect(slugify("  Hello CMS0 World  ")).toBe("hello-cms0-world");
  });

  it("resolves object, array, and model-ref descriptor paths", () => {
    const objectPath = resolveDescriptorPath(descriptor, "site/hero");
    const arrayPath = resolveDescriptorPath(descriptor, "site/articles/0");
    const modelRefPath = resolveDescriptorPath(
      descriptor,
      "site/featuredArticle",
    );

    expect(objectPath?.kind).toBe("object");
    expect(objectPath?.fields.map((field) => field.name)).toEqual(["title"]);
    expect(arrayPath?.kind).toBe("object");
    expect(arrayPath?.fields.map((field) => field.name)).toEqual(["slug"]);
    expect(modelRefPath?.kind).toBe("modelRef");
  });

  it("builds zod schemas for plain primitive descriptors from legacy-compatible shapes", () => {
    const { modelZodSchemas, zodSchemas } = buildZodSchemasFromDescriptor(
      descriptor as any,
    );

    expect(
      modelZodSchemas.article?.safeParse({
        title: "Title",
      }).success,
    ).toBe(true);

    expect(
      zodSchemas.site?.safeParse({
        hero: {
          title: "Home",
        },
      }).success,
    ).toBe(true);
  });

  it("accepts only Plunk server-side secret keys", () => {
    expect(
      plunkEmailTransportConfigSchema.safeParse({
        kind: "plunk",
        secretKey: "sk_test_key",
      }).success,
    ).toBe(true);

    expect(
      plunkEmailTransportConfigSchema.safeParse({
        kind: "plunk",
        secretKey: "invalid",
      }).success,
    ).toBe(false);
  });
});
