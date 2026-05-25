"use client";

import * as React from "react";

import { Plus, Trash } from "lucide-react";

import { Badge } from "../badge";
import { Button } from "../button";
import { FieldLabel } from "../field";
import { Input } from "../input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import { RichTextEditorField } from "./rich-text-editor-field";
import { toTitle } from "./helpers";

const normalizeLocaleCode = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const LOCALIZED_LOCALE_OPTIONS = [
  "en",
  "en-US",
  "en-GB",
  "fr",
  "es",
  "de",
  "it",
  "pt",
  "pt-BR",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "tr",
  "ru",
  "uk",
  "ar",
  "he",
  "zh",
  "zh-CN",
  "zh-TW",
  "ja",
  "ko",
  "hi",
  "th",
  "vi",
  "id",
];

const getLocaleLabel = (locale: string) => {
  if (typeof Intl !== "undefined" && (Intl as any).DisplayNames) {
    try {
      const display = new (Intl as any).DisplayNames(undefined, {
        type: "language",
      });
      const label = display.of(locale);
      if (label) return `${label} (${locale})`;
    } catch {
      // ignore display-name errors
    }
  }
  return locale;
};

type RichTextLocaleEntry = {
  html: string;
  value?: unknown;
};

type LocalizedRichTextValue = {
  defaultLocale: string;
  locales: Record<string, RichTextLocaleEntry>;
};

