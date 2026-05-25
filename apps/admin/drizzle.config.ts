import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const APP_ROOT = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  dialect: "postgresql",
  out: path.join(APP_ROOT, "drizzle"),
  schema: [
    path.join(APP_ROOT, "db", "schema.ts"),
    path.join(APP_ROOT, "db", "auth-schema.ts"),
    path.join(APP_ROOT, "db", "generated", "schema.ts"),
  ],
});
