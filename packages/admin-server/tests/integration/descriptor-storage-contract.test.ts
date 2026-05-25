import { describe, expect, it } from "vitest";

import { buildResolvedReadEngine } from "../../src/route-gen/resolved-read-engine";

const localized = (value: string) => ({
  defaultLocale: "en",
  locales: { en: value },
});

const imageDescriptor = {
  type: "object",
  properties: {
    name: { kind: "primitive", type: "string" },
    filename: { kind: "primitive", type: "string" },
    extension: { kind: "primitive", type: "string" },
    mimeType: { kind: "primitive", type: "string" },
    size: { kind: "primitive", type: "number" },
    width: { kind: "primitive", type: "number" },
    height: { kind: "primitive", type: "number" },
    alt: { kind: "primitive", type: "string", optional: true },
  },
} as any;

const linkDescriptor = {
  type: "object",
  properties: {
    label: {
      kind: "primitive",
      type: "json",
      customType: "LocalizedString",
    },
    href: { kind: "primitive", type: "string" },
    icon: { kind: "modelRef", model: "Image", optional: true },
  },
} as any;

const planDescriptor = {
  type: "object",
  properties: {
    cta: { kind: "modelRef", model: "Link" },
    icon: { kind: "modelRef", model: "Image", optional: true },
    price: {
      type: "object",
      properties: {
        yearly: {
          kind: "primitive",
          type: "json",
          customType: "LocalizedString",
        },
        monthly: {
          kind: "primitive",
          type: "json",
          customType: "LocalizedString",
        },
      },
    },
    title: {
      kind: "primitive",
      type: "json",
      customType: "LocalizedString",
    },
  },
} as any;

function collectionResource(path: string, name: string, item: any) {
  return {
    kind: "collection",
    item,
    path,
    table: {
      name,
      table: {},
    },
  } as any;
}

function singletonResource(path: string, name: string, descriptor: any) {
  return {
    kind: "singleton",
    descriptor,
    path,
    rootLink: {
      column: "planId",
      table: { name: "plan", table: {} },
    },
    table: {
      name,
      table: {},
    },
  } as any;
}