const VIEWPORT_LOCALES = ["desktop", "mobile", "tablet"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isViewportLocaleObject = (value: Record<string, unknown>): boolean =>
  VIEWPORT_LOCALES.some((key) => Object.hasOwn(value, key));

const readLocalizedRichTextValue = (value: unknown): LocalizedRichTextValue => {
  if (!isRecord(value)) {
    return {
      defaultLocale: "en",
      locales: {
        en: {
          html: "",
          value: {
            type: "doc",
            content: [],
          },
        },
      },
    };
  }

  // Handle viewport-based locales (desktop/mobile/tablet) directly on the object
  // This is used for responsive breakpoints in LocalizedRichText fields
  if (isViewportLocaleObject(value)) {
    const entries = VIEWPORT_LOCALES.flatMap((locale) => {
      const localeValue = value[locale];
      if (!isRecord(localeValue)) {
        return [];
      }
      const html = typeof localeValue.html === "string" ? localeValue.html : "";
      const rawValue = Object.hasOwn(localeValue, "value")
        ? localeValue.value
        : { type: "doc", content: [] };
      return [[locale, { html, value: rawValue }] as const];
    });

    const locales = Object.fromEntries(entries);
    const defaultLocale = Object.hasOwn(locales, "desktop")
      ? "desktop"
      : (entries[0]?.[0] ?? "desktop");

    if (entries.length === 0) {
      return {
        defaultLocale: "desktop",
        locales: {
          desktop: {
            html: "",
            value: {
              type: "doc",
              content: [],
            },
          },
        },
      };
    }

    return {
      defaultLocale,
      locales,
    };
  }

  // Handle traditional language-based locales wrapped in a 'locales' property
  if (!isRecord(value.locales)) {
    return {
      defaultLocale: "en",
      locales: {
        en: {
          html: "",
          value: {
            type: "doc",
            content: [],
          },
        },
      },
    };
  }

  const entries = Object.entries(value.locales).flatMap(
    ([locale, localeValue]) => {
      if (!locale.trim().length || !isRecord(localeValue)) {
        return [];
      }
      const html = typeof localeValue.html === "string" ? localeValue.html : "";
      const rawValue = Object.hasOwn(localeValue, "value")
        ? localeValue.value
        : { type: "doc", content: [] };
      return [[locale, { html, value: rawValue }] as const];
    },
  );

  const locales = Object.fromEntries(entries);
  const defaultLocale =
    typeof value.defaultLocale === "string" &&
    Object.hasOwn(locales, value.defaultLocale)
      ? value.defaultLocale
      : (entries[0]?.[0] ?? "en");

  if (entries.length === 0) {
    return {
      defaultLocale: "en",
      locales: {
        en: {
          html: "",
          value: {
            type: "doc",
            content: [],
          },
        },
      },
    };
  }

  return {
    defaultLocale,
    locales,
  };
};

type LocalizedRichTextFieldProps = {
  disabled?: boolean;
  label: string;
  onChange: (value: unknown) => void;
  requiredIndicator?: boolean;
  value: unknown;
};

export function LocalizedRichTextField({
  disabled = false,
  label,
  onChange,
  requiredIndicator,
  value,
}: Readonly<LocalizedRichTextFieldProps>) {
  const localizedValue = readLocalizedRichTextValue(value);
  const latestLocalizedValueRef = React.useRef(localizedValue);
  latestLocalizedValueRef.current = localizedValue;
  const sortedLocales = Object.keys(localizedValue.locales).sort((a, b) =>
    a.localeCompare(b),
  );
  const [activeLocale, setActiveLocale] = React.useState<string>(
    localizedValue.defaultLocale,
  );
  const [customLocale, setCustomLocale] = React.useState("");
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [localeError, setLocaleError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sortedLocales.length) {
      setActiveLocale("");
      return;
    }
    if (!activeLocale || !sortedLocales.includes(activeLocale)) {
      setActiveLocale(localizedValue.defaultLocale || sortedLocales[0]!);
    }
  }, [activeLocale, localizedValue.defaultLocale, sortedLocales]);

  const filteredLocaleOptions = React.useMemo(() => {
    const taken = new Set(sortedLocales);
    const query = customLocale.trim().toLowerCase();
    return LOCALIZED_LOCALE_OPTIONS.filter((locale) => {
      if (taken.has(locale)) return false;
      if (!query) return true;
      return (
        locale.toLowerCase().includes(query) ||
        getLocaleLabel(locale).toLowerCase().includes(query)
      );
    }).slice(0, 20);
  }, [customLocale, sortedLocales]);

  const addLocale = (rawLocale: string) => {
    const currentValue = latestLocalizedValueRef.current;
    const locale = normalizeLocaleCode(rawLocale);
    if (!locale) {
      setLocaleError("Enter a locale code.");
      return;
    }
    if (currentValue.locales[locale] !== undefined) {
      setLocaleError("Locale already exists.");
      return;
    }
    onChange({
      ...currentValue,
      locales: {
        ...currentValue.locales,
        [locale]: {
          html: "",
          value: {
            type: "doc",
            content: [],
          },
        },
      },
    });
    setCustomLocale("");
    setActiveLocale(locale);
    setLocaleError(null);
  };

  const removeLocale = (locale: string) => {
    const currentValue = latestLocalizedValueRef.current;
    if (sortedLocales.length <= 1) {
      return;
    }
    const nextLocales = { ...currentValue.locales };
    delete nextLocales[locale];
    const fallback = Object.keys(nextLocales)[0] ?? "en";
    onChange({
      defaultLocale:
        currentValue.defaultLocale === locale
          ? fallback
          : currentValue.defaultLocale,
      locales: nextLocales,
    });
  };

  const activeEntry = localizedValue.locales[activeLocale] ?? {
    html: "",
    value: { type: "doc", content: [] },
  };

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>
        {toTitle(label)}
        {requiredIndicator ? (
          <span className="text-destructive"> *</span>
        ) : null}
      </FieldLabel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Select
          disabled={disabled}
          value={activeLocale}
          onValueChange={setActiveLocale}
        >
          <SelectTrigger className="w-full min-w-48 sm:w-fit">
            <SelectValue placeholder="Select locale" />
          </SelectTrigger>
          <SelectContent>
            {sortedLocales.map((locale) => (
              <SelectItem key={locale} value={locale}>
                <span className="inline-flex items-center gap-2">
                  <span>{getLocaleLabel(locale)}</span>
                  {locale === localizedValue.defaultLocale ? (
                    <Badge variant="secondary">Default</Badge>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex flex-wrap items-center gap-2">
          <div className="relative">
            <Input
              disabled={disabled}
              className="h-8 w-48"
              placeholder="Add locale"
              value={customLocale}
              onChange={(event) => {
                setCustomLocale(event.target.value);
                setPickerOpen(true);
                setLocaleError(null);
              }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addLocale(customLocale);
                }
              }}
            />
            {pickerOpen && filteredLocaleOptions.length > 0 ? (
              <div className="absolute z-20 mt-1 w-64 rounded-md border bg-background shadow-md">
                <div className="max-h-56 overflow-y-auto py-1">
                  {filteredLocaleOptions.map((locale) => (
                    <button
                      key={locale}
                      type="button"
                      disabled={disabled}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => addLocale(locale)}
                    >
                      <span>{getLocaleLabel(locale)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <Button
            disabled={disabled}
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => addLocale(customLocale)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {localeError ? (
        <div className="text-xs text-destructive">{localeError}</div>
      ) : null}
      {activeLocale ? (
        <div className="flex flex-col gap-3" data-locale={activeLocale}>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={disabled}
              size="sm"
              variant={
                activeLocale === localizedValue.defaultLocale
                  ? "default"
                  : "outline"
              }
              onClick={() =>
                onChange({
                  ...latestLocalizedValueRef.current,
                  defaultLocale: activeLocale,
                })
              }
            >
              {activeLocale === localizedValue.defaultLocale ? "" : "Set as "}
              Default locale
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              disabled={disabled || sortedLocales.length <= 1}
              onClick={() => removeLocale(activeLocale)}
            >
              <Trash className="h-4 w-4" />
            </Button>
          </div>
          <RichTextEditorField
            disabled={disabled}
            value={activeEntry}
            onChange={(nextValue) =>
              onChange({
                defaultLocale: latestLocalizedValueRef.current.defaultLocale,
                locales: {
                  ...latestLocalizedValueRef.current.locales,
                  [activeLocale]: nextValue,
                },
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
