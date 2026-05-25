# @cms0/cms0

Typed client + schema tooling for cms0.

## Install

```bash
pnpm add @cms0/cms0
```

## Usage

```ts
import { cms0, toNextMetadata } from "@cms0/cms0";
import type { Metadata } from "next";
import type { Image, Seo } from "@cms0/cms0/custom-types";

type RootSchema = {
  homePage: {
    heroImage: Image;
    seo: Seo;
  };
};

export const data = cms0<RootSchema>({
  apiConfig: {
    baseUrl: import.meta.env.VITE_CMS0_API_BASEURL,
    key: import.meta.env.VITE_CMS0_API_KEY,
  },
});

const page = await data.homePage();
const metadata = toNextMetadata<Metadata>(page.seo, { locale: "en" });
```

`VITE_CMS0_API_BASEURL` should point at the content runtime root, for example
`http://localhost:3000/api/content` for self-hosted or
`http://localhost:3001/api/content/stage` for a website environment path.

## Accessor Options

All root/model accessors accept options:

```ts
await data.homePage({
  includeId: true,
  locale: "en",
  fields: ["heroImage", "seo.openGraph.images"],
  exclude: ["seo.jsonLd"],
  graph: {
    pageSize: "full",
    paths: {
      "seo.openGraph.images": { pageSize: 50 },
    },
  },
  query: { raw: 1 },
});
```

- `fields`: recursive include projection (supports nested paths like `a.b.c`).
- `exclude`: recursive remove projection (also supports nested paths).
- `graph`: resolved graph read controls. Global `page`, `pageSize`, `orderBy`, `orderDir`, and `search` apply recursively to graph-backed arrays. The SDK defaults graph `pageSize` to `"full"` for resolved root reads. Use `graph.paths` for dot-path overrides.
- `query`: passthrough query params to API.

## Custom Types

See `CUSTOM_TYPES.md` for the built-in custom types you can reference.
