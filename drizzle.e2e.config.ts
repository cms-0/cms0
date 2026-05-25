import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the admin E2E Drizzle config.");
}

export default defineConfig({
  dbCredentials: {
    url: databaseUrl,
  },
  dialect: "postgresql",
  schema: [
    "./apps/admin/db/schema.ts",
    "./apps/admin/db/auth-schema.ts",
    "./apps/admin/db/generated/schema.ts",
  ],
  schemaFilter: ["public"],
  tablesFilter: ["*"],
});
