/**
 * Schema Generator - Main Generator Functions
 */

import type {
  FullDescriptor,
  ModelDescriptor,
  RootDescriptor,
  FieldDescriptor,
} from "@cms0/shared";
import type {
  DirectModelRefColumnAlias,
  GeneratedSchemaResult,
  TableBuilderState,
} from "./types";
import { createTableBuilder } from "./table-builder";
import { createFieldProcessor } from "./field-processor";

export function generateContentTables(
  descriptor: FullDescriptor,
): GeneratedSchemaResult {
  const models = descriptor.models || {};
  const roots = descriptor.roots || {};

  const state: TableBuilderState = {
    descriptor,
    tables: [],
    tableMap: new Map(),
    tableNameOwner: new Map(),
    pathNameMap: new Map(),
    nameCounts: {},
    modelNameToExport: new Map(),
    modelRefColumnAliases: [],
    warnings: new Set(),
    parts: [],
  };

  const builder = createTableBuilder(state);
  const processor = createFieldProcessor(state, builder);

  // Reserve all model tables first so forward modelRef lookups resolve.
  const modelEntries = Object.entries<ModelDescriptor>(models);
  for (const [name, modelDesc] of modelEntries) {
    builder.buildModelTable(name, modelDesc, state.modelNameToExport);
  }

  // Process model fields after all model names are registered.
  for (const [name, modelDesc] of modelEntries) {
    const table = builder.getTable([name], name);
    for (const [propName, propDesc] of Object.entries(
      (modelDesc as any).properties || {},
    ) as [string, FieldDescriptor][]) {
      processor.processField(propDesc, propName, table, [name, propName], false);
    }
  }

  // Build root table
  const rootTable = builder.getTable(["root"], "root");

  for (const [rootKey, rootDesc] of Object.entries<RootDescriptor>(roots)) {
    const kind = (rootDesc as any).kind ?? (rootDesc as any).type;
    if (kind === "object") {
      const objTable = processor.processObject(
        rootDesc as any,
        [rootKey],
        undefined,
        false,
      );
      builder.addTableRefColumn(rootTable, camelCase(rootKey), objTable, {
        notNull: false,
      });
      continue;
    }
    if (kind === "array") {
      processor.processArray(rootDesc as any, rootKey, rootTable, [rootKey]);
      continue;
    }
    processor.processField(
      rootDesc as any,
      rootKey,
      rootTable,
      [rootKey],
      false,
    );
  }

  // Add timestamp columns to all tables
  state.tables.forEach((table) => {
    builder.addColumn(
      table,
      `  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),`,
      "createdAt",
      "created_at",
    );
    builder.addColumn(
      table,
      `  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),`,
      "updatedAt",
      "updated_at",
    );
  });

  // Generate output
  for (const table of state.tables) {
    if (!table.foreignKeys.length) {
      state.parts.push(
        `export const ${table.exportName} = pgTable("${table.tableName}", {`,
        ...table.columns,
        "});\n",
      );
      continue;
    }
    const fkLines = table.foreignKeys.map((fk) => {
      const chainedOnDelete = fk.onDelete ? `.onDelete("${fk.onDelete}")` : "";
      const chainedOnUpdate = fk.onUpdate ? `.onUpdate("${fk.onUpdate}")` : "";
      return `  foreignKey({ name: "${fk.name}", columns: [table.${fk.columnName}], foreignColumns: [${fk.targetTableExportName}.${fk.targetColumnName}] })${chainedOnDelete}${chainedOnUpdate},`;
    });
    state.parts.push(
      `export const ${table.exportName} = pgTable("${table.tableName}", {`,
      ...table.columns,
      "}, (table) => [",
      ...fkLines,
      "]);\n",
    );
  }

  if (state.warnings.size) {
    state.warnings.forEach((w) => console.warn(w));
  }

  return {
    content: state.parts.join("\n"),
    exportNames: state.tables.map((t) => t.exportName),
    tableNames: state.tables.map((t) => t.tableName),
    warnings: Array.from(state.warnings),
    modelRefColumnAliases: state.modelRefColumnAliases,
  };
}

export function collectDirectModelRefColumnAliases(
  descriptor: FullDescriptor,
): DirectModelRefColumnAlias[] {
  return generateContentTables(descriptor).modelRefColumnAliases;
}

export function generateRuntimeSchemaCode(descriptor: FullDescriptor): {
  cjsCode: string;
  exportNames: string[];
} {
  const result = generateContentTables(descriptor);
  const runtimeTables = result.content.replace(/export const /g, "const ");
  const runtimeExports = result.exportNames.length
    ? `module.exports = { ${result.exportNames.join(", ")} };`
    : "module.exports = {};";
  const cjsCode = [
    "// AUTO-GENERATED: cms0 content tables (runtime).",
    'const { pgTable, foreignKey, uuid, integer, text, boolean, timestamp, jsonb } = require("drizzle-orm/pg-core");',
    "",
    runtimeTables,
    runtimeExports,
    "",
  ].join("\n");
  return { cjsCode, exportNames: result.exportNames };
}

export function generateEsmSchemaCode(descriptor: FullDescriptor): string {
  const result = generateContentTables(descriptor);
  return [
    "// AUTO-GENERATED FILE: cms0 content tables. Do not edit by hand.",
    'import { pgTable, foreignKey, uuid, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";',
    "",
    result.content,
  ].join("\n");
}

// Helper function
function camelCase(str: string): string {
  return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase());
}
