import assert from "node:assert/strict";
import { test } from "vitest";
import {
  cms0,
  createCmsClient,
  resolveLocalized,
  toNextMetadata,
} from "../../src/index.js";
import {
  activateCms0CanvasTransport,
  readCms0CollectionItemIdentity,
} from "../../src/provenance.js";
import {
  getCms0DescriptorSidecarEventsUrl,
  getCms0DescriptorSidecarUrl,
} from "../../src/descriptor-sidecar.js";
import {
  encodeTaggedUnionValue,
  getUnionBranchKeys,
  type FieldDescriptor,
  type FullDescriptor,
} from "@cms0/shared";
import {
  customInlineDescriptors,
  customModelDescriptors,
  resolveCustomTypeDependencies,
} from "../../src/custom-types/registry.js";

type FetchHandler = (url: URL) => any;

function tagUnionBranch(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  branchIndex: number,
  value: unknown,
) {
  const keys = getUnionBranchKeys(descriptor);
  const branchKey = keys[branchIndex];
  if (!branchKey) {
    throw new Error(`Missing union branch key at index ${branchIndex}`);
  }
  return encodeTaggedUnionValue(branchKey, value);
}

function createDescriptor(): FullDescriptor {
  return {
    models: {
      User: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
          manager: { kind: "modelRef", model: "User", optional: true },
        },
      },
      Post: {
        kind: "model",
        properties: {
          title: { kind: "primitive", type: "string" },
          author: { kind: "modelRef", model: "User" },
          comments: {
            type: "array",
            items: {
              type: "object",
              properties: {
                body: { kind: "primitive", type: "string" },
              },
            },
          },
          tags: {
            type: "array",
            items: { kind: "primitive", type: "string" },
          },
        },
      },
    },
    roots: {
      home: {
        type: "object",
        properties: {
          title: { kind: "primitive", type: "string" },
          hero: {
            type: "object",
            properties: {
              heading: { kind: "primitive", type: "string" },
            },
          },
          featuredPosts: {
            type: "array",
            items: {
              kind: "modelRef",
              model: "Post",
            },
          },
        },
      },
      posts: {
        type: "array",
        items: {
          kind: "modelRef",
          model: "Post",
        },
      },
      names: {
        type: "array",
        items: {
          kind: "primitive",
          type: "string",
        },
      },
      profile: {
        kind: "modelRef",
        model: "User",
      },
    },
  };
}

function installFetchMock(handler: FetchHandler) {
  const originalFetch = globalThis.fetch;
  const calls: URL[] = [];

  globalThis.fetch = async (input: string | URL | Request) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl);
    calls.push(url);
    const payload = handler(url);
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function standardHandler(url: URL) {
  const path = url.pathname;

  if (path === "/api/content/_graph/home") {
    return { id: "home-1", title: "Welcome" };
  }
  if (path === "/api/content/_graph/home/hero") {
    return { id: "hero-1", heading: "Hero heading" };
  }
  if (path === "/api/content/_graph/home/featuredPosts") {
    return {
      items: [{ id: "fp-1", postId: "p1" }],
      total: 1,
    };
  }
  if (path === "/api/content/_graph/posts") {
    return {
      items: [{ id: "posts-1", postId: "p1" }],
      total: 11,
    };
  }
  if (path === "/api/content/_graph/names") {
    return {
      items: [
        { id: "n1", value: "Ada" },
        { id: "n2", value: "Grace" },
      ],
      total: 2,
    };
  }
  if (path === "/api/content/_graph/profile") {
    return "u1";
  }
  if (path === "/api/content/_graph/models/Post") {
    return {
      items: [{ id: "p1", title: "Post 1", authorId: "u1" }],
      total: 1,
    };
  }
  if (path === "/api/content/_graph/models/Post/p1") {
    return { id: "p1", title: "Post 1", authorId: "u1" };
  }
  if (path === "/api/content/_graph/models/Post/p1/comments") {
    return {
      items: [{ id: "c1", body: "First comment" }],
      total: 1,
    };
  }
  if (path === "/api/content/_graph/models/Post/p1/tags") {
    return {
      items: [{ id: "t1", value: "news" }],
      total: 1,
    };
  }
  if (path === "/api/content/_graph/models/User/u1") {
    return { id: "u1", name: "Alice", managerId: "u1" };
  }

  throw new Error(`Unhandled request in test mock: ${url.toString()}`);
}

function createResolvedTestimonialsDescriptor(): FullDescriptor {
  return {
    models: {
      Testimonial: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
          stats: {
            type: "object",
            properties: {
              desktop: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { kind: "primitive", type: "string" },
                    value: { kind: "primitive", type: "string" },
                  },
                },
              },
              mobile: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { kind: "primitive", type: "string" },
                    value: { kind: "primitive", type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    roots: {
      homePage: {
        type: "object",
        properties: {
          testimonialSection: {
            type: "object",
            properties: {
              testimonials: {
                type: "array",
                items: {
                  kind: "modelRef",
                  model: "Testimonial",
                },
              },
            },
          },
        },
      },
    },
  };
}

test("normalizes root object recursively (arrays, nested objects, model refs)", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{
      home: {
        title: string;
        hero: { heading: string };
        featuredPosts: Array<{
          id: string;
          title: string;
          comments: Array<{ id: string; body: string }>;
          tags: string[];
          author: { name: string; manager: string };
        }>;
      };
    }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const home = await client.home();

    assert.deepEqual(home, {
      title: "Welcome",
      hero: { heading: "Hero heading" },
      featuredPosts: [
        {
          title: "Post 1",
          comments: [{ body: "First comment" }],
          tags: ["news"],
          author: { name: "Alice", manager: "u1" },
        },
      ],
    });
  } finally {
    restore();
  }
});