describe("descriptor/storage/graph contract", () => {
  it("emits descriptor field names for property-based FK storage columns", async () => {
    const imageRows = new Map([
      [
        "img-1",
        {
          id: "img-1",
          name: "Hero image",
          filename: "hero.png",
          extension: "png",
          mimeType: "image/png",
          size: 123,
          width: 10,
          height: 10,
          alt: "Hero alt",
        },
      ],
      [
        "img-link",
        {
          id: "img-link",
          name: "Link icon",
          filename: "link.png",
          extension: "png",
          mimeType: "image/png",
          size: 456,
          width: 12,
          height: 12,
          alt: "Link alt",
        },
      ],
    ]);

    const linkRows = new Map([
      [
        "link-1",
        {
          id: "link-1",
          href: "/signup",
          iconId: "img-link",
          label: localized("Start now"),
        },
      ],
    ]);

    const planResource = collectionResource(
      "models/Plan",
      "plan",
      planDescriptor,
    );
    const imageResource = collectionResource(
      "models/Image",
      "image",
      imageDescriptor,
    );
    const linkResource = collectionResource("models/Link", "link", linkDescriptor);
    const priceResource = singletonResource(
      "models/Plan/{id}/price",
      "planPrice",
      planDescriptor.properties.price,
    );

    const engine = buildResolvedReadEngine({
      collectionHandlersByPath: new Map([
        [
          "models/Plan",
          {
            getById: async () => null,
            list: async () => ({
              items: [
                {
                  id: "plan-1",
                  iconId: "img-1",
                  ctaId: "link-1",
                  priceId: "price-1",
                  title: localized("Corporate"),
                },
                {
                  id: "plan-2",
                  iconId: null,
                  ctaId: null,
                  priceId: null,
                  title: localized("Basic"),
                },
              ],
              total: 2,
            }),
          },
        ],
        [
          "models/Image",
          {
            getById: async (id: string) => imageRows.get(id) ?? null,
            list: async () => ({
              items: Array.from(imageRows.values()),
              total: imageRows.size,
            }),
          },
        ],
        [
          "models/Link",
          {
            getById: async (id: string) => linkRows.get(id) ?? null,
            list: async () => ({
              items: Array.from(linkRows.values()),
              total: linkRows.size,
            }),
          },
        ],
      ]),
      singletonHandlersByPath: new Map([
        [
          "models/Plan/{id}/price",
          {
            get: async (parentId?: string) =>
              parentId === "plan-1"
                ? {
                    id: "price-1",
                    monthly: localized("120KD"),
                    planId: "plan-1",
                    yearly: localized("1200KD"),
                  }
                : {},
          },
        ],
      ]),
      tableResourceByName: new Map([
        ["plan", planResource],
        ["image", imageResource],
        ["link", linkResource],
        ["planPrice", priceResource],
      ]),
    });

    const result = await engine.resolveCollection(planResource, {
      page: 1,
      pageSize: 10,
      resolveModelRefs: true,
    });

    expect(result.data[0]).toMatchObject({
      cta: {
        href: "/signup",
        icon: { filename: "link.png", name: "Link icon" },
        label: localized("Start now"),
      },
      icon: { filename: "hero.png", name: "Hero image" },
      id: "plan-1",
      price: {
        monthly: localized("120KD"),
        yearly: localized("1200KD"),
      },
      title: localized("Corporate"),
    });
    expect(result.data[0]).not.toHaveProperty("ctaId");
    expect(result.data[0]).not.toHaveProperty("iconId");
    expect(result.data[0]).not.toHaveProperty("priceId");

    expect(result.data[1]).toMatchObject({
      cta: null,
      icon: null,
      id: "plan-2",
      title: localized("Basic"),
    });
    expect(result.data[1]).not.toHaveProperty("ctaId");
    expect(result.data[1]).not.toHaveProperty("iconId");
  });

  it("continues to resolve legacy target-model FK storage columns", async () => {
    const imageRows = new Map([
      [
        "img-1",
        {
          id: "img-1",
          name: "Hero image",
          filename: "hero.png",
          extension: "png",
          mimeType: "image/png",
          size: 123,
          width: 10,
          height: 10,
        },
      ],
      [
        "img-link",
        {
          id: "img-link",
          name: "Link icon",
          filename: "link.png",
          extension: "png",
          mimeType: "image/png",
          size: 456,
          width: 12,
          height: 12,
        },
      ],
    ]);

    const linkRows = new Map([
      [
        "link-1",
        {
          id: "link-1",
          href: "/signup",
          imageId: "img-link",
          label: localized("Start now"),
        },
      ],
    ]);

    const planResource = collectionResource(
      "models/Plan",
      "plan",
      planDescriptor,
    );
    const imageResource = collectionResource(
      "models/Image",
      "image",
      imageDescriptor,
    );
    const linkResource = collectionResource("models/Link", "link", linkDescriptor);

    const engine = buildResolvedReadEngine({
      collectionHandlersByPath: new Map([
        [
          "models/Plan",
          {
            getById: async () => null,
            list: async () => ({
              items: [
                {
                  id: "plan-1",
                  imageId: "img-1",
                  linkId: "link-1",
                  title: localized("Corporate"),
                },
              ],
              total: 1,
            }),
          },
        ],
        [
          "models/Image",
          {
            getById: async (id: string) => imageRows.get(id) ?? null,
            list: async () => ({
              items: Array.from(imageRows.values()),
              total: imageRows.size,
            }),
          },
        ],
        [
          "models/Link",
          {
            getById: async (id: string) => linkRows.get(id) ?? null,
            list: async () => ({
              items: Array.from(linkRows.values()),
              total: linkRows.size,
            }),
          },
        ],
      ]),
      singletonHandlersByPath: new Map(),
      tableResourceByName: new Map([
        ["plan", planResource],
        ["image", imageResource],
        ["link", linkResource],
      ]),
    });

    const result = await engine.resolveCollection(planResource, {
      page: 1,
      pageSize: 10,
      resolveModelRefs: true,
    });

    expect(result.data[0]).toMatchObject({
      cta: {
        href: "/signup",
        icon: { filename: "link.png", name: "Link icon" },
      },
      icon: { filename: "hero.png", name: "Hero image" },
      id: "plan-1",
      title: localized("Corporate"),
    });
    expect(result.data[0]).not.toHaveProperty("linkId");
    expect(result.data[0]).not.toHaveProperty("imageId");
  });

  it("serializes graph system timestamps as ISO strings", async () => {
    const createdAt = new Date("2026-05-07T12:00:00.000Z");
    const updatedAt = new Date("2026-05-07T12:30:00.000Z");
    const homeDescriptor = {
      type: "object",
      properties: {
        title: { kind: "primitive", type: "string" },
      },
    } as any;
    const homeResource = {
      kind: "singleton",
      descriptor: homeDescriptor,
      path: "HomePage",
      table: {
        name: "homePage",
        table: {},
      },
    } as any;
    const engine = buildResolvedReadEngine({
      collectionHandlersByPath: new Map(),
      singletonHandlersByPath: new Map([
        [
          "HomePage",
          {
            get: async () => ({
              createdAt,
              id: "home-1",
              title: "Home",
              updatedAt,
            }),
          },
        ],
      ]),
      tableResourceByName: new Map([["homePage", homeResource]]),
    });

    const result = await engine.resolveRoot(homeResource, {
      fields: ["createdAt", "updatedAt", "title"],
    });

    expect(result).toEqual({
      createdAt: "2026-05-07T12:00:00.000Z",
      title: "Home",
      updatedAt: "2026-05-07T12:30:00.000Z",
    });
  });

  it("resolves all graph-backed array rows for default and path-level full page size", async () => {
    const itemDescriptor = {
      type: "object",
      properties: {
        title: { kind: "primitive", type: "string" },
      },
    } as any;
    const homeDescriptor = {
      type: "object",
      properties: {
        featuredPosts: {
          type: "array",
          items: itemDescriptor,
        },
      },
    } as any;
    const homeResource = {
      kind: "singleton",
      descriptor: homeDescriptor,
      path: "HomePage",
      table: {
        name: "homePage",
        table: {},
      },
    } as any;
    const featuredPostResource = collectionResource(
      "HomePage/featuredPosts",
      "homePageFeaturedPostsItem",
      itemDescriptor,
    );
    const rows = Array.from({ length: 73 }, (_, index) => ({
      id: `post-${index + 1}`,
      title: `Post ${index + 1}`,
    }));
    const seenPageSizes: number[] = [];
    const engine = buildResolvedReadEngine({
      collectionHandlersByPath: new Map([
        [
          "HomePage/featuredPosts",
          {
            getById: async () => null,
            list: async (_parentId: string | undefined, opts?: any) => {
              const page = Number(opts?.page ?? 0);
              const pageSize = opts?.pageSize;
              if (!Number.isFinite(pageSize) || pageSize <= 0) {
                throw new Error(
                  `Expected numeric pageSize, received ${String(pageSize)}`,
                );
              }
              seenPageSizes.push(pageSize);
              return {
                items: rows.slice(page * pageSize, page * pageSize + pageSize),
                total: rows.length,
              };
            },
          },
        ],
      ]),
      singletonHandlersByPath: new Map([
        [
          "HomePage",
          {
            get: async () => ({
              id: "home-1",
            }),
          },
        ],
      ]),
      tableResourceByName: new Map([
        ["homePage", homeResource],
        ["homePageFeaturedPostsItem", featuredPostResource],
      ]),
    });

    const result = await engine.resolveRoot(homeResource);

    expect(result.featuredPosts.data).toHaveLength(73);
    expect(result.featuredPosts.pagination).toEqual({
      page: 1,
      pageSize: 73,
      total: 73,
      pageCount: 1,
    });
    expect(seenPageSizes).toEqual([500]);

    seenPageSizes.length = 0;
    const pathResult = await engine.resolveRoot(homeResource, {
      pageSize: 25,
      paths: {
        featuredPosts: {
          pageSize: "full",
        },
      },
    });

    expect(pathResult.featuredPosts.data).toHaveLength(73);
    expect(pathResult.featuredPosts.pagination).toEqual({
      page: 1,
      pageSize: 73,
      total: 73,
      pageCount: 1,
    });
    expect(seenPageSizes).toEqual([500]);
  });
});
