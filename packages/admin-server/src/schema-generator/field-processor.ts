/**
 * Schema Generator Field Processor
 */

import { camelCase, snakeCase } from "lodash";
import type { FieldDescriptor } from "@cms0/shared";
import type {
  InternalTableSpec,
  TableBuilderState,
  TableRefColumnSpec,
} from "./types";
import type { TableBuilder } from "./table-builder";
import {
  PG_IDENTIFIER_MAX_LENGTH,
  resolveScalarDescriptorType,
  resolveUniquePgColumnName,
} from "./utils";

export function createFieldProcessor(
  state: TableBuilderState,
  builder: TableBuilder,
) {
  const { warnings, modelNameToExport, modelRefColumnAliases } = state;
  const {
    getTable,
    getTableByExportName,
    addColumn,
    addParentRef,
    addOrderIndex,
    addTableRefColumn,
  } = builder;

  const addPrimitiveColumn = (
    table: InternalTableSpec,
    key: string,
    type: string,
  ) => {
    const colDbName = resolveUniquePgColumnName(table, snakeCase(key), key);
    const typeMap: Record<string, string> = {
      string: `text("${colDbName}")`,
      number: `integer("${colDbName}")`,
      boolean: `boolean("${colDbName}")`,
      json: `jsonb("${colDbName}")`,
    };
    const pgType = typeMap[type] ?? `jsonb("${colDbName}")`;
    addColumn(
      table,
      `  ${pgName(key)}: ${pgType},`,
      key,
      colDbName,
      key,
    );
  };

  const resolveModelTargetExportName = (modelName: string) => {
    return (
      modelNameToExport.get(modelName) ??
      modelNameToExport.get(camelCase(modelName)) ??
      modelNameToExport.get(snakeCase(modelName)) ??
      modelNameToExport.get(modelName.toLowerCase())
    );
  };

  const addModelRefColumn = (
    table: InternalTableSpec,
    colName: string,
    modelName: string,
    opts?: { notNull?: boolean },
  ): TableRefColumnSpec | null => {
    const targetExportName = resolveModelTargetExportName(modelName);
    if (!targetExportName) {
      warnings.add(`Model reference "${modelName}" not found`);
      return null;
    }
    const targetTable = getTableByExportName(targetExportName);
    if (!targetTable) {
      warnings.add(
        `Model reference "${modelName}" resolved to missing table "${targetExportName}"`,
      );
      return null;
    }
    return addTableRefColumn(table, colName, targetTable, opts);
  };

  const recordDirectModelRefColumnAlias = (
    table: InternalTableSpec,
    propertyName: string,
    modelName: string,
    column: TableRefColumnSpec,
  ) => {
    const legacyKey = `${camelCase(modelName)}Id`;
    const legacyDbName = toPrimaryPgIdentifier(snakeCase(legacyKey));
    modelRefColumnAliases.push({
      tableExportName: table.exportName,
      tableName: table.tableName,
      propertyName,
      modelName,
      canonicalKey: column.key,
      canonicalDbName: column.dbName,
      legacyKey,
      legacyDbName,
    });
  };

  const processField = (
    field: FieldDescriptor,
    fieldName: string,
    table: InternalTableSpec,
    pathSegments: string[],
    isCollectionItem: boolean,
  ) => {
    const kind = (field as any).kind ?? (field as any).type;
    const scalarType = resolveScalarDescriptorType(field);

    if (scalarType) {
      addPrimitiveColumn(table, fieldName, scalarType);
      return;
    }

    switch (kind) {
      case "modelRef": {
        const modelName = (field as any).model as string;
        const column = addModelRefColumn(table, camelCase(fieldName), modelName);
        if (column) {
          recordDirectModelRefColumnAlias(
            table,
            fieldName,
            modelName,
            column,
          );
        }
        return;
      }
      case "object": {
        const objTable = processObject(
          field as any,
          pathSegments,
          table,
          isCollectionItem,
        );
        addTableRefColumn(table, fieldName, objTable, { notNull: false });
        return;
      }
      case "array": {
        processArray(field as any, fieldName, table, pathSegments);
        return;
      }
      default: {
        warnings.add(
          `Unhandled field kind "${kind}" at ${pathSegments.join(".")}`,
        );
      }
    }
  };

  const processObject = (
    field: Extract<FieldDescriptor, { type: "object" }>,
    pathSegments: string[],
    parentTable?: InternalTableSpec,
    parentIsCollectionItem?: boolean,
  ) => {
    const table = getTable(pathSegments);
    if (parentTable) {
      addParentRef(table, parentTable, { unique: parentIsCollectionItem });
    }
    for (const [propName, propDesc] of Object.entries<FieldDescriptor>(
      (field as any).properties || {},
    )) {
      processField(
        propDesc,
        propName,
        table,
        [...pathSegments, propName],
        false,
      );
    }
    return table;
  };

  const processArray = (
    field: Extract<FieldDescriptor, { type: "array" }>,
    fieldName: string,
    parentTable: InternalTableSpec | undefined,
    pathSegments: string[],
  ) => {
    const itemPath = [...pathSegments, "item"];
    const table = getTable(itemPath);
    if (parentTable) {
      addParentRef(table, parentTable);
    }
    addOrderIndex(table);
    const items = (field as any).items as FieldDescriptor | undefined;
    if (!items) {
      warnings.add(
        `Array at ${pathSegments.join(".")} missing items descriptor`,
      );
      return table;
    }
    const itemKind = (items as any).kind ?? (items as any).type;
    const scalarItemType = resolveScalarDescriptorType(items);
    if (scalarItemType) {
      addPrimitiveColumn(table, "value", scalarItemType);
      return table;
    }
    switch (itemKind) {
      case "modelRef": {
        addModelRefColumn(
          table,
          camelCase((items as any).model),
          (items as any).model,
          { notNull: true },
        );
        return table;
      }
      case "object": {
        for (const [propName, propDesc] of Object.entries<FieldDescriptor>(
          (items as any).properties || {},
        )) {
          processField(
            propDesc,
            propName,
            table,
            [...itemPath, propName],
            true,
          );
        }
        return table;
      }
      case "array": {
        processArray(items as any, fieldName, table, itemPath);
        return table;
      }
      default: {
        warnings.add(`Unhandled array item kind at ${pathSegments.join(".")}`);
        return table;
      }
    }
  };

  return { processField, processObject, processArray };
}

// Helper to generate valid JS identifier
function pgName(key: string): string {
  if (/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)) return key;
  return camelCase(key);
}

function toPrimaryPgIdentifier(name: string): string {
  return name.length <= PG_IDENTIFIER_MAX_LENGTH
    ? name
    : name.slice(0, PG_IDENTIFIER_MAX_LENGTH);
}