test("preserves nested testimonial stats from resolved root endpoint", async () => {
  const descriptor = createResolvedTestimonialsDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/homePage") {
      return {
        id: "home-1",
        testimonialSection: {
          id: "section-1",
          testimonials: [
            {
              id: "tm-1",
              name: "Alice",
              stats: {
                id: "stats-1",
                desktop: [{ id: "desktop-1", label: "Users", value: "323" }],
                mobile: [{ id: "mobile-1", label: "Users", value: "120" }],
              },
            },
          ],
        },
      };
    }

    throw new Error(
      `Unhandled request in resolved-root test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ homePage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const homePage = await client.homePage();

    assert.equal(homePage.testimonialSection.testimonials.length, 1);
    assert.equal(
      homePage.testimonialSection.testimonials[0]?.stats?.desktop?.[0]?.value,
      "323",
    );
    assert.equal(
      homePage.testimonialSection.testimonials[0]?.stats?.mobile?.[0]?.label,
      "Users",
    );

    const resolvedCalls = calls.filter(
      (call) => call.pathname === "/api/content/_graph/homePage",
    );
    assert.equal(resolvedCalls.length, 1);
    const modelCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/models/Testimonial/"),
    );
    assert.equal(modelCalls.length, 0);
  } finally {
    restore();
  }
});

test("preserves distinct collection-entry identities for duplicate resolved model refs", async () => {
  const descriptor = createResolvedTestimonialsDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/homePage") {
      return {
        id: "home-1",
        testimonialSection: {
          id: "section-1",
          testimonials: [
            {
              id: "tm-1",
              name: "Alice",
              stats: {
                id: "stats-1",
                desktop: [{ id: "desktop-1", label: "Users", value: "323" }],
                mobile: [{ id: "mobile-1", label: "Users", value: "120" }],
              },
            },
            {
              id: "tm-1",
              name: "Alice",
              stats: {
                id: "stats-1",
                desktop: [{ id: "desktop-1", label: "Users", value: "323" }],
                mobile: [{ id: "mobile-1", label: "Users", value: "120" }],
              },
            },
          ],
        },
      };
    }

    if (
      url.pathname ===
      "/api/content/_graph/homePage/testimonialSection/testimonials"
    ) {
      return {
        items: [
          { id: "join-1", testimonialId: "tm-1" },
          { id: "join-2", testimonialId: "tm-1" },
        ],
        total: 2,
      };
    }

    throw new Error(
      `Unhandled request in duplicate model-ref test mock: ${url.toString()}`,
    );
  });

  activateCms0CanvasTransport(true);
  try {
    const client = createCmsClient<{ homePage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const homePage = await client.homePage();
    const [first, second] = homePage.testimonialSection.testimonials;

    assert.equal(first?.name, "Alice");
    assert.equal(second?.name, "Alice");
    assert.notEqual(first, second);
    assert.equal(readCms0CollectionItemIdentity(first), "join-1");
    assert.equal(readCms0CollectionItemIdentity(second), "join-2");
    assert.equal(
      calls.filter(
        (call) =>
          call.pathname ===
          "/api/content/_graph/homePage/testimonialSection/testimonials",
      ).length,
      1,
    );
  } finally {
    activateCms0CanvasTransport(false);
    restore();
  }
});

test("resolved duplicate model refs stay unchanged when Canvas transport is disabled", async () => {
  const descriptor = createResolvedTestimonialsDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/homePage") {
      return {
        id: "home-1",
        testimonialSection: {
          id: "section-1",
          testimonials: [
            {
              id: "tm-1",
              name: "Alice",
              stats: {
                id: "stats-1",
                desktop: [{ id: "desktop-1", label: "Users", value: "323" }],
                mobile: [{ id: "mobile-1", label: "Users", value: "120" }],
              },
            },
            {
              id: "tm-1",
              name: "Alice",
              stats: {
                id: "stats-1",
                desktop: [{ id: "desktop-1", label: "Users", value: "323" }],
                mobile: [{ id: "mobile-1", label: "Users", value: "120" }],
              },
            },
          ],
        },
      };
    }

    throw new Error(
      `Unhandled request in transport-disabled duplicate test mock: ${url.toString()}`,
    );
  });

  activateCms0CanvasTransport(false);
  try {
    const client = createCmsClient<{ homePage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const homePage = await client.homePage();
    const [first, second] = homePage.testimonialSection.testimonials;

    assert.equal(first?.name, "Alice");
    assert.equal(second?.name, "Alice");
    assert.equal(readCms0CollectionItemIdentity(first), null);
    assert.equal(readCms0CollectionItemIdentity(second), null);
    assert.equal(
      calls.filter(
        (call) =>
          call.pathname ===
          "/api/content/_graph/homePage/testimonialSection/testimonials",
      ).length,
      0,
    );
  } finally {
    restore();
  }
});

test("supports response envelope and query passthrough for collections", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ posts: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const envelope = await client.posts({
      response: "envelope",
      query: { page: 2, pageSize: 5, search: "post", locale: "all" },
    });

    assert.equal(Array.isArray(envelope.items), true);
    assert.equal(envelope.total, 11);

    const listCall = calls.find(
      (call) => call.pathname === "/api/content/_graph/posts",
    );
    assert.ok(listCall);
    assert.equal(listCall!.searchParams.get("page"), "2");
    assert.equal(listCall!.searchParams.get("pageSize"), "5");
    assert.equal(listCall!.searchParams.get("search"), "post");
    assert.equal(listCall!.searchParams.get("locale"), "all");
    assert.equal(listCall!.searchParams.get("raw"), "1");
  } finally {
    restore();
  }
});

test("forwards fields and exclude as query params for resolved root reads", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return {
        id: "home-1",
        title: "Welcome",
        hero: { id: "hero-1", heading: "Hero heading" },
        featuredPosts: [],
      };
    }
    if (url.pathname === "/api/content/home") {
      return { id: "home-1", title: "Welcome" };
    }
    throw new Error(
      `Unhandled request in fields/exclude query test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    await client.home({
      fields: ["title", "hero.heading"],
      exclude: "hero.id",
    });

    const resolvedCall = calls.find(
      (call) => call.pathname === "/api/content/_graph/home",
    );
    assert.ok(resolvedCall);
    assert.equal(
      resolvedCall!.searchParams.get("fields"),
      "title,hero.heading",
    );
    assert.equal(resolvedCall!.searchParams.get("exclude"), "hero.id");
    assert.equal(resolvedCall!.searchParams.get("pageSize"), "full");
  } finally {
    restore();
  }
});

test("forwards graph query options and field pagination for resolved root reads", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return {
        id: "home-1",
        title: "Welcome",
        hero: { id: "hero-1", heading: "Hero heading" },
        featuredPosts: [],
      };
    }
    if (url.pathname === "/api/content/home") {
      return { id: "home-1", title: "Welcome" };
    }
    throw new Error(
      `Unhandled request in graph query options test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    await client.home({
      graph: {
        page: 2,
        pageSize: 10,
        orderBy: "title",
        orderDir: "desc",
        search: "hero",
        maxDepth: 4,
        paths: {
          featuredPosts: {
            page: 3,
            pageSize: 5,
            orderBy: "title",
            orderDir: "asc",
            search: "launch",
            fields: ["title", "author"],
            exclude: "draftNotes",
          },
        },
      },
      query: {
        scenario: "draft",
      },
    });

    const resolvedCall = calls.find(
      (call) => call.pathname === "/api/content/_graph/home",
    );
    assert.ok(resolvedCall);
    assert.equal(resolvedCall!.searchParams.get("page"), "2");
    assert.equal(resolvedCall!.searchParams.get("pageSize"), "10");
    assert.equal(resolvedCall!.searchParams.get("orderBy"), "title");
    assert.equal(resolvedCall!.searchParams.get("orderDir"), "desc");
    assert.equal(resolvedCall!.searchParams.get("search"), "hero");
    assert.equal(resolvedCall!.searchParams.get("maxDepth"), "4");
    assert.equal(resolvedCall!.searchParams.get("scenario"), "draft");
    assert.equal(resolvedCall!.searchParams.get("featuredPosts.page"), "3");
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.pageSize"),
      "5",
    );
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.orderBy"),
      "title",
    );
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.orderDir"),
      "asc",
    );
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.search"),
      "launch",
    );
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.fields"),
      "title,author",
    );
    assert.equal(
      resolvedCall!.searchParams.get("featuredPosts.exclude"),
      "draftNotes",
    );
  } finally {
    restore();
  }
});

test("supports descriptor field chain reads through _graph projections", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return {
        title: "Welcome",
      };
    }
    throw new Error(
      `Unhandled request in field chain read test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{
      home: {
        title: string;
        hero: { heading: string };
      };
    }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const title = await client.home.title();

    assert.equal(title, "Welcome");
    const resolvedCall = calls.find(
      (call) => call.pathname === "/api/content/_graph/home",
    );
    assert.ok(resolvedCall);
    assert.equal(resolvedCall.searchParams.get("fields"), "title");
  } finally {
    restore();
  }
});

