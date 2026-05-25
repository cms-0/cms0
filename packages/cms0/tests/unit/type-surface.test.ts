import {
  cms0,
  type Cms0InferDescriptorModels,
  type Cms0InferDescriptorRoots,
  type CmsInstance,
  type CmsQuery,
} from "../../src/index.js";
import { expect, test } from "vitest";

type TypeSurfaceRoots = {
  HomePage: {
    author: {
      name: string;
      title: string;
    };
    headline: string;
    testimonials: Array<{
      quote: string;
    }>;
    title: string;
  };
};

const generatedTypeDescriptor = {
  models: {
    GeneratedPost: {
      properties: {
        title: {
          kind: "primitive",
          type: "string",
          optional: false,
          nullable: false,
        },
        tags: {
          type: "array",
          optional: false,
          nullable: false,
          items: {
            kind: "primitive",
            type: "string",
            optional: false,
            nullable: false,
          },
        },
      },
    },
  },
  roots: {
    GeneratedPage: {
      type: "object",
      optional: false,
      nullable: false,
      properties: {
        title: {
          kind: "primitive",
          type: "string",
          optional: false,
          nullable: false,
        },
        posts: {
          type: "array",
          optional: false,
          nullable: false,
          items: {
            kind: "modelRef",
            model: "GeneratedPost",
            optional: false,
            nullable: false,
          },
        },
      },
    },
  },
} as const;

type TestGeneratedModels = Cms0InferDescriptorModels<
  typeof generatedTypeDescriptor.models
>;
type TestGeneratedRoots = Cms0InferDescriptorRoots<
  typeof generatedTypeDescriptor.roots,
  TestGeneratedModels
>;

declare module "../../src/index.js" {
  interface Cms0GeneratedTypes {
    models: TestGeneratedModels;
    roots: TestGeneratedRoots;
  }
}

declare const data: CmsInstance<TypeSurfaceRoots, Record<string, never>, true>;

if (false) {
  const sdkData = cms0<TypeSurfaceRoots>({
    apiConfig: {
      baseUrl: "http://cms.local/api/content",
      key: "key",
    },
    includeId: true,
  });

  sdkData.HomePage.update({ title: "Partial root update is valid" });
  sdkData.HomePage.author.name.update("Primitive field update is valid");
  sdkData.HomePage.testimonials.at(0).quote.update("Array item chaining is valid");
  sdkData.HomePage({
    graph: {
      page: 2,
      pageSize: 10,
      orderBy: "title",
      orderDir: "desc",
      search: "hero",
      maxDepth: 4,
      paths: {
        testimonials: {
          page: 1,
          pageSize: "full",
          orderBy: "quote",
          orderDir: "asc",
          fields: ["quote"],
          exclude: "id",
        },
      },
    },
  });

  const generatedData = cms0({
    apiConfig: {
      baseUrl: "http://cms.local/api/content",
      key: "key",
    },
  });

  generatedData.GeneratedPage({ includeId: false }).then((value) => {
    value.title.toUpperCase();
    value.posts.at(0)?.tags.at(0)?.toUpperCase();
  });
  generatedData.models.GeneratedPost({ includeId: false }).then((posts) => {
    posts.at(0)?.title.toUpperCase();
  });
  generatedData.models.GeneratedPost.create({
    tags: ["launch"],
    title: "Typed generated model",
  });

  // @ts-expect-error generated models only expose descriptor model keys
  generatedData.models.MissingModel;

  const query: CmsQuery = {
    raw: 1,
    scenario: "draft",
  };
  void query;

  const seoOnly = sdkData.HomePage({
    fields: "author",
    includeId: false,
    graph: { pageSize: "full" },
  });
  seoOnly.then((value) => value.author.name);

  data.HomePage.update({ title: "Partial root update is valid" });
  data.HomePage.author.name.update("Primitive field update is valid");
  data.HomePage.author.name.set("Primitive field set is valid");
  data.HomePage.author.update({ name: "Nested object patch is valid" });
  data.HomePage.testimonials.at(0).quote.update("Array item chaining is valid");
  data.HomePage.testimonials.append({ quote: "Array append is valid" });

  // @ts-expect-error primitive fields do not expose descriptor child chains
  data.HomePage.title.slug;

  // @ts-expect-error primitive field updates accept the primitive value shape
  data.HomePage.author.name.update({ name: "invalid" });

  // @ts-expect-error array fields must append item values, not arbitrary objects
  data.HomePage.testimonials.append({ title: "invalid" });

  // @ts-expect-error accessor ordering only supports ascending or descending
  data.HomePage({ graph: { orderDir: "sideways" } });

  // @ts-expect-error graph path overrides only accept known array field paths
  data.HomePage({ graph: { paths: { author: { pageSize: 5 } } } });
}

test("cms0 type-surface compile assertions are included", () => {
  expect(typeof cms0).toBe("function");
});
