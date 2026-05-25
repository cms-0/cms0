import type {
  Image,
  LocalizedString,
  Seo,
  SeoOpenGraph,
  SeoTwitter,
} from "./custom-types/index.js";

export type ResolveLocalizedOptions = {
  locale?: string;
  defaultLocale?: string;
  fallbackLocale?: string;
};

export type ToNextMetadataOptions = ResolveLocalizedOptions;

type LocalizedLike = {
  defaultLocale?: unknown;
  locales?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function unwrapMetadataValue(value: unknown): unknown {
  let current = value;

  for (let index = 0; index < 6; index++) {
    if (!isRecord(current)) return current;

    const source = current as Record<string, unknown>;
    if ("__cms0Union" in source && "value" in source) {
      current = source.value;
      continue;
    }

    if ("value" in source) {
      const keys = Object.keys(source);
      const isIdValueWrapper = keys.every(
        (key) => key === "id" || key === "value" || key === "__cms0Union",
      );
      if (isIdValueWrapper) {
        current = source.value;
        continue;
      }
    }

    return current;
  }

  return current;
}

function resolveTextValue(value: unknown): string | undefined {
  return normalizeText(unwrapMetadataValue(value));
}

function uniqueNonEmpty(values: Array<string | undefined>): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (!trimmed || result.includes(trimmed)) continue;
    result.push(trimmed);
  }
  return result;
}

function isLocalizedLike(value: unknown): value is LocalizedLike {
  if (!isRecord(value)) return false;
  return "locales" in value && isRecord(value.locales);
}

function localizedValueForLocale(
  locales: Record<string, unknown>,
  locale: string,
): string | undefined {
  const entry = locales[locale];
  return resolveTextValue(entry);
}

export function resolveLocalized(
  value: LocalizedString | string | undefined | null,
  options: ResolveLocalizedOptions = {},
): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (!isLocalizedLike(value)) {
    return undefined;
  }

  const locales = value.locales as Record<string, unknown>;
  const localeKeys = Object.keys(locales);
  const preferredLocales = uniqueNonEmpty([
    options.locale,
    typeof value.defaultLocale === "string" ? value.defaultLocale : undefined,
    options.defaultLocale,
    options.fallbackLocale,
    ...localeKeys,
  ]);

  for (const locale of preferredLocales) {
    const resolved = localizedValueForLocale(locales, locale);
    if (resolved) return resolved;
  }

  return undefined;
}

function resolveKeywords(
  value: Seo["keywords"],
  options: ResolveLocalizedOptions,
): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value.map((entry) => resolveTextValue(entry)).filter(Boolean) as string[];
    return list.length ? list : undefined;
  }

  const localized = resolveLocalized(value as LocalizedString | string | undefined, options);
  if (!localized) return undefined;

  const parts = localized
    .split(/[;,]/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (parts.length > 0) {
    return parts;
  }

  return [localized];
}

function resolveImageUrl(image: Image | string): string | undefined {
  const unwrapped = unwrapMetadataValue(image);
  if (typeof unwrapped === "string") {
    return normalizeText(unwrapped);
  }
  if (!isRecord(unwrapped)) return undefined;
  return resolveTextValue(unwrapped.url);
}

function normalizeRobots(robots: Seo["robots"]): Record<string, boolean> {
  const source = isRecord(robots) ? robots : {};
  return {
    index: typeof source.index === "boolean" ? source.index : false,
    follow: typeof source.follow === "boolean" ? source.follow : false,
    nocache: typeof source.nocache === "boolean" ? source.nocache : false,
  };
}

function hasAnyKeys(value: Record<string, unknown>): boolean {
  return Object.keys(value).length > 0;
}

