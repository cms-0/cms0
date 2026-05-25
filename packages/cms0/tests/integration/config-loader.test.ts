import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import { resolvePaths } from "../../src/libs/cli/config-loader.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const loaderSourcePath = path.resolve(here, "../../src/libs/cli/config-loader.ts");

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function findTempConfigModules(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(".cms0-config.") && name.endsWith(".mjs"));
}

function compileConfigLoaderToCjs(outDir: string): { path: string; code: string } {
  const source = fs.readFileSync(loaderSourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: loaderSourcePath,
  }).outputText;

  const outPath = path.join(outDir, "config-loader.cjs");
  fs.writeFileSync(outPath, transpiled, "utf8");
  return { path: outPath, code: transpiled };
}

test("CJS transpile keeps runtime import() for URL module loading", () => {
  const tempDir = createTempDir("cms0-loader-transpile-");
  try {
    const { code } = compileConfigLoaderToCjs(tempDir);
    assert.match(code, /return import\(specifier\);/);
    assert.doesNotMatch(code, /require\(specifier\)/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CJS-transpiled loader reads ESM TypeScript config and cleans temp file", async () => {
  const tempDir = createTempDir("cms0-loader-esm-config-");
  const compileDir = createTempDir("cms0-loader-compiled-");
  try {
    const configPath = path.join(tempDir, "cms0.config.ts");
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
      "utf8"
    );
    fs.writeFileSync(
      configPath,
      [
        "export default {",
        '  entry: "./src/data/cms0.ts",',
        "};",
      ].join("\n"),
      "utf8"
    );

    const compiledLoader = compileConfigLoaderToCjs(compileDir);
    const mod = require(compiledLoader.path) as {
      loadUserConfig: (
        cfgPath?: string
      ) => Promise<{ path: string; config: Record<string, unknown> } | undefined>;
    };

    const loaded = await mod.loadUserConfig(configPath);
    assert.ok(loaded);
    assert.equal(loaded.path, configPath);
    assert.equal(loaded.config.entry, "./src/data/cms0.ts");
    assert.deepEqual(findTempConfigModules(tempDir), []);
  } finally {
    fs.rmSync(compileDir, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CJS-transpiled loader reads CommonJS TypeScript config without ts-node module-resolution drift", async () => {
  const tempDir = createTempDir("cms0-loader-cjs-ts-config-");
  const compileDir = createTempDir("cms0-loader-compiled-");
  try {
    const configPath = path.join(tempDir, "cms0.config.ts");
    fs.writeFileSync(
      path.join(tempDir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "bundler",
          },
        },
        null,
        2,
      ),
      "utf8"
    );
    fs.writeFileSync(
      configPath,
      [
        "export default {",
        '  entry: "./src/data/cms0.ts",',
        "};",
      ].join("\n"),
      "utf8"
    );

    const compiledLoader = compileConfigLoaderToCjs(compileDir);
    const mod = require(compiledLoader.path) as {
      loadUserConfig: (
        cfgPath?: string
      ) => Promise<{ path: string; config: Record<string, unknown> } | undefined>;
    };

    const loaded = await mod.loadUserConfig(configPath);
    assert.ok(loaded);
    assert.equal(loaded.path, configPath);
    assert.equal(loaded.config.entry, "./src/data/cms0.ts");
    assert.deepEqual(findTempConfigModules(tempDir), []);
  } finally {
    fs.rmSync(compileDir, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("CJS-transpiled loader reads ESM JavaScript config via file URL import", async () => {
  const tempDir = createTempDir("cms0-loader-js-config-");
  const compileDir = createTempDir("cms0-loader-compiled-");
  try {
    const configPath = path.join(tempDir, "cms0.config.js");
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
      "utf8"
    );
    fs.writeFileSync(
      configPath,
      [
        "export default {",
        '  entry: "./src/data/cms0.js",',
        "};",
      ].join("\n"),
      "utf8"
    );

    const compiledLoader = compileConfigLoaderToCjs(compileDir);
    const mod = require(compiledLoader.path) as {
      loadUserConfig: (
        cfgPath?: string
      ) => Promise<{ path: string; config: Record<string, unknown> } | undefined>;
    };

    const loaded = await mod.loadUserConfig(configPath);
    assert.ok(loaded);
    assert.equal(loaded.path, configPath);
    assert.equal(loaded.config.entry, "./src/data/cms0.js");
  } finally {
    fs.rmSync(compileDir, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("temp transpiled config file is cleaned up even when config execution throws", async () => {
  const tempDir = createTempDir("cms0-loader-throwing-config-");
  const compileDir = createTempDir("cms0-loader-compiled-");
  try {
    const configPath = path.join(tempDir, "cms0.config.ts");
    fs.writeFileSync(
      path.join(tempDir, "package.json"),
      JSON.stringify({ type: "module" }),
      "utf8"
    );
    fs.writeFileSync(
      configPath,
      ['throw new Error("config exploded");', "export default { entry: './src/cms0.ts' };"].join(
        "\n"
      ),
      "utf8"
    );

    const compiledLoader = compileConfigLoaderToCjs(compileDir);
    const mod = require(compiledLoader.path) as {
      loadUserConfig: (cfgPath?: string) => Promise<unknown>;
    };

    await assert.rejects(() => mod.loadUserConfig(configPath), /config exploded/);
    assert.deepEqual(findTempConfigModules(tempDir), []);
  } finally {
    fs.rmSync(compileDir, { recursive: true, force: true });
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("resolvePaths uses the nearest package root as projectRoot", () => {
  const tempDir = createTempDir("cms0-loader-project-root-");
  try {
    const projectRoot = path.join(tempDir, "apps", "site");
    const configDir = path.join(projectRoot, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, "package.json"),
      JSON.stringify({ name: "@cms0/test-site" }),
      "utf8",
    );

    const resolved = resolvePaths(path.join(configDir, "cms0.config.ts"), {
      entry: "./src/data/cms0.ts",
    });

    assert.equal(resolved.projectRoot, projectRoot);
    assert.equal(
      resolved.entryFile,
      path.join(configDir, "src/data/cms0.ts"),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
