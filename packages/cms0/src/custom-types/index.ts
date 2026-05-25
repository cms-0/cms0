export type FileBase = {
  name: string;
  filename: string;
  storageKey?: string;
  url?: string;
  extension: string;
  mimeType: string;
  size: number;
};

export type File = FileBase;

export type Image = FileBase & {
  width: number;
  height: number;
  alt?: string;
};

export type Video = FileBase & {
  width: number;
  height: number;
  length: number;
  alt?: string;
};

export type RichText = {
  value: Record<string, any>;
  html: string;
};

export type Localized<T> = {
  defaultLocale: string;
  locales: Record<string, T>;
};

export type LocalizedString = Localized<string>;

export type LocalizedRichText = Localized<RichText>;

export type SeoRobots = {
  index?: boolean;
  follow?: boolean;
  nocache?: boolean;
};

export type SeoAlternates = {
  canonical?: string;
  languages?: Record<string, string>;
};

export type SeoOpenGraph = {
  type?: "website" | "article" | "profile";
  url?: string;
  siteName?: string;
  title?: LocalizedString | string;
  description?: LocalizedString | string;
  images?: Array<Image | string>;
  locale?: string;
  alternateLocale?: string[];
};

export type SeoTwitter = {
  card?: "summary" | "summary_large_image" | "app" | "player";
  site?: string;
  creator?: string;
  title?: LocalizedString | string;
  description?: LocalizedString | string;
  images?: Array<Image | string>;
};

export type Seo = {
  title?: LocalizedString | string;
  description?: LocalizedString | string;
  keywords?: LocalizedString | string[];
  canonical?: string;
  robots?: SeoRobots;
  alternates?: SeoAlternates;
  openGraph?: SeoOpenGraph;
  twitter?: SeoTwitter;
  jsonLd?: Record<string, unknown>[];
};