test("respects an environment runtime base URL without adding content twice", async () => {
  const descriptor = createDescriptor();
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    body: any;
    method: string | undefined;
    url: URL;
  }> = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl);
    calls.push({
      body:
        typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      method: init?.method,
      url,
    });

    if (url.pathname === "/api/content/stage/_graph/home") {
      return new Response(JSON.stringify({ title: "Welcome" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (url.pathname === "/api/content/stage/_graph/home/_mutate") {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    throw new Error(
      `Unhandled request in environment base URL test mock: ${url.toString()}`,
    );
  };

  try {
    const client = createCmsClient<{
      home: {
        title: string;
      };
    }>(descriptor, {
      apiConfig: {
        baseUrl: "http://localhost:3001/api/content/stage",
        key: "k1",
      },
    });

    const title = await client.home.title();
    await client.home.update({ title: "Updated" });

    assert.equal(title, "Welcome");
    assert.equal(calls[0]?.url.pathname, "/api/content/stage/_graph/home");
    assert.equal(calls[0]?.url.searchParams.get("fields"), "title");
    assert.equal(
      calls[1]?.url.pathname,
      "/api/content/stage/_graph/home/_mutate",
    );
    assert.deepEqual(calls[1]?.body, {
      ops: [{ op: "set", path: "/title", value: "Updated" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("normalizes nested graph pagination envelopes as arrays", async () => {
  const descriptor: FullDescriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        properties: {
          testimonials: {
            type: "array",
            items: {
              type: "object",
              properties: {
                quote: { kind: "primitive", type: "string" },
              },
            },
          },
          title: { kind: "primitive", type: "string" },
        },
      },
    },
  };
  const { restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/stage/_graph/HomePage") {
      return {
        id: "home-1",
        testimonials: {
          data: [{ id: "testimonial-1", quote: "Stable graph envelope" }],
          pagination: {
            page: 1,
            pageCount: 1,
            pageSize: 10,
            total: 1,
          },
        },
        title: "Home",
      };
    }

    throw new Error(
      `Unhandled request in graph pagination envelope test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{
      HomePage: {
        testimonials: Array<{ quote: string }>;
        title: string;
      };
    }>(descriptor, {
      apiConfig: {
        baseUrl: "http://localhost:3001/api/content/stage",
        key: "k1",
      },
    });

    const homePage = await client.HomePage();

    assert.deepEqual(homePage.testimonials, [
      { quote: "Stable graph envelope" },
    ]);
  } finally {
    restore();
  }
});

test("root and field updates send granular graph mutation ops", async () => {
  const descriptor = createDescriptor();
  const originalFetch = globalThis.fetch;
  const calls: Array<{
    body: any;
    method: string | undefined;
    url: URL;
  }> = [];

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(rawUrl);
    calls.push({
      body:
        typeof init?.body === "string" ? JSON.parse(init.body) : init?.body,
      method: init?.method,
      url,
    });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = createCmsClient<{
      home: {
        title: string;
        hero: { heading: string };
      };
    }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    await client.home.update({
      hero: {
        heading: "Updated hero",
      },
      title: "Updated title",
    });
    await client.home.hero.heading.update("Updated heading");

    assert.equal(calls.length, 2);
    assert.equal(calls[0]?.method, "POST");
    assert.equal(calls[0]?.url.pathname, "/api/content/_graph/home/_mutate");
    assert.deepEqual(calls[0]?.body, {
      ops: [
        { op: "set", path: "/hero/heading", value: "Updated hero" },
        { op: "set", path: "/title", value: "Updated title" },
      ],
    });
    assert.equal(calls[1]?.method, "POST");
    assert.equal(calls[1]?.url.pathname, "/api/content/_graph/home/_mutate");
    assert.deepEqual(calls[1]?.body, {
      ops: [{ op: "set", path: "/hero/heading", value: "Updated heading" }],
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prefers resolved model endpoints for modelRef normalization", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return {
        id: "home-1",
        title: "Welcome",
        hero: { id: "hero-1", heading: "Hero heading" },
        featuredPosts: [{ id: "fp-1", postId: "p1" }],
      };
    }

    if (url.pathname === "/api/content/_graph/models/Post/p1") {
      return {
        id: "p1",
        title: "Post 1",
        author: {
          id: "u1",
          name: "Alice",
        },
        comments: [{ id: "c1", body: "First comment" }],
        tags: [{ id: "t1", value: "news" }],
      };
    }

    if (url.pathname.startsWith("/api/content/models/Post/")) {
      throw new Error(`Unexpected raw Post model fetch: ${url.toString()}`);
    }

    if (url.pathname.startsWith("/api/content/models/User/")) {
      throw new Error(`Unexpected raw User model fetch: ${url.toString()}`);
    }

    throw new Error(
      `Unhandled request in resolved modelRef test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const home = await client.home();

    assert.equal(home.featuredPosts[0]?.title, "Post 1");
    assert.equal(home.featuredPosts[0]?.author?.name, "Alice");
    assert.deepEqual(home.featuredPosts[0]?.comments, [
      { body: "First comment" },
    ]);
    assert.deepEqual(home.featuredPosts[0]?.tags, ["news"]);

    const resolvedModelCalls = calls.filter(
      (call) => call.pathname === "/api/content/_graph/models/Post/p1",
    );
    assert.equal(resolvedModelCalls.length, 1);

    const rawModelCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/models/Post/"),
    );
    assert.equal(rawModelCalls.length, 0);
  } finally {
    restore();
  }
});

test("supports recursive fields projection for nested objects and arrays", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const home = await client.home({
      fields: [
        "title",
        "hero.heading",
        "featuredPosts.author.name",
        "featuredPosts.comments.body",
      ],
    });

    assert.deepEqual(home, {
      title: "Welcome",
      hero: { heading: "Hero heading" },
      featuredPosts: [
        {
          author: { name: "Alice" },
          comments: [{ body: "First comment" }],
        },
      ],
    });
  } finally {
    restore();
  }
});

test("does not lazy-fetch missing branches outside requested fields projection", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return {
        hero: { heading: "Hero heading" },
      };
    }

    if (url.pathname.startsWith("/api/content/home/")) {
      throw new Error(
        `Unexpected child fetch for projected root read: ${url.toString()}`,
      );
    }

    if (url.pathname === "/api/content/home") {
      throw new Error(
        `Unexpected raw root fallback for projected read: ${url.toString()}`,
      );
    }

    throw new Error(
      `Unhandled request in projection pruning test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const home = await client.home({
      fields: ["hero.heading"],
    });

    assert.deepEqual(home, {
      hero: { heading: "Hero heading" },
    });

    const childCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/home/"),
    );
    assert.equal(childCalls.length, 0);
  } finally {
    restore();
  }
});

test("supports recursive exclude projection for nested objects and arrays", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ home: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const home = await client.home({
      exclude: [
        "hero",
        "featuredPosts.comments",
        "featuredPosts.author.manager",
      ],
    });

    assert.deepEqual(home, {
      title: "Welcome",
      featuredPosts: [
        {
          title: "Post 1",
          tags: ["news"],
          author: { name: "Alice" },
        },
      ],
    });
  } finally {
    restore();
  }
});

test("supports fields projection while preserving collection envelope total", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ posts: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const envelope = await client.posts({
      response: "envelope",
      fields: ["title"],
    });

    assert.equal(envelope.total, 11);
    assert.deepEqual(envelope.items, [{ title: "Post 1" }]);
  } finally {
    restore();
  }
});

test("supports model accessors via models namespace only", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<
      { home: unknown },
      {
        Post: {
          title: string;
          author: { name: string };
          comments: Array<{ body: string }>;
          tags: string[];
        };
      }
    >(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    assert.throws(() => (client as any).Post, /Unknown schema key 'Post'/);

    const list = await client.models.Post();
    assert.equal(list.length, 1);
    assert.equal((list[0] as any)?.id, undefined);
    assert.equal(list[0]!.title, "Post 1");

    const byId = await client.models.Post.byId("p1");
    assert.ok(byId);
    assert.equal((byId as any).id, undefined);
    assert.equal(byId!.title, "Post 1");

    const listWithoutIds = await client.models.Post({ includeId: false });
    assert.equal((listWithoutIds[0] as any)?.id, undefined);
  } finally {
    restore();
  }
});

test("supports includeId and resolveModelRefs=false options", async () => {
  const descriptor = createDescriptor();
  const { calls, restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ posts: any[]; names: string[] }>(
      descriptor,
      {
        apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      },
    );

    const idsOnly = await client.posts({ graph: { resolveModelRefs: false } });
    assert.deepEqual(idsOnly, ["p1"]);

    const noModelFetch = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/models/Post/p1"),
    );
    assert.equal(noModelFetch.length, 0);

    const namesWithIds = await client.names({ includeId: true });
    assert.deepEqual(namesWithIds, [
      { id: "n1", value: "Ada" },
      { id: "n2", value: "Grace" },
    ]);
  } finally {
    restore();
  }
});

test("throws helpful unknown key errors with suggestions", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ home: unknown }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    assert.throws(
      () => (client as any).HomePage,
      /Unknown schema key 'HomePage'.*Did you mean:/,
    );
  } finally {
    restore();
  }
});

test("exposes sdk metadata through client.meta only", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock(standardHandler);
  try {
    const client = createCmsClient<{ home: unknown }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      locales: ["en", "ar"],
      defaultLocale: "en",
      includeId: true,
    });

    assert.deepEqual(client.meta.locales, ["en", "ar"]);
    assert.equal(client.meta.defaultLocale, "en");
    assert.equal(client.meta.includeIdDefault, true);

    assert.throws(
      () => (client as any).locales,
      /Unknown schema key 'locales'/,
    );
  } finally {
    restore();
  }
});

test("throws for invalid collection envelope shape", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/posts") {
      return { value: "unexpected" };
    }
    return standardHandler(url);
  });
  try {
    const client = createCmsClient<{ posts: unknown[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    await assert.rejects(
      async () => client.posts(),
      /Invalid collection response/,
    );
  } finally {
    restore();
  }
});

test("does not use container row id as modelRef id when property FK is missing", async () => {
  const descriptor: FullDescriptor = {
    models: {
      PlanSection: {
        kind: "model",
        properties: {
          title: { kind: "primitive", type: "string" },
        },
      },
    },
    roots: {
      homePage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
          planSection: { kind: "modelRef", model: "PlanSection" },
        },
      },
    },
  };

  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/homePage") {
      return {
        id: "0e4e31f4-e63e-4d1e-95ec-b43b5b7dced5",
        headline: "Hello",
      };
    }

    if (url.pathname.startsWith("/api/content/models/PlanSection/")) {
      throw new Error(
        `Unexpected model fetch for missing FK: ${url.pathname}${url.search}`,
      );
    }

    throw new Error(
      `Unhandled request in missing FK test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ homePage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const homePage = await client.homePage();

    assert.equal(homePage.headline, "Hello");
    assert.equal(homePage.planSection, null);

    const modelCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/models/PlanSection/"),
    );
    assert.equal(modelCalls.length, 0);
  } finally {
    restore();
  }
});

