#!/usr/bin/env node

/**
 * CLI entry for cms0.
 *
 * Uses CJS build when available; falls back to TS source during workspace dev.
 */

import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const srcCli = path.resolve(pkgRoot, "src/cli.ts");
const distCli = path.resolve(pkgRoot, "dist/cjs/cli.cjs");

if (fs.existsSync(srcCli)) {
  // In workspace/development, prefer live TS sources to avoid stale dist.
  require("tsx/cjs");
  require(srcCli);
} else if (fs.existsSync(distCli)) {
  // Fallback to compiled CJS build when sources are not available.
  require(distCli);
} else {
  console.error("cms0: no CLI entry found (missing src and dist builds)");
  process.exit(1);
}
