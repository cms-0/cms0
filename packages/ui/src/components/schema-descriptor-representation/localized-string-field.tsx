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

const normalizeLocaleCode = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const toTitle = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

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

type LocalizedStringValue = {
  defaultLocale: string;
  locales: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isLocalizedStringValue = (value: unknown): value is LocalizedStringValue =>
  isRecord(value) && isRecord(value.locales) && typeof value.defaultLocale === "string";

const readLocalizedStringValue = (value: unknown): LocalizedStringValue => {
  if (isLocalizedStringValue(value)) {
    const localeEntries = Object.entries(value.locales).filter(
      ([locale, localeValue]) =>
        typeof locale === "string" &&
        locale.trim().length > 0 &&
        typeof localeValue === "string",
    );
    const locales = Object.fromEntries(localeEntries) as Record<string, string>;
    const defaultLocale =
      localeEntries.some(([locale]) => locale === value.defaultLocale)
        ? value.defaultLocale
        : (localeEntries[0]?.[0] ?? "en");

    return {
      defaultLocale,
      locales: localeEntries.length > 0 ? locales : { en: "" },
    };
  }

  return {
    defaultLocale: "en",
    locales: { en: typeof value === "string" ? value : "" },
  };
};

type LocalizedStringFieldProps = {
  disabled?: boolean;
  label: string;
  onChange: (value: unknown) => void;
  requiredIndicator?: boolean;
  value: unknown;
};

export function LocalizedStringField({
  disabled = false,
  label,
  onChange,
  requiredIndicator,
  value,
}: Readonly<LocalizedStringFieldProps>) {
  const localizedValue = readLocalizedStringValue(value);
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
        [locale]: "",
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

  const activeValue = localizedValue.locales[activeLocale] ?? "";

  return (
    <div className="flex flex-col gap-3">
      <FieldLabel>
        {toTitle(label)}
        {requiredIndicator ? <span className="text-destructive"> *</span> : null}
      </FieldLabel>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Select
          disabled={disabled}
          value={activeLocale}
          onValueChange={setActiveLocale}
        >
          <SelectTrigger className="w-full min-w-48 sm:w-fit" data-testid="localized-locale-select">
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
      {localeError ? <div className="text-xs text-destructive">{localeError}</div> : null}
      {activeLocale ? (
        <div className="flex flex-col gap-3" data-locale={activeLocale} data-testid="localized-value-panel">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              disabled={disabled}
              size="sm"
              variant={activeLocale === localizedValue.defaultLocale ? "default" : "outline"}
              onClick={() =>
                onChange({
                  ...latestLocalizedValueRef.current,
                  defaultLocale: activeLocale,
                })
              }
            >
              {activeLocale === localizedValue.defaultLocale ? "" : "Set as "}Default locale
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
          <Input
            disabled={disabled}
            data-locale={activeLocale}
            data-testid="localized-string-value"
            value={activeValue}
            onChange={(event) =>
              onChange({
                defaultLocale: latestLocalizedValueRef.current.defaultLocale,
                locales: {
                  ...latestLocalizedValueRef.current.locales,
                  [activeLocale]: event.target.value,
                },
              })
            }
          />
        </div>
      ) : null}
    </div>
  );
}
