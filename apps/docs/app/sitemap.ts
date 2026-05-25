import type { MetadataRoute } from "next";
import { getDocsRoutes } from "../lib/docs-routes";
import { docsUrl } from "../lib/seo";

export const dynamic = "force-static";

function priorityForRoute(path: string) {
  if (path === "/") return 1;
  if (path === "/getting-started") return 0.95;
  if (
    path === "/self-hosting" ||
    path === "/app-integration" ||
    path === "/reference"
  ) {
    return 0.9;
  }
  if (path.includes("/deployment") || path.includes("/accessors")) {
    return 0.85;
  }
  return 0.7;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return getDocsRoutes().map((path) => ({
    url: docsUrl(path),
    priority: priorityForRoute(path),
    changeFrequency: "weekly",
  }));
}
