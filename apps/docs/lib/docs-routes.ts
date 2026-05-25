import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

function getContentRoot() {
  const candidates = [
    join(process.cwd(), "content"),
    join(process.cwd(), "apps/docs/content"),
  ];

  const root = candidates.find((candidate) => existsSync(candidate));
  if (!root) {
    throw new Error("Could not find docs content root.");
  }

  return root;
}

function toRoutePath(contentRoot: string, filePath: string) {
  const relativePath = relative(contentRoot, filePath)
    .split(sep)
    .join("/")
    .replace(/\.mdx$/, "");

  if (relativePath === "index") {
    return "/";
  }

  if (relativePath.endsWith("/index")) {
    return `/${relativePath.replace(/\/index$/, "")}`;
  }

  return `/${relativePath}`;
}

function walk(dir: string, contentRoot: string, routes: string[]) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith("_")) {
      continue;
    }

    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      walk(fullPath, contentRoot, routes);
      continue;
    }

    if (entry.endsWith(".mdx")) {
      routes.push(toRoutePath(contentRoot, fullPath));
    }
  }
}

export function getDocsRoutes() {
  const contentRoot = getContentRoot();
  const routes: string[] = [];
  walk(contentRoot, contentRoot, routes);
  return routes.sort((a, b) => a.localeCompare(b));
}
