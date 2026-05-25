# Custom Types

Custom types are built-in model-like types shipped with `@cms0/cms0`. They behave
just like models: they create tables, show up in model refs, and can be used in
the schema by importing them from `@cms0/cms0/custom-types`.

## File

```ts
type File = {
  name: string;
  filename: string;
  extension: string;
  mimeType: string;
  size: number;
};
```

## Image

```ts
type Image = File & {
  width: number;
  height: number;
  alt?: string;
};
```

## Video

```ts
type Video = File & {
  width: number;
  height: number;
  length: number;
  alt?: string;
};
```

## RichText

```ts
type RichText = {
  value: Record<string, any>;
  html: string;
};
```

## LocalizedString

```ts
type Localized<T> = {
  defaultLocale: string;
  locales: Record<string, T>;
};

type LocalizedString = Localized<string>;
```

## LocalizedRichText

```ts
type LocalizedRichText = Localized<{
  value: Record<string, any>;
  html: string;
}>;
```

## Seo

```ts
type Seo = {
  title?: LocalizedString | string;
  description?: LocalizedString | string;
  keywords?: LocalizedString | string[];
  canonical?: string;
  robots?: {
    index?: boolean;
    follow?: boolean;
    nocache?: boolean;
  };
  alternates?: {
    canonical?: string;
    languages?: Record<string, string>;
  };
  openGraph?: {
    type?: "website" | "article" | "profile";
    url?: string;
    siteName?: string;
    title?: LocalizedString | string;
    description?: LocalizedString | string;
    images?: Array<Image | string>;
    locale?: string;
    alternateLocale?: string[];
  };
  twitter?: {
    card?: "summary" | "summary_large_image" | "app" | "player";
    site?: string;
    creator?: string;
    title?: LocalizedString | string;
    description?: LocalizedString | string;
    images?: Array<Image | string>;
  };
  jsonLd?: Record<string, unknown>[];
};
```

## Usage

```ts
import {
  Image,
  LocalizedString,
  LocalizedRichText,
  Seo,
} from "@cms0/cms0/custom-types";

type RootSchema = {
  images: Image[];
  title: LocalizedString;
  body: LocalizedRichText;
  seo: Seo;
};
```
