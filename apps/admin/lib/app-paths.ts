import path from "node:path";
import { fileURLToPath } from "node:url";

const LIB_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));

export const APP_ROOT = path.resolve(LIB_DIRECTORY, "..");
export const REPO_ROOT = path.resolve(APP_ROOT, "..", "..");

export const resolveFromAppRoot = (...segments: string[]) =>
  path.resolve(APP_ROOT, ...segments);
