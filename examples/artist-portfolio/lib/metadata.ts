import type { Metadata } from "next";

import { toNextMetadata } from "@cms0/cms0";
import type { Seo } from "@cms0/cms0/custom-types";

export function pageMetadata(
  seo: Seo | undefined,
  fallback: { title: string; description: string },
): Metadata {
  const metadata = toNextMetadata(seo, {
    locale: "en",
    defaultLocale: "en",
  }) as Metadata;

  return {
    title: metadata.title ?? fallback.title,
    description: metadata.description ?? fallback.description,
    openGraph: {
      title: fallback.title,
      description: fallback.description,
      ...metadata.openGraph,
    },
    twitter: {
      card: "summary_large_image",
      title: fallback.title,
      description: fallback.description,
      ...metadata.twitter,
    },
    ...metadata,
  };
}
