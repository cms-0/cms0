import { resolveLocalized } from "@cms0/cms0";

import type {
  LocalizedRichText,
  LocalizedString,
  RichText,
} from "@cms0/cms0/custom-types";

const DEFAULT_LOCALE = "en";

export function text(value: LocalizedString | string | undefined, fallback = "") {
  return resolveLocalized(value, {
    locale: DEFAULT_LOCALE,
    defaultLocale: DEFAULT_LOCALE,
  }) ?? fallback;
}

export function richHtml(value: LocalizedRichText | RichText | string | undefined) {
  if (!value) return undefined;

  if (typeof value === "string") {
    return `<p>${escapeHtml(value)}</p>`;
  }

  if ("html" in value) {
    return value.html;
  }

  const localeValue =
    value.locales[DEFAULT_LOCALE] ??
    value.locales[value.defaultLocale] ??
    Object.values(value.locales)[0];

  return localeValue?.html;
}

export function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
