import { describe, expect, it } from "vitest";

import {
  parseGraphQueryOptions,
  resolveGraphPathQueryOptions,
  serializeGraphQueryOptions,
} from "../../src/graph-query";

describe("graph query options", () => {
  it("serializes global and path-scoped graph options", () => {
    const params = serializeGraphQueryOptions({
      fields: ["seo", "title"],
      locale: "en",
      pageSize: "full",
      paths: {
        "seo.openGraph.images": {
          fields: "url,alt",
          pageSize: "full",
        },
      },
      resolveModelRefs: false,
    });

    expect(params.toString()).toBe(
      "fields=seo%2Ctitle&locale=en&pageSize=full&resolveModelRefs=false&seo.openGraph.images.pageSize=full&seo.openGraph.images.fields=url%2Calt",
    );
  });

  it("parses graph options from URL search params", () => {
    const params = new URLSearchParams({
      fields: "seo,title",
      locale: "all",
      maxDepth: "4",
      page: "2",
      pageSize: "full",
      "seo.openGraph.images.pageSize": "full",
      "seo.openGraph.images.fields": "url,alt",
    });

    expect(parseGraphQueryOptions(params)).toEqual({
      fields: ["seo", "title"],
      exclude: undefined,
      locale: "all",
      maxDepth: 4,
      orderBy: undefined,
      orderDir: undefined,
      page: 2,
      pageSize: "full",
      paths: {
        "seo.openGraph.images": {
          fields: ["url", "alt"],
          pageSize: "full",
        },
      },
      resolveModelRefs: undefined,
      search: undefined,
    });
  });

  it("does not parse non-positive page sizes", () => {
    const params = new URLSearchParams({
      pageSize: "0",
      "seo.openGraph.images.pageSize": "-1",
    });

    expect(parseGraphQueryOptions(params)).toEqual({
      fields: undefined,
      exclude: undefined,
      locale: undefined,
      maxDepth: undefined,
      orderBy: undefined,
      orderDir: undefined,
      page: undefined,
      pageSize: undefined,
      paths: {
        "seo.openGraph.images": {
          pageSize: undefined,
        },
      },
      resolveModelRefs: undefined,
      search: undefined,
    });
  });

  it("inherits path overrides from ancestors before exact path options", () => {
    expect(
      resolveGraphPathQueryOptions(
        { pageSize: 10, orderDir: "asc" },
        {
          seo: { pageSize: 20 },
          "seo.openGraph.images": { orderBy: "createdAt", pageSize: 30 },
        },
        "seo.openGraph.images",
      ),
    ).toEqual({
      orderBy: "createdAt",
      orderDir: "asc",
      pageSize: 30,
    });
  });
});
