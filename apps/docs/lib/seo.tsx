import type { Metadata } from "next";
import { getDocsPublicUrl } from "./env";

const DOCS_NAME = "cms0 Documentation";
const DOCS_DESCRIPTION =
  "Official cms0 docs for hosted workspaces, self-hosted @cms0/admin, app integration, content modeling, and runtime APIs.";

type BreadcrumbItem = {
  name: string;
  path: string;
};

function normalizePath(path = "/") {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return normalized === "/" ? "" : normalized.replace(/\/+$/, "");
}

export function docsUrl(path = "/") {
  return `${getDocsPublicUrl()}${normalizePath(path)}`;
}

export function docsPathFromMdxPath(mdxPath?: string[]) {
  if (!mdxPath?.length) {
    return "/";
  }

  return `/${mdxPath.join("/")}`;
}

function metadataTitleToString(title: Metadata["title"]) {
  if (!title) {
    return DOCS_NAME;
  }

  if (typeof title === "string") {
    return title;
  }

  if ("absolute" in title && title.absolute) {
    return String(title.absolute);
  }

  if ("default" in title && title.default) {
    return String(title.default);
  }

  return DOCS_NAME;
}

export function createDocsMetadata(
  mdxPath: string[] | undefined,
  source: Metadata | undefined,
): Metadata {
  const path = docsPathFromMdxPath(mdxPath);
  const title = metadataTitleToString(source?.title);
  const description = source?.description ?? DOCS_DESCRIPTION;
  const url = docsUrl(path);
  const imageUrl = docsUrl("/opengraph-image");

  return {
    ...source,
    title: source?.title ?? title,
    description,
    alternates: {
      ...source?.alternates,
      canonical: url,
    },
    openGraph: {
      ...source?.openGraph,
      title,
      description,
      url,
      siteName: DOCS_NAME,
      type: "article",
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: DOCS_NAME,
        },
      ],
    },
    twitter: {
      ...source?.twitter,
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
      site: "@cms0__",
      creator: "@cms0__",
    },
  };
}

export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}

export function docsWebPageJsonLd(input: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: input.title,
    description: input.description,
    url: docsUrl(input.path),
    publisher: {
      "@type": "Organization",
      name: "cms0",
      url: "https://cms0.io",
    },
  };
}

export function docsBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: docsUrl(item.path),
    })),
  };
}

export function docsBreadcrumbs(path: string, title: string) {
  const items: BreadcrumbItem[] = [{ name: "Documentation", path: "/" }];
  if (path !== "/") {
    items.push({ name: title, path });
  }
  return items;
}

export { DOCS_DESCRIPTION, DOCS_NAME, metadataTitleToString };
