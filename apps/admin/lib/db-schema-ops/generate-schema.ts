// Admin-specific: Generates runtime schema files
import {
  generateEsmSchemaCode,
  generateRuntimeSchemaCode,
} from "@cms0/admin-server";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveFromAppRoot } from "../app-paths";

const schemaTsPath = resolveFromAppRoot("db", "generated", "schema.ts");
const runtimeCjsPath = resolveFromAppRoot("db", "generated", "schema.runtime.cjs");
const legacyRuntimeCjsPath = resolveFromAppRoot(
  "db",
  "generated.schema.runtime.cjs",
);

export async function regenerateGeneratedSchema(descriptor: any) {
  const content = `${generateEsmSchemaCode(descriptor)}\n`;

  // Remove old runtime module if it exists to avoid stale exports
  try {
    await rm(runtimeCjsPath, { force: true });
    await rm(legacyRuntimeCjsPath, { force: true });
  } catch {
    // ignore
  }

  await mkdir(dirname(schemaTsPath), { recursive: true });
  await writeFile(schemaTsPath, content, "utf8");

  // Write runtime CJS module for dynamic loading
  const runtimeCode = generateRuntimeSchemaCode(descriptor);
  const cjsContent =
    [
      "// AUTO-GENERATED RUNTIME SCHEMA (CJS)",
      "// This file is rebuilt automatically when the schema changes.",
      "",
      runtimeCode.cjsCode,
    ].join("\n") + "\n";

  await mkdir(dirname(runtimeCjsPath), { recursive: true });
  await writeFile(runtimeCjsPath, cjsContent, "utf8");
}
