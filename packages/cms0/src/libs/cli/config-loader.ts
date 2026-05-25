// Load cms0.config files and resolve relevant paths for the CLI.
import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import crypto from "crypto";
import { createRequire } from "module";
import type { Cms0Config } from "@cms0/cms0/config";
import type { ResolvedConfig } from "./types.js";

const DEFAULT_CONFIG_BASENAMES = [
  "cms0.config.ts",
  "cms0.config.js",
  "cms0.config.mjs",
  "cms0.config.cjs",
  "cms0.config.json",
];

function findConfigPath(provided?: string): string | undefined {
  if (provided) {
    const resolved = path.isAbsolute(provided)
      ? provided
      : path.resolve(process.cwd(), provided);
    return fs.existsSync(resolved) ? resolved : undefined;
  }

  let dir = process.cwd();
  while (true) {
    for (const name of DEFAULT_CONFIG_BASENAMES) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function findNearestPackageJson(startPath: string): string | undefined {
  let dir = path.dirname(startPath);
  while (true) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

function readPackageType(
  pkgJsonPath: string,
): "module" | "commonjs" | undefined {
  try {
    const raw = fs.readFileSync(pkgJsonPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed?.type === "module"
      ? "module"
      : parsed?.type === "commonjs"
        ? "commonjs"
        : undefined;
  } catch {
    return undefined;
  }
}

async function loadUserConfig(
  configPath?: string,
): Promise<{ path: string; config: Cms0Config } | undefined> {
  const resolvedPath = findConfigPath(configPath);
  if (!resolvedPath) {
    console.warn("cms0: no cms0.config.* file found; provide --config");
    return undefined;
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (ext === ".json") {
    const json = fs.readFileSync(resolvedPath, "utf8");
    return { path: resolvedPath, config: JSON.parse(json) };
  }

  if (ext === ".ts" || ext === ".mts" || ext === ".cts" || ext === ".tsx") {
    const pkgJsonPath = findNearestPackageJson(resolvedPath);
    const pkgType = pkgJsonPath ? readPackageType(pkgJsonPath) : undefined;
    const isEsmPkg = pkgType === "module";
    const compiledPath = await transpileTsModuleToTemp(
      resolvedPath,
      isEsmPkg ? "esm" : "cjs",
    );
    try {
      const imported = isEsmPkg
        ? ((await importByHref(pathToFileURL(compiledPath).href)) as any)
        : // eslint-disable-next-line @typescript-eslint/no-var-requires
          require(compiledPath);
      const config =
        imported?.default ?? imported?.config ?? imported ?? ({} as Cms0Config);
      return { path: resolvedPath, config };
    } finally {
      cleanupTempModule(compiledPath);
    }
  }

  const imported = (await importByHref(
    pathToFileURL(resolvedPath).href,
  )) as any;
  const config =
    imported?.default ?? imported?.config ?? imported ?? ({} as Cms0Config);
  return { path: resolvedPath, config };
}

async function importByHref(href: string): Promise<unknown> {
  // Keep runtime import() intact in both ESM and CJS outputs.
  const runImport = new Function("specifier", "return import(specifier);") as (
    specifier: string,
  ) => Promise<unknown>;
  return runImport(href);
}

function resolvePaths(cfgPath: string, config: Cms0Config): ResolvedConfig {
  if (!config.entry) {
    throw new Error("cms0: config.entry is required");
  }
  const baseDir = path.dirname(cfgPath);
  const packageJsonPath = findNearestPackageJson(cfgPath);
  const projectRoot = packageJsonPath ? path.dirname(packageJsonPath) : baseDir;
  const entryFile = path.resolve(baseDir, config.entry);
  const tsconfigPath = config.tsconfig
    ? path.resolve(baseDir, config.tsconfig)
    : undefined;
  const apiBaseUrl = config.api?.baseUrl;
  const apiKey = config.api?.key;
  return {
    configPath: cfgPath,
    entryFile,
    projectRoot,
    tsconfigPath,
    apiBaseUrl,
    apiKey,
  };
}

function findTsConfig(entryFile: string): string | undefined {
  let dir = path.dirname(path.resolve(entryFile));
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

async function transpileTsModuleToTemp(
  tsPath: string,
  format: "esm" | "cjs",
): Promise<string> {
  const ts = await loadTypescriptCompiler(tsPath);
  const source = fs.readFileSync(tsPath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: format === "esm" ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: tsPath,
  });
  const hash = crypto
    .createHash("sha1")
    .update(tsPath + format + source + Date.now().toString())
    .digest("hex");
  const outFile = path.join(
    path.dirname(tsPath),
    `.cms0-config.${hash}.${format === "esm" ? "mjs" : "cjs"}`,
  );
  fs.writeFileSync(outFile, transpiled.outputText, "utf8");
  return outFile;
}

function cleanupTempModule(tempPath: string) {
  try {
    fs.unlinkSync(tempPath);
  } catch {
    // ignore cleanup failures
  }
}

async function loadTypescriptCompiler(tsPath: string) {
  const attemptedErrors: unknown[] = [];
  const manifestCandidates = [
    findNearestPackageJson(tsPath),
    path.join(process.cwd(), "package.json"),
  ].filter((candidate): candidate is string =>
    Boolean(candidate && fs.existsSync(candidate)),
  );

  for (const manifest of manifestCandidates) {
    try {
      const resolver = createRequire(manifest);
      const mod = resolver("typescript");
      return normalizeTypescriptModule(mod);
    } catch (error) {
      attemptedErrors.push(error);
    }
  }

  try {
    const mod = createRequire(path.resolve("package.json"))("typescript");
    return normalizeTypescriptModule(mod);
  } catch (error) {
    attemptedErrors.push(error);
  }

  try {
    const mod = await import("typescript");
    return normalizeTypescriptModule(mod);
  } catch (error) {
    attemptedErrors.push(error);
  }

  throw new AggregateError(
    attemptedErrors,
    'cms0: Unable to resolve the "typescript" package required to load cms0.config.* files. Ensure it is installed in your project.',
  );
}

function normalizeTypescriptModule(mod: unknown): typeof import("typescript") {
  if (mod && typeof (mod as any).transpileModule === "function") {
    return mod as typeof import("typescript");
  }
  const candidate = (mod as { default?: unknown })?.default;
  if (candidate && typeof (candidate as any).transpileModule === "function") {
    return candidate as typeof import("typescript");
  }
  throw new Error(
    "cms0: resolved 'typescript' module does not provide transpileModule",
  );
}

export {
  DEFAULT_CONFIG_BASENAMES,
  findConfigPath,
  loadUserConfig,
  resolvePaths,
  findTsConfig,
};