test("omits optional modelRef fields when FK is missing in model normalization", async () => {
  const descriptor: FullDescriptor = {
    models: {
      Tag: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
        },
      },
      Option: {
        kind: "model",
        properties: {
          title: { kind: "primitive", type: "string" },
          tag: {
            kind: "modelRef",
            model: "Tag",
            optional: true,
            nullable: false,
          },
        },
      },
    },
    roots: {
      options: {
        type: "array",
        items: { kind: "modelRef", model: "Option" },
      },
    },
  };

  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/options") {
      return {
        items: [
          { id: "options-row-1", optionId: "o1" },
          { id: "options-row-2", optionId: "o2" },
        ],
        total: 2,
      };
    }

    if (url.pathname === "/api/content/_graph/models/Option/o1") {
      return {
        id: "o1",
        title: "Option A",
        tagId: "t1",
      };
    }

    if (url.pathname === "/api/content/_graph/models/Option/o2") {
      return {
        id: "o2",
        title: "Option B",
        // Missing tagId should not become tag: null for optional modelRef fields.
      };
    }

    if (url.pathname === "/api/content/_graph/models/Tag/t1") {
      return {
        id: "t1",
        name: "Featured",
      };
    }

    throw new Error(
      `Unhandled request in optional modelRef test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ options: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const options = await client.options();

    assert.equal(options.length, 2);
    assert.equal(options[0]?.id, undefined);
    assert.equal(options[0]?.title, "Option A");
    assert.equal(options[0]?.tag?.name, "Featured");
    assert.equal(options[1]?.id, undefined);
    assert.equal(options[1]?.title, "Option B");
    assert.equal("tag" in options[1]!, false);

    const tagFetches = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/models/Tag/"),
    );
    assert.equal(tagFetches.length, 1);
  } finally {
    restore();
  }
});

test("resolves modelRefs by property FK when object has multiple refs to same model", async () => {
  const descriptor: FullDescriptor = {
    models: {
      Image: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
        },
      },
    },
    roots: {
      marketplacePage: {
        type: "object",
        properties: {
          quoteSection: {
            type: "object",
            properties: {
              image: { kind: "modelRef", model: "Image" },
              logo: { kind: "modelRef", model: "Image" },
            },
          },
        },
      },
    },
  };

  const { calls, restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/marketplacePage") {
      return { id: "mp-1" };
    }
    if (url.pathname === "/api/content/_graph/marketplacePage/quoteSection") {
      return {
        id: "qs-1",
        imageId: "img-1",
        logoId: "img-2",
      };
    }
    if (url.pathname === "/api/content/_graph/models/Image/img-1") {
      return { id: "img-1", name: "Hero Image" };
    }
    if (url.pathname === "/api/content/_graph/models/Image/img-2") {
      return { id: "img-2", name: "Brand Logo" };
    }

    throw new Error(
      `Unhandled request in multi-ref same-model test mock: ${url.toString()}`,
    );
  });

  try {
    const client = createCmsClient<{ marketplacePage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const marketplacePage = await client.marketplacePage();

    assert.equal(marketplacePage.quoteSection.image.name, "Hero Image");
    assert.equal(marketplacePage.quoteSection.logo.name, "Brand Logo");

    const imageCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/_graph/models/Image/"),
    );
    assert.equal(imageCalls.length, 2);
    assert.equal(
      imageCalls.some((call) => call.pathname.endsWith("/img-1")),
      true,
    );
    assert.equal(
      imageCalls.some((call) => call.pathname.endsWith("/img-2")),
      true,
    );
  } finally {
    restore();
  }
});

test("validates normalized payloads and throws on shape mismatch", async () => {
  const descriptor = createDescriptor();
  const { restore } = installFetchMock((url) => {
    if (url.pathname === "/api/content/_graph/home") {
      return { id: "home-1", title: 123 };
    }
    return standardHandler(url);
  });
  try {
    const client = createCmsClient<{ home: { title: string } }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    await assert.rejects(async () => client.home(), /Invalid data received/);
  } finally {
    restore();
  }
});

function createLocalizedDescriptor(): FullDescriptor {
  return {
    models: {
      BlogPost: {
        kind: "model",
        properties: {
          title: {
            kind: "primitive",
            type: "json",
            customType: "LocalizedRichText",
          },
          description: {
            kind: "primitive",
            type: "json",
            customType: "LocalizedString",
          },
          content: {
            kind: "primitive",
            type: "json",
            customType: "RichText",
          },
        },
      },
    },
    roots: {
      blogPosts: {
        type: "array",
        items: { kind: "modelRef", model: "BlogPost" },
      },
      aboutUsPage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
          description: {
            kind: "primitive",
            type: "json",
            customType: "LocalizedRichText",
          },
        },
      },
    },
  };
}

function createLocalizedPrimitiveArrayDescriptor(): FullDescriptor {
  return {
    models: {},
    roots: {
      label: {
        kind: "primitive",
        type: "json",
        customType: "LocalizedString",
      },
      labels: {
        type: "array",
        items: {
          kind: "primitive",
          type: "json",
          customType: "LocalizedString",
        },
      },
    },
  };
}

function localizedHandler(url: URL) {
  const path = url.pathname;

  if (path === "/api/content/_graph/blogPosts") {
    return { items: [{ id: "bp-row-1", blogPostId: "bp1" }], total: 1 };
  }
  if (path === "/api/content/_graph/models/BlogPost/bp1") {
    return {
      id: "bp1",
      title: {
        defaultLocale: "en",
        locales: {
          en: {
            value: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Title EN" }],
                },
              ],
            },
            html: null,
          },
          fr: {
            value: {
              value: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Title FR" }],
                  },
                ],
              },
              html: "<p>Titre FR</p>",
            },
            html: null,
          },
        },
      },
      description: {
        defaultLocale: "en",
        locales: {
          en: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Description EN" }],
              },
            ],
          },
          fr: "Description FR",
        },
      },
      content: {
        value: {
          type: "doc",
          content: [{ type: "paragraph" }],
        },
        html: null,
      },
    };
  }
  if (path === "/api/content/_graph/aboutUsPage") {
    return {
      id: "about-1",
      headline: "About",
      description: {
        defaultLocale: "en",
        locales: {
          en: {
            value: { type: "doc", content: [{ type: "paragraph" }] },
            html: "<p>About EN</p>",
          },
          fr: {
            value: { type: "doc", content: [{ type: "paragraph" }] },
            html: "<p>A Propos FR</p>",
          },
        },
      },
    };
  }

  throw new Error(
    `Unhandled request in localized test mock: ${url.toString()}`,
  );
}

function localizedPrimitiveArrayHandler(url: URL) {
  if (url.pathname === "/api/content/_graph/label") {
    return {
      id: "label-root-1",
      value: {
        defaultLocale: "en",
        locales: {
          en: "Security",
          ar: "الحماية",
        },
      },
    };
  }

  if (url.pathname === "/api/content/_graph/labels") {
    return {
      items: [
        {
          id: "label-1",
          value: {
            defaultLocale: "en",
            locales: {
              en: "Encrypted payments",
              ar: "مدفوعات مشفرة",
            },
          },
        },
      ],
      total: 1,
    };
  }

  throw new Error(
    `Unhandled request in localized primitive array test mock: ${url.toString()}`,
  );
}

function createAssetDescriptor(): FullDescriptor {
  return {
    models: {
      Image: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
          filename: { kind: "primitive", type: "string" },
          extension: { kind: "primitive", type: "string" },
          mimeType: { kind: "primitive", type: "string" },
          size: { kind: "primitive", type: "number" },
          width: { kind: "primitive", type: "number" },
          height: { kind: "primitive", type: "number" },
        },
      },
    },
    roots: {
      images: {
        type: "array",
        items: { kind: "modelRef", model: "Image" },
      },
    },
  };
}

function assetHandler(url: URL) {
  const path = url.pathname;

  if (path === "/api/content/_graph/images") {
    return {
      items: [{ id: "images-row-1", imageId: "img-root-1" }],
      total: 1,
    };
  }

  if (path === "/api/content/_graph/models/Image") {
    return {
      items: [
        {
          id: "img-list-1",
          name: "Hero",
          filename: "hero banner.png",
          extension: "png",
          mimeType: "image/png",
          size: 123,
          width: 1200,
          height: 630,
        },
      ],
      total: 1,
    };
  }

  if (path === "/api/content/_graph/models/Image/img-root-1") {
    return {
      id: "img-root-1",
      name: "Root image",
      filename: "root image.png",
      extension: "png",
      mimeType: "image/png",
      size: 456,
      width: 800,
      height: 600,
    };
  }

  if (path === "/api/content/_graph/models/Image/img-with-url") {
    return {
      id: "img-with-url",
      name: "Signed",
      filename: "signed image.png",
      url: "https://signed.example.com/custom-url.png",
      extension: "png",
      mimeType: "image/png",
      size: 789,
      width: 640,
      height: 480,
    };
  }

  throw new Error(`Unhandled request in asset test mock: ${url.toString()}`);
}

test("coerces localized rich text/string fields to validation-safe output", async () => {
  const descriptor = createLocalizedDescriptor();
  const { restore } = installFetchMock(localizedHandler);
  try {
    const client = createCmsClient<{ blogPosts: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const blogPosts = await client.blogPosts();

    assert.equal(blogPosts.length, 1);
    assert.equal(blogPosts[0]?.title?.defaultLocale, "en");
    assert.equal(blogPosts[0]?.title?.locales?.en?.html, "");
    assert.equal(blogPosts[0]?.title?.locales?.fr?.html, "<p>Titre FR</p>");
    assert.equal(blogPosts[0]?.description?.defaultLocale, "en");
    assert.equal(blogPosts[0]?.description?.locales?.en, "Description EN");
    assert.equal(blogPosts[0]?.description?.locales?.fr, "Description FR");
    assert.deepEqual(blogPosts[0]?.content, {
      value: { type: "doc", content: [{ type: "paragraph" }] },
      html: "",
    });
  } finally {
    restore();
  }
});

test("includeId=true keeps localized map containers id-free", async () => {
  const descriptor = createLocalizedPrimitiveArrayDescriptor();
  const { restore } = installFetchMock(localizedPrimitiveArrayHandler);
  try {
    const client = createCmsClient<{
      label: {
        id: string;
        defaultLocale: string;
        locales: Record<string, string>;
      };
      labels: Array<{
        id: string;
        defaultLocale: string;
        locales: Record<string, string>;
      }>;
    }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const label = await client.label({ includeId: true });
    assert.deepEqual(label, {
      id: "label-root-1",
      defaultLocale: "en",
      locales: {
        en: "Security",
        ar: "الحماية",
      },
    });
    assert.equal((label.locales as any).id, undefined);

    const labels = await client.labels({ includeId: true });
    assert.deepEqual(labels, [
      {
        id: "label-1",
        defaultLocale: "en",
        locales: {
          en: "Encrypted payments",
          ar: "مدفوعات مشفرة",
        },
      },
    ]);
    assert.equal((labels[0] as any).value, undefined);
    assert.equal((labels[0]?.locales as any)?.id, undefined);
  } finally {
    restore();
  }
});

test("infers asset urls for modelRef roots using API origin and /uploads/images", async () => {
  const descriptor = createAssetDescriptor();
  const { restore } = installFetchMock(assetHandler);
  try {
    const client = createCmsClient<{ images: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const images = await client.images();
    assert.equal(images.length, 1);
    assert.equal(images[0]?.filename, "root image.png");
    assert.equal(
      images[0]?.url,
      "http://cms.local/uploads/images/root%20image.png",
    );
  } finally {
    restore();
  }
});

test("supports overriding asset url base/path and keeps explicit url values", async () => {
  const descriptor = createAssetDescriptor();
  const { restore } = installFetchMock(assetHandler);
  try {
    const client = createCmsClient<{ images: any[] }, { Image: any }>(
      descriptor,
      {
        apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
        assets: {
          baseUrl: "https://cdn.example.com",
          uploadsPath: "/media",
        },
      },
    );

    const modelList = await client.models.Image();
    assert.equal(modelList.length, 1);
    assert.equal(
      modelList[0]?.url,
      "https://cdn.example.com/media/hero%20banner.png",
    );

    const explicitUrl = await client.models.Image.byId("img-with-url");
    assert.ok(explicitUrl);
    assert.equal(explicitUrl?.url, "https://signed.example.com/custom-url.png");
  } finally {
    restore();
  }
});

test("cms0 lazily resolves browser descriptors from the sidecar before reading roots", async () => {
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const originalFetch = globalThis.fetch;
  const sidecarUrl = getCms0DescriptorSidecarUrl(
    "http://localhost:4002/api/content",
    "browser-test-key",
  );
  const descriptor: FullDescriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
        },
      },
    },
  };

  try {
    globals.window = {};
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    globalThis.fetch = async (input: string | URL | Request) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (rawUrl === sidecarUrl) {
        return new Response(JSON.stringify(descriptor), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        rawUrl ===
        "http://localhost:4002/api/content/_graph/HomePage?raw=1&locale=all&pageSize=full&resolveModelRefs=true"
      ) {
        return new Response(
          JSON.stringify({
            id: "home-1",
            headline: "Hello from cms0",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch in browser cms0 test: ${rawUrl}`);
    };

    const client = cms0<{
      HomePage: {
        headline: string;
      };
    }>({
      apiConfig: {
        baseUrl: "http://localhost:4002/api/content",
        key: "browser-test-key",
      },
    });

    const homePage = await client.HomePage();
    assert.equal(homePage.headline, "Hello from cms0");
  } finally {
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
    globalThis.fetch = originalFetch;
  }
});

