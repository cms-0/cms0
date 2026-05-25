#!/usr/bin/env node
// Entry point for the cms0 CLI binary.
// Use local sources directly to avoid pulling stale dist via package exports.
import { runFromCli } from "./libs/cli/index.js";

runFromCli();
