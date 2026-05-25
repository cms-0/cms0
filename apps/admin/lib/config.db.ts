import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import fs from "node:fs";
import * as pgCore from "drizzle-orm/pg-core";
import * as baseSchema from "../db";
import { resolveFromAppRoot } from "./app-paths";
import { getDatabaseUrl } from "@/lib/env";

type SchemaModule = typeof baseSchema;
type DbType = ReturnType<typeof drizzle<SchemaModule>>;

const runtimeSchemaPath = resolveFromAppRoot(
  "db",
  "generated",
  "schema.runtime.cjs",
);
const runtimeRequire = ((id: string) => {
  if (id === "drizzle-orm/pg-core") {
    return pgCore;
  }

  throw new Error(`Unsupported runtime schema require: ${id}`);
}) as NodeRequire;

const loadRuntimeSchemaModule = (): Record<string, unknown> | null => {
  if (!fs.existsSync(runtimeSchemaPath)) return null;

  try {
    const source = fs.readFileSync(runtimeSchemaPath, "utf8");
    const module = { exports: {} as Record<string, unknown> };
    const evaluate = new Function(
      "module",
      "exports",
      "require",
      `${source}\nreturn module.exports;`,
    ) as (
      module: { exports: Record<string, unknown> },
      exports: Record<string, unknown>,
      require: NodeRequire,
    ) => Record<string, unknown>;

    return evaluate(module, module.exports, runtimeRequire);
  } catch (error) {
    console.warn("admin: failed to load runtime schema module", error);
    return null;
  }
};

const loadSchemaModule = (): SchemaModule => {
  const runtimeSchema = loadRuntimeSchemaModule();
  if (runtimeSchema) {
    console.info("admin:schema:load-runtime", {
      path: runtimeSchemaPath,
      tables: Object.keys(runtimeSchema).length,
    });
    return { ...baseSchema, ...runtimeSchema } as SchemaModule;
  }
  console.info("admin:schema:load-static", { path: "apps/admin/db/index.ts" });
  return baseSchema;
};

let schema: SchemaModule = loadSchemaModule();
let db: DbType = drizzle(getDatabaseUrl(), {
  schema,
  // logger: true,
});

function reloadSchema() {
  schema = loadSchemaModule();
  db = drizzle<SchemaModule>(getDatabaseUrl(), {
    schema,
    logger: true,
  });
}

export { db, schema, reloadSchema };

// Export the underlying pg.Pool for package compatibility
export const pool: pg.Pool = (db as any).$client;
