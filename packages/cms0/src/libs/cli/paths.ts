// Path utilities for locating package-relative outputs.
import path from "path";
import fs from "node:fs";
import { fileURLToPath } from "url";

const importMetaUrl = (() => {
  try {
    // Avoid syntax that breaks CommonJS compilation; evaluate only if supported
    // eslint-disable-next-line no-new-func
    return Function("return import.meta.url")();
  } catch {
    return undefined;
  }
})();

const here =
  typeof __dirname === "string"
    ? __dirname
    : importMetaUrl
    ? path.dirname(fileURLToPath(importMetaUrl))
    : process.cwd();

function findPackageRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    const pkgPath = path.join(current, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
          name?: string;
        };
        if (pkg.name === "@cms0/cms0") {
          return current;
        }
      } catch {
        // Keep walking up if package.json cannot be parsed.
      }
    }

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(startDir, "../../..");
}

const packageRoot = findPackageRoot(here);

const descriptorOutputPaths = {
  sourceTs: path.resolve(packageRoot, "src/generated/schema-descriptor.ts"),
  esmJs: path.resolve(packageRoot, "dist/esm/generated/schema-descriptor.js"),
  cjsJs: path.resolve(
    packageRoot,
    "dist/cjs/generated/schema-descriptor.cjs",
  ),
};

function resolveLocalDescriptorOutputPaths(projectRoot: string) {
  return {
    gitignore: path.resolve(projectRoot, ".cms0/.gitignore"),
    json: path.resolve(projectRoot, ".cms0/generated/schema-descriptor.json"),
    sourceTs: path.resolve(
      projectRoot,
      ".cms0/generated/schema-descriptor.ts",
    ),
    cjsJs: path.resolve(projectRoot, ".cms0/generated/schema-descriptor.cjs"),
    typesDts: path.resolve(projectRoot, ".cms0/generated/types.d.ts"),
  };
}

export { descriptorOutputPaths, packageRoot, resolveLocalDescriptorOutputPaths };