test("cms0 retries once on unknown browser schema keys after sidecar-backed schema changes", async () => {
  const globals = globalThis as Omit<
    typeof globalThis,
    "window" | "EventSource"
  > & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    EventSource?: typeof EventSource;
    window?: unknown;
  };
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const originalEventSource = globals.EventSource;
  const originalFetch = globalThis.fetch;
  const sidecarUrl = getCms0DescriptorSidecarUrl(
    "http://localhost:4002/api/content",
    "browser-test-key-retry",
  );
  const sidecarEventsUrl = getCms0DescriptorSidecarEventsUrl(
    "http://localhost:4002/api/content",
    "browser-test-key-retry",
  );
  const firstDescriptor: FullDescriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
        },
      },
    },
  };
  const secondDescriptor: FullDescriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
        },
      },
      AboutUsPage: {
        type: "object",
        properties: {
          headline: { kind: "primitive", type: "string" },
        },
      },
    },
  };
  let descriptorReads = 0;

  class MockEventSource {
    constructor(public url: string) {
      void url;
    }

    addEventListener() {}
    close() {}
  }

  try {
    globals.window = {};
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    globals.EventSource = MockEventSource as unknown as typeof EventSource;
    globalThis.fetch = async (input: string | URL | Request) => {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (rawUrl === sidecarEventsUrl) {
        throw new Error("EventSource should not use fetch");
      }

      if (rawUrl === sidecarUrl) {
        const descriptor =
          descriptorReads++ === 0 ? firstDescriptor : secondDescriptor;
        return new Response(JSON.stringify(descriptor), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (
        rawUrl ===
        "http://localhost:4002/api/content/_graph/HomePage?raw=1&locale=all&pageSize=full&resolveModelRefs=true"
      ) {
        return new Response(
          JSON.stringify({
            id: "home-1",
            headline: "Home",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      if (
        rawUrl ===
        "http://localhost:4002/api/content/_graph/AboutUsPage?raw=1&locale=all&pageSize=full&resolveModelRefs=true"
      ) {
        return new Response(
          JSON.stringify({
            id: "about-1",
            headline: "About",
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }

      throw new Error(`Unexpected fetch in browser retry test: ${rawUrl}`);
    };

    const client = cms0<{
      HomePage: {
        headline: string;
      };
      AboutUsPage: {
        headline: string;
      };
    }>({
      apiConfig: {
        baseUrl: "http://localhost:4002/api/content",
        key: "browser-test-key-retry",
      },
    });

    const homePage = await client.HomePage();
    assert.equal(homePage.headline, "Home");

    const aboutPage = await client.AboutUsPage();
    assert.equal(aboutPage.headline, "About");
    assert.equal(descriptorReads, 2);
  } finally {
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
    if (typeof originalEventSource === "function") {
      globals.EventSource = originalEventSource;
    } else {
      delete globals.EventSource;
    }
    globalThis.fetch = originalFetch;
  }
});

test("normalizes localized singleton fields from inline singleton payloads", async () => {
  const descriptor = createLocalizedDescriptor();
  const { restore } = installFetchMock(localizedHandler);
  try {
    const client = createCmsClient<{ aboutUsPage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const about = await client.aboutUsPage();

    assert.equal(about.headline, "About");
    assert.equal(about.description.defaultLocale, "en");
    assert.equal(about.description.locales.en?.html, "<p>About EN</p>");
    assert.equal(about.description.locales.fr?.html, "<p>A Propos FR</p>");
  } finally {
    restore();
  }
});

test("filters localized fields by locale option recursively", async () => {
  const descriptor = createLocalizedDescriptor();
  const { calls, restore } = installFetchMock(localizedHandler);
  try {
    const client = createCmsClient<{ blogPosts: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const blogPosts = await client.blogPosts({ locale: "fr" });

    assert.equal(blogPosts.length, 1);
    assert.equal(blogPosts[0]?.title?.defaultLocale, "fr");
    assert.equal(Object.keys(blogPosts[0]?.title?.locales || {}).length, 1);
    assert.equal(blogPosts[0]?.title?.locales?.fr?.html, "<p>Titre FR</p>");
    assert.equal(blogPosts[0]?.description?.defaultLocale, "fr");
    assert.equal(
      Object.keys(blogPosts[0]?.description?.locales || {}).length,
      1,
    );
    assert.equal(blogPosts[0]?.description?.locales?.fr, "Description FR");

    const modelCall = calls.find(
      (call) => call.pathname === "/api/content/_graph/models/BlogPost/bp1",
    );
    assert.equal(modelCall?.searchParams.get("locale"), "fr");
  } finally {
    restore();
  }
});

test("keeps all locales when locale=all and when locale is omitted", async () => {
  const descriptor = createLocalizedDescriptor();
  const { restore } = installFetchMock(localizedHandler);
  try {
    const client = createCmsClient<{ blogPosts: any[] }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const allLocales = await client.blogPosts({ locale: "all" });
    assert.equal(Object.keys(allLocales[0]?.title?.locales || {}).length, 2);
    assert.equal(
      Object.keys(allLocales[0]?.description?.locales || {}).length,
      2,
    );

    const omittedLocale = await client.blogPosts();
    assert.equal(Object.keys(omittedLocale[0]?.title?.locales || {}).length, 2);
    assert.equal(omittedLocale[0]?.title?.defaultLocale, "en");
    assert.equal(
      Object.keys(omittedLocale[0]?.description?.locales || {}).length,
      2,
    );
    assert.equal(omittedLocale[0]?.description?.defaultLocale, "en");
  } finally {
    restore();
  }
});

test("filters localized singleton fields by locale", async () => {
  const descriptor = createLocalizedDescriptor();
  const { calls, restore } = installFetchMock(localizedHandler);
  try {
    const client = createCmsClient<{ aboutUsPage: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const french = await client.aboutUsPage({ locale: "fr" });
    assert.equal(french.description.defaultLocale, "fr");
    assert.equal(Object.keys(french.description.locales).length, 1);
    assert.equal(french.description.locales.fr?.html, "<p>A Propos FR</p>");

    const omittedLocale = await client.aboutUsPage();
    assert.equal(omittedLocale.description.defaultLocale, "en");
    assert.equal(Object.keys(omittedLocale.description.locales).length, 2);
    assert.equal(omittedLocale.description.locales.en?.html, "<p>About EN</p>");
    assert.equal(
      omittedLocale.description.locales.fr?.html,
      "<p>A Propos FR</p>",
    );

    const singletonCalls = calls.filter(
      (call) => call.pathname === "/api/content/_graph/aboutUsPage",
    );
    assert.equal(singletonCalls.length > 0, true);
    assert.equal(singletonCalls[0]?.searchParams.get("locale"), "fr");
    assert.equal(singletonCalls[1]?.searchParams.get("locale"), "all");
  } finally {
    restore();
  }
});

function createUnionEnumDescriptor(): FullDescriptor {
  return {
    models: {
      Image: {
        kind: "model",
        properties: {
          name: { kind: "primitive", type: "string" },
          filename: { kind: "primitive", type: "string" },
          extension: { kind: "primitive", type: "string" },
          mimeType: { kind: "primitive", type: "string" },
          size: { kind: "primitive", type: "number" },
          width: { kind: "primitive", type: "number" },
          height: { kind: "primitive", type: "number" },
        },
      },
    },
    roots: {
      settings: {
        type: "object",
        properties: {
          mode: {
            kind: "enum",
            valueType: "string",
            values: ["hey", "mark"],
          } as any,
          variant: {
            kind: "union",
            discriminator: { key: "kind" },
            anyOf: [
              {
                kind: "enum",
                valueType: "string",
                values: ["draft", "published"],
              } as any,
              {
                type: "object",
                properties: {
                  kind: {
                    kind: "enum",
                    valueType: "string",
                    values: ["image"],
                  } as any,
                  image: {
                    kind: "modelRef",
                    model: "Image",
                  },
                },
              },
            ],
          } as any,
        },
      },
    },
  };
}

function createUnionEnumHandler(descriptor: FullDescriptor): (url: URL) => any {
  const variantDescriptor = (descriptor.roots.settings as any)?.properties
    ?.variant as Extract<FieldDescriptor, { kind: "union" }>;

  return (url: URL) => {
    const path = url.pathname;

    if (path === "/api/content/_graph/settings") {
      if (url.searchParams.get("scenario") === "draft") {
        return {
          id: "settings-1",
          mode: "mark",
          variant: tagUnionBranch(variantDescriptor, 0, "draft"),
        };
      }
      return {
        id: "settings-1",
        mode: "invalid-mode",
        variant: tagUnionBranch(variantDescriptor, 1, {
          kind: "image",
          image: "img-1",
        }),
      };
    }

    if (path === "/api/content/_graph/models/Image/img-1") {
      return {
        id: "img-1",
        name: "Hero",
        filename: "hero.png",
        extension: "png",
        mimeType: "image/png",
        size: 512,
        width: 1200,
        height: 630,
      };
    }

    throw new Error(
      `Unhandled request in union/enum test mock: ${url.toString()}`,
    );
  };
}

test("normalizes enum fields and resolves union branches with inline model refs", async () => {
  const descriptor = createUnionEnumDescriptor();
  const { restore } = installFetchMock(createUnionEnumHandler(descriptor));
  try {
    const client = createCmsClient<{ settings: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
    });

    const settings = await client.settings({ includeId: true });
    assert.equal(settings.mode, "hey");
    assert.equal(settings.variant?.kind, "image");
    assert.equal(settings.variant?.image?.id, "img-1");
    assert.equal(settings.variant?.image?.filename, "hero.png");

    const settingsDraft = await client.settings({
      query: { scenario: "draft" },
    });
    assert.equal(settingsDraft.mode, "mark");
    assert.equal(settingsDraft.variant, "draft");
  } finally {
    restore();
  }
});

test("resolves custom type dependencies for inline Seo type", () => {
  const resolved = resolveCustomTypeDependencies(["Seo"]);
  assert.equal(resolved.has("Seo"), true);
  assert.equal(resolved.has("Image"), true);
});

function createSeoDescriptor(): FullDescriptor {
  return {
    models: {
      Image: customModelDescriptors.Image,
    },
    roots: {
      page: {
        type: "object",
        properties: {
          seo: customInlineDescriptors.Seo,
        },
      },
    },
  };
}

function seoHandler(url: URL) {
  const seoDescriptor = customInlineDescriptors.Seo as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const titleDescriptor = seoDescriptor.properties.title as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;
  const descriptionDescriptor = seoDescriptor.properties.description as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;
  const keywordsDescriptor = seoDescriptor.properties.keywords as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;
  const openGraphDescriptor = seoDescriptor.properties.openGraph as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphTitleDescriptor = openGraphDescriptor.properties
    .title as Extract<FieldDescriptor, { kind: "union" }>;
  const openGraphDescriptionDescriptor = openGraphDescriptor.properties
    .description as Extract<FieldDescriptor, { kind: "union" }>;
  const openGraphImageDescriptor = openGraphDescriptor.properties
    .images as Extract<FieldDescriptor, { type: "array" }>;
  const openGraphImageItemDescriptor =
    openGraphImageDescriptor.items as Extract<
      FieldDescriptor,
      { kind: "union" }
    >;
  const twitterDescriptor = seoDescriptor.properties.twitter as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const twitterTitleDescriptor = twitterDescriptor.properties.title as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;
  const twitterImageDescriptor = twitterDescriptor.properties.images as Extract<
    FieldDescriptor,
    { type: "array" }
  >;
  const twitterImageItemDescriptor = twitterImageDescriptor.items as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;

  if (url.pathname === "/api/content/_graph/page") {
    return {
      id: "page-1",
      seo: {
        title: tagUnionBranch(titleDescriptor, 0, {
          defaultLocale: "en",
          locales: {
            en: "Home",
            ar: "الرئيسية",
          },
        }),
        description: tagUnionBranch(descriptionDescriptor, 0, {
          defaultLocale: "en",
          locales: {
            en: "Home page description",
            ar: "وصف الصفحة الرئيسية",
          },
        }),
        keywords: tagUnionBranch(keywordsDescriptor, 0, {
          defaultLocale: "en",
          locales: {
            en: "cms, content, seo",
            ar: "محتوى, سيو",
          },
        }),
        canonical: "https://example.com/home",
        robots: {
          index: true,
          follow: true,
        },
        alternates: {
          canonical: "https://example.com/home",
          languages: {
            en: "https://example.com/en/home",
            ar: "https://example.com/ar/home",
          },
        },
        openGraph: {
          type: "website",
          title: tagUnionBranch(openGraphTitleDescriptor, 0, {
            defaultLocale: "en",
            locales: {
              en: "Home OG",
              ar: "الرئيسية OG",
            },
          }),
          description: tagUnionBranch(
            openGraphDescriptionDescriptor,
            1,
            "Open graph description",
          ),
          alternateLocale: [],
          images: [
            tagUnionBranch(
              openGraphImageItemDescriptor,
              1,
              "https://cdn.example.com/social-cover.jpg",
            ),
            tagUnionBranch(openGraphImageItemDescriptor, 0, "img-og-1"),
          ],
        },
        twitter: {
          card: "summary_large_image",
          title: tagUnionBranch(twitterTitleDescriptor, 1, "Twitter title"),
          images: [
            tagUnionBranch(twitterImageItemDescriptor, 0, "img-twitter-1"),
          ],
        },
        jsonLd: [],
      },
    };
  }

  if (url.pathname === "/api/content/_graph/models/Image/img-og-1") {
    return {
      id: "img-og-1",
      name: "Open Graph Image",
      filename: "og-image.png",
      extension: "png",
      mimeType: "image/png",
      size: 1234,
      width: 1200,
      height: 630,
    };
  }

  if (url.pathname === "/api/content/_graph/models/Image/img-twitter-1") {
    return {
      id: "img-twitter-1",
      name: "Twitter Image",
      filename: "twitter-image.png",
      extension: "png",
      mimeType: "image/png",
      size: 678,
      width: 1200,
      height: 630,
    };
  }

  throw new Error(`Unhandled request in seo test mock: ${url.toString()}`);
}

function seoUnionPlainStringHandler(url: URL) {
  const seoDescriptor = customInlineDescriptors.Seo as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphDescriptor = seoDescriptor.properties.openGraph as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphImageDescriptor = openGraphDescriptor.properties
    .images as Extract<FieldDescriptor, { type: "array" }>;
  const openGraphImageItemDescriptor =
    openGraphImageDescriptor.items as Extract<
      FieldDescriptor,
      { kind: "union" }
    >;
  const twitterDescriptor = seoDescriptor.properties.twitter as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const twitterImageDescriptor = twitterDescriptor.properties.images as Extract<
    FieldDescriptor,
    { type: "array" }
  >;
  const twitterImageItemDescriptor = twitterImageDescriptor.items as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;

  if (url.pathname === "/api/content/_graph/page") {
    return {
      id: "page-1",
      seo: {
        title: null,
        description: null,
        keywords: null,
        canonical: null,
        robots: null,
        alternates: {},
        openGraph: {
          images: [
            tagUnionBranch(
              openGraphImageItemDescriptor,
              1,
              "updated-union-token",
            ),
          ],
          alternateLocale: [],
        },
        twitter: {
          images: [
            tagUnionBranch(
              twitterImageItemDescriptor,
              1,
              "updated-union-token-twitter",
            ),
          ],
        },
        jsonLd: [],
      },
    };
  }

  if (url.pathname.startsWith("/api/content/models/Image/")) {
    throw new Error(`Unexpected image model fetch: ${url.toString()}`);
  }

  throw new Error(
    `Unhandled request in seo plain string test mock: ${url.toString()}`,
  );
}

function seoUnionUuidStringHandler(url: URL) {
  const imageId = "11111111-1111-1111-1111-111111111111";
  const seoDescriptor = customInlineDescriptors.Seo as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphDescriptor = seoDescriptor.properties.openGraph as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphImageDescriptor = openGraphDescriptor.properties
    .images as Extract<FieldDescriptor, { type: "array" }>;
  const openGraphImageItemDescriptor =
    openGraphImageDescriptor.items as Extract<
      FieldDescriptor,
      { kind: "union" }
    >;

  if (url.pathname === "/api/content/_graph/page") {
    return {
      id: "page-1",
      seo: {
        title: null,
        description: null,
        keywords: null,
        canonical: null,
        robots: null,
        alternates: {},
        openGraph: {
          images: [tagUnionBranch(openGraphImageItemDescriptor, 0, imageId)],
          alternateLocale: [],
        },
        twitter: { images: [] },
        jsonLd: [],
      },
    };
  }

  if (url.pathname === `/api/content/_graph/models/Image/${imageId}`) {
    return {
      id: imageId,
      name: "Seo Union Image",
      filename: "seo-union-image.png",
      extension: "png",
      mimeType: "image/png",
      size: 123,
      width: 1200,
      height: 630,
    };
  }

  throw new Error(
    `Unhandled request in seo uuid string test mock: ${url.toString()}`,
  );
}

function seoResolvedIncludeIdWrapperHandler(url: URL) {
  const seoDescriptor = customInlineDescriptors.Seo as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphDescriptor = seoDescriptor.properties.openGraph as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const openGraphImageDescriptor = openGraphDescriptor.properties
    .images as Extract<FieldDescriptor, { type: "array" }>;
  const openGraphImageItemDescriptor =
    openGraphImageDescriptor.items as Extract<
      FieldDescriptor,
      { kind: "union" }
    >;
  const twitterDescriptor = seoDescriptor.properties.twitter as Extract<
    FieldDescriptor,
    { type: "object" }
  >;
  const twitterImageDescriptor = twitterDescriptor.properties.images as Extract<
    FieldDescriptor,
    { type: "array" }
  >;
  const twitterImageItemDescriptor = twitterImageDescriptor.items as Extract<
    FieldDescriptor,
    { kind: "union" }
  >;

  if (url.pathname === "/api/content/_graph/page") {
    return {
      id: "page-1",
      seo: {
        id: "seo-1",
        title: null,
        description: null,
        keywords: null,
        canonical: null,
        robots: null,
        alternates: {},
        openGraph: {
          id: "seo-og-1",
          type: "article",
          images: [
            {
              id: "row-og-image-1",
              value: tagUnionBranch(openGraphImageItemDescriptor, 0, {
                id: "img-og-resolved-1",
                name: "Resolved OG Image",
                filename: "resolved-og-image.png",
                extension: "png",
                mimeType: "image/png",
                size: 111,
                width: 1200,
                height: 630,
              }),
            },
            {
              id: "row-og-image-2",
              value: tagUnionBranch(
                openGraphImageItemDescriptor,
                1,
                "https://cdn.example.com/og-inline.jpg",
              ),
            },
          ],
          alternateLocale: [
            { id: "row-og-locale-1", value: "en-US" },
            { id: "row-og-locale-2", value: "ar-AE" },
          ],
        },
        twitter: {
          id: "seo-twitter-1",
          card: "summary_large_image",
          images: [
            {
              id: "row-twitter-image-1",
              value: tagUnionBranch(twitterImageItemDescriptor, 0, {
                id: "img-twitter-resolved-1",
                name: "Resolved Twitter Image",
                filename: "resolved-twitter-image.png",
                extension: "png",
                mimeType: "image/png",
                size: 222,
                width: 1200,
                height: 630,
              }),
            },
            {
              id: "row-twitter-image-2",
              value: tagUnionBranch(
                twitterImageItemDescriptor,
                1,
                "https://cdn.example.com/twitter-inline.jpg",
              ),
            },
          ],
        },
        jsonLd: [],
      },
    };
  }

  if (url.pathname.startsWith("/api/content/models/Image/")) {
    throw new Error(
      `Unexpected image model fetch in _graph includeId test: ${url.toString()}`,
    );
  }

  throw new Error(
    `Unhandled request in seo _graph includeId test mock: ${url.toString()}`,
  );
}

test("maps Seo custom type into Next metadata helpers with locale fallback", async () => {
  const descriptor = createSeoDescriptor();
  const { restore } = installFetchMock(seoHandler);
  try {
    const client = createCmsClient<{ page: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const page = await client.page();
    assert.equal(page.seo.title.defaultLocale, "en");
    assert.equal(page.seo.openGraph.images.length, 2);
    assert.equal(typeof page.seo.openGraph.images[1]?.url, "string");

    const metadata = toNextMetadata(page.seo, {
      locale: "ar",
      defaultLocale: "en",
    });

    assert.equal(metadata.title, "الرئيسية");
    assert.equal(metadata.description, "وصف الصفحة الرئيسية");
    assert.deepEqual(metadata.keywords, ["محتوى", "سيو"]);
    assert.deepEqual(metadata.robots, {
      index: true,
      follow: true,
      nocache: false,
    });
    assert.deepEqual((metadata as any).alternates, {
      canonical: "https://example.com/home",
      languages: {
        en: "https://example.com/en/home",
        ar: "https://example.com/ar/home",
      },
    });

    assert.equal((metadata as any).openGraph?.title, "الرئيسية OG");
    assert.deepEqual((metadata as any).openGraph?.images, [
      "https://cdn.example.com/social-cover.jpg",
      "http://cms.local/uploads/images/og-image.png",
    ]);
    assert.deepEqual((metadata as any).twitter?.images, [
      "http://cms.local/uploads/images/twitter-image.png",
    ]);
  } finally {
    restore();
  }
});

test("keeps non-UUID string unions as primitive strings for Seo image arrays", async () => {
  const descriptor = createSeoDescriptor();
  const { calls, restore } = installFetchMock(seoUnionPlainStringHandler);
  try {
    const client = createCmsClient<{ page: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const page = await client.page();
    assert.equal(page.seo.openGraph.images[0], "updated-union-token");
    assert.equal(page.seo.twitter.images[0], "updated-union-token-twitter");

    const metadata = toNextMetadata(page.seo, {
      locale: "en",
      defaultLocale: "en",
    });
    assert.deepEqual((metadata as any).robots, {
      index: false,
      follow: false,
      nocache: false,
    });
    assert.deepEqual((metadata as any).openGraph?.images, [
      "updated-union-token",
    ]);
    assert.deepEqual((metadata as any).twitter?.images, [
      "updated-union-token-twitter",
    ]);

    const imageModelCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/models/Image/"),
    );
    assert.equal(imageModelCalls.length, 0);
  } finally {
    restore();
  }
});

test("resolves modelRef union branches for Seo image arrays", async () => {
  const descriptor = createSeoDescriptor();
  const { calls, restore } = installFetchMock(seoUnionUuidStringHandler);
  try {
    const client = createCmsClient<{ page: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
    });

    const page = await client.page();
    assert.equal(typeof page.seo.openGraph.images[0], "object");
    assert.equal(page.seo.openGraph.images[0]?.filename, "seo-union-image.png");

    const metadata = toNextMetadata(page.seo, {
      locale: "en",
      defaultLocale: "en",
    });
    assert.deepEqual((metadata as any).robots, {
      index: false,
      follow: false,
      nocache: false,
    });
    assert.deepEqual((metadata as any).openGraph?.images, [
      "http://cms.local/uploads/images/seo-union-image.png",
    ]);

    const imageModelCalls = calls.filter(
      (call) =>
        call.pathname ===
        "/api/content/_graph/models/Image/11111111-1111-1111-1111-111111111111",
    );
    assert.equal(imageModelCalls.length, 1);
  } finally {
    restore();
  }
});

test("handles resolved union modelRef objects and includeId wrappers in Seo metadata mapping", async () => {
  const descriptor = createSeoDescriptor();
  const { calls, restore } = installFetchMock(
    seoResolvedIncludeIdWrapperHandler,
  );
  try {
    const client = createCmsClient<{ page: any }>(descriptor, {
      apiConfig: { baseUrl: "http://cms.local/api/content", key: "k1" },
      defaultLocale: "en",
      includeId: true,
    });

    const page = await client.page();
    assert.equal(page.seo.openGraph.type, "article");
    assert.equal(page.seo.twitter.card, "summary_large_image");
    assert.equal(typeof page.seo.openGraph.images[0], "object");
    assert.equal(
      page.seo.openGraph.images[0]?.filename,
      "resolved-og-image.png",
    );
    assert.deepEqual(page.seo.openGraph.images[1], {
      id: "row-og-image-2",
      value: "https://cdn.example.com/og-inline.jpg",
    });

    const metadata = toNextMetadata(page.seo, {
      locale: "en",
      defaultLocale: "en",
    });
    assert.deepEqual((metadata as any).robots, {
      index: false,
      follow: false,
      nocache: false,
    });

    assert.deepEqual((metadata as any).openGraph?.images, [
      "http://cms.local/uploads/images/resolved-og-image.png",
      "https://cdn.example.com/og-inline.jpg",
    ]);
    assert.deepEqual((metadata as any).openGraph?.alternateLocale, [
      "en-US",
      "ar-AE",
    ]);
    assert.deepEqual((metadata as any).twitter?.images, [
      "http://cms.local/uploads/images/resolved-twitter-image.png",
      "https://cdn.example.com/twitter-inline.jpg",
    ]);

    const resolvedCalls = calls.filter(
      (call) => call.pathname === "/api/content/_graph/page",
    );
    assert.equal(resolvedCalls.length, 1);
    const imageModelCalls = calls.filter((call) =>
      call.pathname.startsWith("/api/content/models/Image/"),
    );
    assert.equal(imageModelCalls.length, 0);
  } finally {
    restore();
  }
});

test("resolveLocalized prefers requested locale then default fallback", () => {
  const value = {
    defaultLocale: "en",
    locales: {
      en: "Hello",
      ar: "مرحبا",
    },
  };

  assert.equal(resolveLocalized(value, { locale: "ar" }), "مرحبا");
  assert.equal(
    resolveLocalized(value, { locale: "fr", defaultLocale: "en" }),
    "Hello",
  );
  assert.equal(
    resolveLocalized("Direct value", { locale: "ar" }),
    "Direct value",
  );
});