export function toOpenGraph(
  value: SeoOpenGraph | undefined,
  options: ResolveLocalizedOptions = {},
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;

  const openGraph: Record<string, unknown> = {};
  const type = normalizeText(value.type);
  if (type) openGraph.type = type;

  const url = normalizeText(value.url);
  if (url) openGraph.url = url;

  const siteName = normalizeText(value.siteName);
  if (siteName) openGraph.siteName = siteName;

  const title = resolveLocalized(value.title, options);
  if (title) openGraph.title = title;

  const description = resolveLocalized(value.description, options);
  if (description) openGraph.description = description;

  if (Array.isArray(value.images)) {
    const images = value.images
      .map((image) => resolveImageUrl(image))
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (images.length) {
      openGraph.images = images;
    }
  }

  const locale = normalizeText(value.locale);
  if (locale) openGraph.locale = locale;

  if (Array.isArray(value.alternateLocale)) {
    const alternateLocale = value.alternateLocale
      .map((entry) => resolveTextValue(entry))
      .filter((entry): entry is string => Boolean(entry));
    if (alternateLocale.length) {
      openGraph.alternateLocale = alternateLocale;
    }
  }

  return hasAnyKeys(openGraph) ? openGraph : undefined;
}

export function toTwitter(
  value: SeoTwitter | undefined,
  options: ResolveLocalizedOptions = {},
): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;

  const twitter: Record<string, unknown> = {};
  const card = normalizeText(value.card);
  if (card) twitter.card = card;

  const site = normalizeText(value.site);
  if (site) twitter.site = site;

  const creator = normalizeText(value.creator);
  if (creator) twitter.creator = creator;

  const title = resolveLocalized(value.title, options);
  if (title) twitter.title = title;

  const description = resolveLocalized(value.description, options);
  if (description) twitter.description = description;

  if (Array.isArray(value.images)) {
    const images = value.images
      .map((image) => resolveImageUrl(image))
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    if (images.length) {
      twitter.images = images;
    }
  }

  return hasAnyKeys(twitter) ? twitter : undefined;
}

function resolveAlternates(
  seo: Seo,
): Record<string, unknown> | undefined {
  const alternates: Record<string, unknown> = {};

  const canonical =
    normalizeText(seo.alternates?.canonical) ?? normalizeText(seo.canonical);
  if (canonical) {
    alternates.canonical = canonical;
  }

  if (isRecord(seo.alternates?.languages)) {
    const languages: Record<string, string> = {};
    for (const [locale, rawValue] of Object.entries(seo.alternates.languages)) {
      const normalizedLocale = normalizeText(locale);
      const normalizedUrl = normalizeText(rawValue);
      if (!normalizedLocale || !normalizedUrl) continue;
      languages[normalizedLocale] = normalizedUrl;
    }
    if (Object.keys(languages).length) {
      alternates.languages = languages;
    }
  }

  return hasAnyKeys(alternates) ? alternates : undefined;
}

/**
 * Maps a CMS0 `Seo` object to a Next.js-compatible metadata shape.
 *
 * The return type is generic so consumers can pass Next's `Metadata` type:
 * `toNextMetadata<Metadata>(seo, { locale })`.
 */
export function toNextMetadata<TMetadata extends Record<string, unknown> = Record<string, unknown>>(
  seo: Seo | undefined | null,
  options: ToNextMetadataOptions = {},
): TMetadata {
  if (!isRecord(seo)) {
    return {} as TMetadata;
  }

  const metadata: Record<string, unknown> = {};

  const title = resolveLocalized(seo.title, options);
  if (title) metadata.title = title;

  const description = resolveLocalized(seo.description, options);
  if (description) metadata.description = description;

  const keywords = resolveKeywords(seo.keywords, options);
  if (keywords?.length) metadata.keywords = keywords;

  metadata.robots = normalizeRobots(seo.robots);

  const alternates = resolveAlternates(seo);
  if (alternates) metadata.alternates = alternates;

  const openGraph = toOpenGraph(seo.openGraph, options);
  if (openGraph) metadata.openGraph = openGraph;

  const twitter = toTwitter(seo.twitter, options);
  if (twitter) metadata.twitter = twitter;

  return metadata as TMetadata;
}
