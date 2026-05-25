import {
  eq,
  and,
  inArray,
  ilike,
  or,
  sql,
  isNull,
  asc,
  desc,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { camelCase, snakeCase } from "lodash";
import { z, type ZodTypeAny } from "zod";
import {
  decodeTaggedUnionValue,
  encodeTaggedUnionValue,
  getUnionBranchKeys,
  type FieldDescriptor,
} from "@cms0/shared";
import type { RuntimeAssetStore } from "../storage-driver";
import type { Resource, TableSpec } from "./types";
import { getCanonicalSingletonId } from "./canonical-singleton";
import { ensureSingletonChain } from "./singleton-handlers-internal";
import {
  descriptorPrimitiveTypeToColumnName,
  makeScalarSetter,
  isScalarField,
  isObjectField,
  isArrayField,
  isLocalizedCustomType,
  isAssetCustomType,
  isModelRefCustomType,
  findColumn,
  resolveModelRefColumnName,
  resolveOrderColumn,
  resolveColumnByName,
  parseParentIdParam,
  capitalize,
} from "./helpers";
import { buildSingletonHandlers } from "./singleton-handlers";

type Db = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

function buildSearchFilter(search: string, table: any) {
  const textFilters: any[] = [];
  for (const [key, col] of Object.entries(table)) {
    if (typeof col !== "object") {
      continue;
    }

    const column = (table as any)[key];
    const dataType = (col as any).dataType;
    const columnType = (col as any).columnType;

    if (dataType === "string" && columnType !== "PgUUID") {
      textFilters.push(ilike(column, `%${search}%`));
      continue;
    }

    // Rich-text, localized, and other descriptor-driven complex fields are
    // commonly stored as JSON/JSONB. Cast those columns to text so search can
    // still discover human-authored content through the admin collection API.
    if (dataType === "json") {
      textFilters.push(ilike(sql`${column}::text`, `%${search}%`));
    }
  }
  if (!textFilters.length) return undefined;
  return or(...textFilters);
}

type ExpandPaths = {
  root: Set<string>;
  nested: Map<string, string[]>;
};

function splitExpandPaths(expand: string[]): ExpandPaths {
  const root = new Set<string>();
  const nested = new Map<string, Set<string>>();

  for (const entry of expand) {
    const raw = String(entry ?? "").trim();
    if (!raw) continue;
    const parts = raw
      .split(".")
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) continue;
    root.add(parts[0]!);
    if (parts.length > 1) {
      const rest = parts.slice(1).join(".");
      const existing = nested.get(parts[0]!) ?? new Set<string>();
      existing.add(rest);
      nested.set(parts[0]!, existing);
    }
  }

  return {
    root,
    nested: new Map(
      Array.from(nested.entries()).map(([key, values]) => [
        key,
        Array.from(values),
      ]),
    ),
  };
}

function isUuidLikeId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function extractId(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as any).id === "string" &&
    ((value as any).id as string).length > 0
  ) {
    return (value as any).id as string;
  }
  return null;
}

function isUnionDescriptor(
  descriptor: FieldDescriptor | undefined,
): descriptor is Extract<FieldDescriptor, { kind: "union" }> {
  return (
    (descriptor as any)?.kind === "union" &&
    Array.isArray((descriptor as any)?.anyOf)
  );
}

function getUnionBranchDescriptorByKey(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  branchKey: string,
): FieldDescriptor | null {
  const branches = Array.isArray((descriptor as any)?.anyOf)
    ? ((descriptor as any).anyOf as FieldDescriptor[])
    : [];
  if (!branches.length) return null;

  const keys = getUnionBranchKeys(descriptor);
  const index = keys.findIndex((key) => key === branchKey);
  if (index < 0 || index >= branches.length) return null;
  return branches[index] ?? null;
}

function decodeUnionEnvelopeValue(
  descriptor: Extract<FieldDescriptor, { kind: "union" }>,
  rawValue: unknown,
): {
  branchKey: string;
  branchDescriptor: FieldDescriptor;
  value: unknown;
} | null {
  const decoded = decodeTaggedUnionValue(rawValue);
  if (!decoded) return null;

  const branchDescriptor = getUnionBranchDescriptorByKey(
    descriptor,
    decoded.branchKey,
  );
  if (!branchDescriptor) return null;

  return {
    branchKey: decoded.branchKey,
    branchDescriptor,
    value: decoded.value,
  };
}

function resolveObjectResourceForProperty(
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  tableResourceByName: Map<string, Resource>,
): Extract<Resource, { kind: "singleton" }> | undefined {
  const tableName = `${parentResource.table.name}${capitalize(propName)}`;
  const resource = tableResourceByName.get(tableName);
  if (resource?.kind === "singleton") return resource;
  return undefined;
}

function resolveArrayResourceForProperty(
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  tableResourceByName: Map<string, Resource>,
): Extract<Resource, { kind: "collection" }> | undefined {
  const tableName = camelCase(
    `${parentResource.table.name}_${snakeCase(propName)}_item`,
  );
  const resource = tableResourceByName.get(tableName);
  if (resource?.kind === "collection") return resource;
  return undefined;
}

function canPersistObjectPropertyOnRootTable(
  resource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  tableResourceByName: Map<string, Resource>,
): boolean {
  if (
    resolveObjectResourceForProperty(resource, propName, tableResourceByName)
  ) {
    return false;
  }

  const colName = descriptorPrimitiveTypeToColumnName(propName);
  return Boolean(findColumn(resource.table.table as any, [colName]));
}

async function fetchModelRefById(
  db: Db,
  schema: Record<string, unknown>,
  modelTableName: string,
  id: string,
): Promise<any | null> {
  const modelTable = (schema as any)[modelTableName];
  if (!modelTable) return null;
  const rows = await db
    .select()
    .from(modelTable)
    .where(eq((modelTable as any).id, id))
    .limit(1);
  return rows[0] ?? null;
}

async function fetchNestedObjectForRow(
  db: Db,
  row: any,
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  objectResource: Extract<Resource, { kind: "singleton" }>,
): Promise<any | null> {
  const fkColName =
    objectResource.rootLink?.column ??
    `${camelCase(parentResource.table.name)}Id`;
  const fkCol = (objectResource.table.table as any)[fkColName];
  if (!fkCol) return null;
  const related = await db
    .select()
    .from(objectResource.table.table)
    .where(eq(fkCol, row.id))
    .limit(1);
  return related[0] ?? null;
}

async function fetchNestedArrayForRow(
  db: Db,
  row: any,
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  arrayResource: Extract<Resource, { kind: "collection" }>,
  isLocalized: boolean,
  opts?: { locale?: string },
): Promise<any[]> {
  const arrayTable = arrayResource.table.table as any;
  const fkColName = `${parentResource.table.name}Id`;
  const fkCol = arrayTable[fkColName];
  if (!fkCol) return [];

  const locale = opts?.locale;
  const localeCol = findColumn(arrayTable, ["locale"]);
  const isDefaultCol = findColumn(arrayTable, ["isDefault", "is_default"]);
  const orderCol = resolveOrderColumn(arrayTable);

  if (isLocalized && localeCol && isDefaultCol) {
    if (locale && locale !== "all") {
      return await db
        .select()
        .from(arrayTable)
        .where(and(eq(fkCol, row.id), eq(arrayTable[localeCol], locale)))
        .orderBy(orderCol);
    }
    if (locale === "all") {
      return await db
        .select()
        .from(arrayTable)
        .where(eq(fkCol, row.id))
        .orderBy(orderCol);
    }
    let items = await db
      .select()
      .from(arrayTable)
      .where(and(eq(fkCol, row.id), eq(arrayTable[isDefaultCol], true)))
      .orderBy(orderCol)
      .limit(1);
    if (!items.length) {
      items = await db
        .select()
        .from(arrayTable)
        .where(eq(fkCol, row.id))
        .orderBy(orderCol)
        .limit(1);
    }
    return items;
  }

  return await db
    .select()
    .from(arrayTable)
    .where(eq(fkCol, row.id))
    .orderBy(orderCol);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readStringProperty(
  value: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "string" && raw.length > 0) return raw;
    if (typeof raw === "number") return String(raw);
  }
  return null;
}

function resolveModelRefArrayItemRefId(
  value: unknown,
  modelName: string,
): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number") return String(value);
  if (!isRecord(value)) return null;

  const modelProp = camelCase(modelName);
  const fkColName = `${modelProp}Id`;
  const directId = readStringProperty(value, [
    fkColName,
    snakeCase(fkColName),
  ]);
  if (directId) return directId;

  const nestedModel = value[modelProp] ?? value[modelName] ?? value[snakeCase(modelName)];
  const nestedId = extractId(nestedModel);
  if (nestedId) return nestedId;

  return extractId(value);
}

async function replaceNestedArrayForRow(
  db: Db,
  schema: Record<string, unknown>,
  parentResource: Extract<Resource, { kind: "collection" | "singleton" }>,
  propName: string,
  propDesc: FieldDescriptor,
  rowId: string,
  nextValue: unknown,
  tableResourceByName: Map<string, Resource>,
) {
  const arrayResource = resolveArrayResourceForProperty(
    parentResource,
    propName,
    tableResourceByName,
  );
  if (!arrayResource) return;

  const arrayHandlers = buildCollectionHandlers(
    db,
    schema,
    arrayResource,
    arrayResource.path,
    undefined,
    undefined,
    tableResourceByName,
  );

  const existing = await arrayHandlers.list(rowId, {
    raw: true,
    page: 0,
    pageSize: 500,
  });
  const existingIds = existing.items
    .map((item) =>
      isRecord(item) && typeof item.id === "string" ? item.id : null,
    )
    .filter((value): value is string => Boolean(value));

  if (existingIds.length > 0) {
    await arrayHandlers.deleteMany(existingIds, rowId);
  }

  if (nextValue == null) return;

  const items = Array.isArray(nextValue) ? nextValue : [nextValue];
  if (items.length === 0) return;
  await arrayHandlers.create(items, rowId);
}

async function persistNestedChildrenForRow(
  db: Db,
  schema: Record<string, unknown>,
  resource: Extract<Resource, { kind: "collection" | "singleton" }>,
  descriptor: FieldDescriptor,
  rowId: string,
  value: unknown,
  tableResourceByName: Map<string, Resource>,
) {
  if (!isObjectField(descriptor) || !isRecord(value)) return;

  for (const [propName, propDesc] of Object.entries(descriptor.properties)) {
    if (!Object.prototype.hasOwnProperty.call(value, propName)) continue;

    const childValue = value[propName];

    if (isObjectField(propDesc)) {
      const objectResource = resolveObjectResourceForProperty(
        resource,
        propName,
        tableResourceByName,
      );
      if (!objectResource) continue;

      const singletonHandlers = buildSingletonHandlers(
        db,
        schema,
        objectResource,
        objectResource.path,
        propDesc,
        undefined,
        tableResourceByName,
      );

      if (childValue == null) {
        await singletonHandlers.delete(rowId);
      } else {
        await singletonHandlers.patch(childValue, rowId);
      }
      continue;
    }

    if (isArrayField(propDesc)) {
      await replaceNestedArrayForRow(
        db,
        schema,
        resource,
        propName,
        propDesc,
        rowId,
        childValue,
        tableResourceByName,
      );
    }
  }
}

async function hydrateNestedModelRefsOnObject(
  db: Db,
  schema: Record<string, unknown>,
  row: any,
  descriptor: FieldDescriptor,
  expandPaths: string[],
  tableResourceByName: Map<string, Resource>,
): Promise<any> {
  if (!expandPaths.length || !isObjectField(descriptor)) return row;

  const { root, nested } = splitExpandPaths(expandPaths);
  const obj = { ...row };

  for (const propName of root) {
    const propDesc = (descriptor as any).properties?.[propName] as
      | FieldDescriptor
      | undefined;
    if (!propDesc || (propDesc as any).kind !== "modelRef") continue;

    const modelName = (propDesc as any).model as string | undefined;
    if (!modelName) continue;

    const fkCol = resolveModelRefColumnName(obj, propName, modelName);
    const fkVal = obj?.[fkCol];
    if (!fkVal) continue;

    const refTableName = camelCase(modelName);
    const refTable = (schema as any)[refTableName];
    if (!refTable) continue;

    const relatedRows = await db
      .select()
      .from(refTable)
      .where(eq((refTable as any).id, fkVal))
      .limit(1);
    let related = relatedRows[0] ?? null;

    const nestedPaths = nested.get(propName) ?? [];
    if (related && nestedPaths.length) {
      const modelRes = tableResourceByName.get(refTableName);
      const modelDesc =
        modelRes && modelRes.kind === "collection" ? modelRes.item : undefined;
      if (modelDesc && isObjectField(modelDesc)) {
        related = await hydrateNestedModelRefsOnObject(
          db,
          schema,
          related,
          modelDesc,
          nestedPaths,
          tableResourceByName,
        );
      }
    }

    obj[propName] = related;
  }

  return obj;
}

async function hydrateNestedExpansionsRecursively(
  db: Db,
  schema: Record<string, unknown>,
  rows: any[],
  resource: Extract<Resource, { kind: "collection" | "singleton" }>,
  expandArrays: string[],
  expandObjects: string[],
  tableResourceByName: Map<string, Resource>,
  opts?: { locale?: string },
): Promise<any[]> {
  if (!rows.length) return rows;
  if (!expandArrays.length && !expandObjects.length) return rows;

  const arrayPaths = splitExpandPaths(expandArrays);
  const objectPaths = splitExpandPaths(expandObjects);
  if (!arrayPaths.root.size && !objectPaths.root.size) return rows;

  if (resource.kind === "collection" && resource.item.kind === "modelRef") {
    const modelProp = camelCase(resource.item.model);
    const touchesModel =
      arrayPaths.root.has(modelProp) || objectPaths.root.has(modelProp);
    if (!touchesModel) return rows;

    const modelRes = tableResourceByName.get(modelProp);
    if (!modelRes || modelRes.kind !== "collection") return rows;

    const childArrayPaths = arrayPaths.nested.get(modelProp) ?? [];
    const childObjectPaths = objectPaths.nested.get(modelProp) ?? [];
    const fkColName = `${modelProp}Id`;

    return await Promise.all(
      rows.map(async (row) => {
        try {
          let modelObj = row?.[modelProp];
          if (!modelObj || typeof modelObj !== "object") {
            const fkVal = row?.[fkColName];
            if (fkVal) {
              modelObj = await fetchModelRefById(
                db,
                schema,
                modelProp,
                String(fkVal),
              );
            }
          }
          if (!modelObj || typeof modelObj !== "object") return row;

          if (!childArrayPaths.length && !childObjectPaths.length) {
            return { ...row, [modelProp]: modelObj };
          }

          const hydratedModel = await hydrateNestedExpansionsRecursively(
            db,
            schema,
            [modelObj],
            modelRes,
            childArrayPaths,
            childObjectPaths,
            tableResourceByName,
            opts,
          );
          return { ...row, [modelProp]: hydratedModel[0] ?? modelObj };
        } catch (err) {
          console.error(`Failed to recursively hydrate ${modelProp}:`, err);
          return row;
        }
      }),
    );
  }

  const descriptor =
    resource.kind === "collection" ? resource.item : resource.descriptor;
  if (!isObjectField(descriptor)) return rows;

  const objectFields: { propName: string; propDesc: FieldDescriptor }[] = [];
  const arrayFields: { propName: string; propDesc: FieldDescriptor }[] = [];
  const modelRefFields: { propName: string; model: string }[] = [];

  for (const [propName, propDescRaw] of Object.entries(descriptor.properties)) {
    const propDesc = propDescRaw as FieldDescriptor;
    if (propDesc.kind === "modelRef") {
      if (arrayPaths.root.has(propName) || objectPaths.root.has(propName)) {
        modelRefFields.push({ propName, model: propDesc.model });
      }
      continue;
    }
    if ((propDesc as any).type === "object") {
      if (arrayPaths.root.has(propName) || objectPaths.root.has(propName)) {
        objectFields.push({ propName, propDesc });
      }
      continue;
    }
    if ((propDesc as any).type === "array" && arrayPaths.root.has(propName)) {
      arrayFields.push({ propName, propDesc });
    }
  }

  if (!objectFields.length && !arrayFields.length && !modelRefFields.length) {
    return rows;
  }

  return await Promise.all(
    rows.map(async (row) => {
      const out = { ...row };

      for (const field of modelRefFields) {
        try {
          const modelTableName = camelCase(field.model);
          const modelRes = tableResourceByName.get(modelTableName);
          if (!modelRes || modelRes.kind !== "collection") continue;

          const fkColName = resolveModelRefColumnName(
            resource.table.table,
            field.propName,
            field.model,
          );
          const fkVal = out?.[fkColName];
          let related =
            out?.[field.propName] && typeof out[field.propName] === "object"
              ? out[field.propName]
              : null;

          if (!related && fkVal) {
            related = await fetchModelRefById(
              db,
              schema,
              modelTableName,
              String(fkVal),
            );
          }
          if (!related) continue;

          const childArrayPaths = arrayPaths.nested.get(field.propName) ?? [];
          const childObjectPaths = objectPaths.nested.get(field.propName) ?? [];
          if (childArrayPaths.length || childObjectPaths.length) {
            const hydrated = await hydrateNestedExpansionsRecursively(
              db,
              schema,
              [related],
              modelRes,
              childArrayPaths,
              childObjectPaths,
              tableResourceByName,
              opts,
            );
            related = hydrated[0] ?? related;
          }
          out[field.propName] = related;
        } catch (err) {
          console.error(
            `Failed to recursively hydrate modelRef ${field.propName}:`,
            err,
          );
        }
      }

      for (const field of objectFields) {
        try {
          const objectRes = resolveObjectResourceForProperty(
            resource,
            field.propName,
            tableResourceByName,
          );
          if (!objectRes) continue;

          let related = await fetchNestedObjectForRow(
            db,
            row,
            resource,
            objectRes,
          );
          if (!related) {
            out[field.propName] = null;
            continue;
          }

          const childArrayPaths = arrayPaths.nested.get(field.propName) ?? [];
          const childObjectPaths = objectPaths.nested.get(field.propName) ?? [];
          if (childArrayPaths.length || childObjectPaths.length) {
            const hydrated = await hydrateNestedExpansionsRecursively(
              db,
              schema,
              [related],
              objectRes,
              childArrayPaths,
              childObjectPaths,
              tableResourceByName,
              opts,
            );
            related = hydrated[0] ?? related;
          }
          out[field.propName] = related;
        } catch (err) {
          console.error(
            `Failed to recursively hydrate object ${field.propName}:`,
            err,
          );
        }
      }

      for (const field of arrayFields) {
        try {
          const arrayRes = resolveArrayResourceForProperty(
            resource,
            field.propName,
            tableResourceByName,
          );
          if (!arrayRes) continue;

          let related = await fetchNestedArrayForRow(
            db,
            row,
            resource,
            arrayRes,
            isLocalizedCustomType(field.propDesc),
            opts,
          );

          const childArrayPaths = arrayPaths.nested.get(field.propName) ?? [];
          const childObjectPaths = objectPaths.nested.get(field.propName) ?? [];
          if (
            related.length &&
            (childArrayPaths.length || childObjectPaths.length)
          ) {
            related = await hydrateNestedExpansionsRecursively(
              db,
              schema,
              related,
              arrayRes,
              childArrayPaths,
              childObjectPaths,
              tableResourceByName,
              opts,
            );
          }

          out[field.propName] = related;
        } catch (err) {
          console.error(
            `Failed to recursively hydrate array ${field.propName}:`,
            err,
          );
        }
      }

      return out;
    }),
  );
}

async function sanitizeLegacyUnionRows(
  db: Db,
  rows: any[],
  resource: Extract<Resource, { kind: "collection" }>,
): Promise<any[]> {
  if (!rows.length) return rows;
  const item = resource.item;

  if (isUnionDescriptor(item)) {
    return await Promise.all(
      rows.map(async (row) => {
        if (!row || typeof row !== "object") return row;
        const source = row as Record<string, unknown>;
        const rawValue = source.value;
        if (rawValue == null) return row;
        const decoded = decodeUnionEnvelopeValue(item, rawValue);
        if (decoded) return row;

        const rowId = extractId(source.id);
        if (rowId) {
          await db
            .update(resource.table.table)
            .set({ value: null } as any)
            .where(eq((resource.table.table as any).id, rowId));
        }
        return { ...source, value: null };
      }),
    );
  }

  if (!isObjectField(item)) return rows;
  const unionProps = Object.entries(item.properties).filter(([, propDesc]) =>
    isUnionDescriptor(propDesc as FieldDescriptor),
  ) as [string, Extract<FieldDescriptor, { kind: "union" }>][];
  if (!unionProps.length) return rows;

  return await Promise.all(
    rows.map(async (row) => {
      if (!row || typeof row !== "object") return row;
      const source = row as Record<string, unknown>;
      const rowId = extractId(source.id);
      const updates: Record<string, unknown> = {};
      const nextRow: Record<string, unknown> = { ...source };

      for (const [propName, propDesc] of unionProps) {
        const columnName = descriptorPrimitiveTypeToColumnName(propName);
        const rawValue = source[columnName];
        if (rawValue == null) continue;
        const decoded = decodeUnionEnvelopeValue(propDesc, rawValue);
        if (decoded) continue;
        updates[columnName] = null;
        nextRow[columnName] = null;
        nextRow[propName] = null;
      }

      if (rowId && Object.keys(updates).length > 0) {
        await db
          .update(resource.table.table)
          .set(updates as any)
          .where(eq((resource.table.table as any).id, rowId));
      }

      return nextRow;
    }),
  );
}

async function hydrateModelRefs(
  db: Db,
  schema: Record<string, unknown>,
  rows: any[],
  resource: Extract<Resource, { kind: "collection" }>,
  expand: string[],
  tableResourceByName: Map<string, Resource>,
): Promise<any[]> {
  if (!expand.length) return rows;

  const { root, nested } = splitExpandPaths(expand);
  const item = resource.item;

  if (isUnionDescriptor(item)) {
    const shouldExpandUnionValue = root.has("value");
    return await Promise.all(
      rows.map(async (row) => {
        if (!row || typeof row !== "object") return row;
        const source = row as Record<string, unknown>;
        const rawValue = source.value;
        if (rawValue == null) return row;

        const decoded = decodeUnionEnvelopeValue(item, rawValue);
        if (!decoded) {
          const rowId = extractId(source.id);
          if (rowId) {
            await db
              .update(resource.table.table)
              .set({ value: null } as any)
              .where(eq((resource.table.table as any).id, rowId));
          }
          return { ...source, value: null };
        }

        if (
          !shouldExpandUnionValue ||
          (decoded.branchDescriptor as any)?.kind !== "modelRef"
        ) {
          return row;
        }

        const modelName = ((decoded.branchDescriptor as any)?.model ??
          "") as string;
        if (!modelName) return row;
        const refId = extractId(decoded.value);
        if (!refId) return row;

        const refTableName = camelCase(modelName);
        const refTable = (schema as any)[refTableName];
        if (!refTable) return row;

        try {
          const relatedRows = await db
            .select()
            .from(refTable)
            .where(eq((refTable as any).id, refId))
            .limit(1);
          let relatedObj = relatedRows[0] ?? null;

          const nestedPaths = nested.get("value") ?? [];
          if (relatedObj && nestedPaths.length) {
            const modelRes = tableResourceByName.get(refTableName);
            const modelDesc =
              modelRes && modelRes.kind === "collection"
                ? modelRes.item
                : undefined;
            if (modelDesc && isObjectField(modelDesc)) {
              relatedObj = await hydrateNestedModelRefsOnObject(
                db,
                schema,
                relatedObj,
                modelDesc,
                nestedPaths,
                tableResourceByName,
              );
            }
          }

          return {
            ...source,
            value: encodeTaggedUnionValue(decoded.branchKey, relatedObj),
          };
        } catch (err) {
          console.error(
            `Failed to hydrate union modelRef value for ${modelName}:`,
            err,
          );
          return row;
        }
      }),
    );
  }

  if (item.kind === "modelRef") {
    const modelName = item.model;
    const propName = camelCase(modelName);

    if (root.has(propName)) {
      const fkCol = `${propName}Id`;
      const refTable = (schema as any)[propName];
      const nestedPaths = nested.get(propName) ?? [];
      const modelRes = tableResourceByName.get(propName);
      const modelDesc =
        modelRes && modelRes.kind === "collection" ? modelRes.item : undefined;

      if (refTable) {
        const hydrated = await Promise.all(
          rows.map(async (row) => {
            const fkVal = row[fkCol];
            if (fkVal) {
              try {
                const related = await db
                  .select()
                  .from(refTable)
                  .where(eq(refTable.id, fkVal))
                  .limit(1);
                let relatedObj = related[0] ?? null;
                if (relatedObj && nestedPaths.length && modelDesc) {
                  relatedObj = await hydrateNestedModelRefsOnObject(
                    db,
                    schema,
                    relatedObj,
                    modelDesc,
                    nestedPaths,
                    tableResourceByName,
                  );
                }
                return { ...row, [propName]: relatedObj };
              } catch (err) {
                console.error(`Failed to hydrate ${propName}:`, err);
                return row;
              }
            }
            return row;
          }),
        );
        return hydrated;
      }
    }
    return rows;
  }

  if (!isObjectField(item)) return rows;

  const refFields: { propName: string; model: string }[] = [];
  const unionRefFields: {
    propName: string;
    descriptor: Extract<FieldDescriptor, { kind: "union" }>;
  }[] = [];

  for (const [propName, propDescRaw] of Object.entries(item.properties)) {
    const propDesc = propDescRaw as FieldDescriptor;
    if (propDesc.kind === "modelRef" && root.has(propName)) {
      refFields.push({ propName, model: propDesc.model });
      continue;
    }
    if (isUnionDescriptor(propDesc) && root.has(propName)) {
      unionRefFields.push({ propName, descriptor: propDesc });
    }
  }

  if (!refFields.length && !unionRefFields.length) return rows;

  const hydrated = await Promise.all(
    rows.map(async (row) => {
      const obj = { ...row };
      for (const ref of refFields) {
        const fkCol = resolveModelRefColumnName(
          resource.table.table,
          ref.propName,
          ref.model,
        );
        const fkVal = (row as any)[fkCol];
        if (fkVal) {
          try {
            const refTableName = camelCase(ref.model);
            const refTable = (schema as any)[refTableName];
            if (refTable) {
              const related = await db
                .select()
                .from(refTable)
                .where(eq((refTable as any).id, fkVal))
                .limit(1);
              let relatedObj = related[0] ?? null;
              const nestedPaths = nested.get(ref.propName) ?? [];
              if (relatedObj && nestedPaths.length) {
                const modelRes = tableResourceByName.get(refTableName);
                const modelDesc =
                  modelRes && modelRes.kind === "collection"
                    ? modelRes.item
                    : undefined;
                if (modelDesc && isObjectField(modelDesc)) {
                  relatedObj = await hydrateNestedModelRefsOnObject(
                    db,
                    schema,
                    relatedObj,
                    modelDesc,
                    nestedPaths,
                    tableResourceByName,
                  );
                }
              }
              obj[ref.propName] = relatedObj;
            }
          } catch (err) {
            console.error(`Failed to hydrate ${ref.propName}:`, err);
          }
        }
      }

      for (const unionRef of unionRefFields) {
        const columnName = descriptorPrimitiveTypeToColumnName(
          unionRef.propName,
        );
        const rawUnion = obj?.[columnName];
        if (rawUnion == null) continue;

        const decoded = decodeUnionEnvelopeValue(unionRef.descriptor, rawUnion);
        if (!decoded) {
          const rowId = extractId((obj as any).id);
          if (rowId) {
            await db
              .update(resource.table.table)
              .set({ [columnName]: null } as any)
              .where(eq((resource.table.table as any).id, rowId));
          }
          obj[columnName] = null;
          obj[unionRef.propName] = null;
          continue;
        }

        if ((decoded.branchDescriptor as any)?.kind !== "modelRef") {
          continue;
        }

        const modelName = ((decoded.branchDescriptor as any)?.model ??
          "") as string;
        if (!modelName) continue;
        const refId = extractId(decoded.value);
        if (!refId) continue;

        const refTableName = camelCase(modelName);
        const refTable = (schema as any)[refTableName];
        if (!refTable) continue;

        try {
          const related = await db
            .select()
            .from(refTable)
            .where(eq((refTable as any).id, refId))
            .limit(1);
          let relatedObj = related[0] ?? null;

          const nestedPaths = nested.get(unionRef.propName) ?? [];
          if (relatedObj && nestedPaths.length) {
            const modelRes = tableResourceByName.get(refTableName);
            const modelDesc =
              modelRes && modelRes.kind === "collection"
                ? modelRes.item
                : undefined;
            if (modelDesc && isObjectField(modelDesc)) {
              relatedObj = await hydrateNestedModelRefsOnObject(
                db,
                schema,
                relatedObj,
                modelDesc,
                nestedPaths,
                tableResourceByName,
              );
            }
          }

          const nextUnion = encodeTaggedUnionValue(
            decoded.branchKey,
            relatedObj,
          );
          obj[columnName] = nextUnion;
          obj[unionRef.propName] = nextUnion;
        } catch (err) {
          console.error(`Failed to hydrate union ${unionRef.propName}:`, err);
        }
      }

      return obj;
    }),
  );

  return hydrated;
}

async function ensureParentId(
  db: Db,
  resource: Extract<Resource, { kind: "collection" }>,
  parentIdRaw: string | undefined,
  tableResourceByName: Map<string, Resource>,
  createIfMissing: boolean,
): Promise<string | undefined> {
  const parent = resource.parent;

  if (!parent) {
    return undefined;
  }

  const { id, shouldCreateParent } = parseParentIdParam(parentIdRaw);

  if (shouldCreateParent && createIfMissing) {
    const parentRes = tableResourceByName.get(parent.table.name);

    if (parentRes?.kind === "singleton") {
      const singletonId = await ensureSingletonChain(
        db,
        parent.table,
        tableResourceByName,
        true,
      );
      return singletonId;
    }
    if (parentRes?.kind === "collection" && parentRes.parent) {
      const grandparentId = await ensureParentId(
        db,
        parentRes,
        undefined,
        tableResourceByName,
        true,
      );

      const insertData: Record<string, unknown> = {};
      if (grandparentId) {
        insertData[parentRes.parent.fk] = grandparentId;
      }

      const inserted = await db
        .insert(parent.table.table)
        .values(insertData)
        .returning({ id: (parent.table.table as any).id });

      return inserted[0]?.id;
    }

    const inserted = await db
      .insert(parent.table.table)
      .values({})
      .returning({ id: (parent.table.table as any).id });
    return inserted[0]?.id;
  }

  const parentRes = tableResourceByName.get(parent.table.name);

  if (id && parentRes?.kind === "singleton") {
    if (!resource.parentRootLink) {
      // fall through to canonical singleton handling
    }
  } else if (id) {
    return id;
  }

  if (resource.parentRootLink) {
    const rootLinkTable = resource.parentRootLink.table;
    const rootLinkCol = resource.parentRootLink.column;
    const rootRes = tableResourceByName.get(rootLinkTable.name);

    if (rootRes?.kind === "singleton") {
      const rootId = await ensureSingletonChain(
        db,
        rootLinkTable,
        tableResourceByName,
        createIfMissing,
      );
      if (!rootId) return undefined;

      const rootHasLinkColumn = !!findColumn(rootLinkTable.table, [
        rootLinkCol,
      ]);

      if (rootHasLinkColumn) {
        const rootRows = await db
          .select()
          .from(rootLinkTable.table)
          .where(eq((rootLinkTable.table as any).id, rootId))
          .limit(1);

        const rootRow = rootRows[0];
        if (!rootRow) return undefined;

        let parentIdFromRoot = (rootRow as any)[rootLinkCol];

        if (!parentIdFromRoot && createIfMissing) {
          const inserted = await db
            .insert(parent.table.table)
            .values({})
            .returning({ id: (parent.table.table as any).id });
          parentIdFromRoot = inserted[0]?.id;

          if (parentIdFromRoot) {
            await db
              .update(rootLinkTable.table)
              .set({ [rootLinkCol]: parentIdFromRoot })
              .where(eq((rootLinkTable.table as any).id, rootId));
          }
        }

        return parentIdFromRoot;
      }

      const parentFkCol = (parent.table.table as any)[rootLinkCol];
      if (!parentFkCol) {
        return undefined;
      }

      const existingChild = await db
        .select({ id: (parent.table.table as any).id })
        .from(parent.table.table)
        .where(eq(parentFkCol, rootId))
        .limit(1);

      if (existingChild[0]) {
        return existingChild[0].id as string;
      }

      if (!createIfMissing) {
        return undefined;
      }

      const inserted = await db
        .insert(parent.table.table)
        .values({ [rootLinkCol]: rootId })
        .returning({ id: (parent.table.table as any).id });
      return inserted[0]?.id;
    }

    if (rootRes?.kind === "collection") {
      const grandparentId = parentIdRaw || id;

      if (!grandparentId) {
        // fall through
      } else {
        if (createIfMissing) {
          const rootIdCol = (rootRes.table.table as any).id;
          const existingRoot = await db
            .select({ id: rootIdCol })
            .from(rootRes.table.table)
            .where(eq(rootIdCol, grandparentId))
            .limit(1);

          if (existingRoot.length === 0) {
            const insertValues: Record<string, unknown> = { id: grandparentId };

            if (rootRes.parent) {
              const rootParentRes = tableResourceByName.get(
                rootRes.parent.table.name,
              );
              let rootParentId: string | undefined;

              if (!rootParentRes || rootParentRes.kind === "singleton") {
                rootParentId = await ensureSingletonChain(
                  db,
                  rootRes.parent.table,
                  tableResourceByName,
                  true,
                );
              } else {
                rootParentId = await ensureParentId(
                  db,
                  rootRes as Extract<Resource, { kind: "collection" }>,
                  undefined,
                  tableResourceByName,
                  true,
                );
              }

              if (rootParentId) {
                insertValues[rootRes.parent.fk] = rootParentId;
              }
            }

            await db.insert(rootRes.table.table).values(insertValues);
          }
        }

        if (parentRes?.kind === "singleton" && resource.parentRootLink) {
          const grandparentFk = resource.parentRootLink.column;

          const singletonRows = await db
            .select({ id: (parent.table.table as any).id })
            .from(parent.table.table)
            .where(
              eq((parent.table.table as any)[grandparentFk], grandparentId),
            )
            .limit(1);

          if (singletonRows.length > 0) {
            return singletonRows[0]!.id;
          }

          if (createIfMissing) {
            const insertValues = { [grandparentFk]: grandparentId };
            const inserted = await db
              .insert(parent.table.table)
              .values(insertValues)
              .returning({ id: (parent.table.table as any).id });
            return inserted[0]?.id;
          }

          return undefined;
        }
      }
    }
  }

  if (!parentRes || parentRes.kind === "singleton") {
    const result = await ensureSingletonChain(
      db,
      parent.table,
      tableResourceByName,
      createIfMissing,
    );
    return result;
  }

  return undefined;
}

export function buildCollectionHandlers(
  db: Db,
  schema: Record<string, unknown>,
  resource: Extract<Resource, { kind: "collection" }>,
  path: string,
  schemaForPath: ZodTypeAny | undefined,
  arraySchemaForPath: ZodTypeAny | undefined,
  tableResourceByName: Map<string, Resource>,
  assetStore?: RuntimeAssetStore,
) {
  const table = resource.table;
  const item = resource.item;
  const parent = resource.parent;
  const hasOrderIndex = !!findColumn(table.table, [
    "orderIndex",
    "order_index",
  ]);
  const childSingletons = Array.from(tableResourceByName.values()).filter(
    (res): res is Extract<Resource, { kind: "singleton" }> =>
      res.kind === "singleton" && res.rootLink?.table.name === table.name,
  );
  const patchSchemaForPath =
    schemaForPath instanceof z.ZodObject && isObjectField(item)
      ? (() => {
          try {
            return schemaForPath.partial();
          } catch {
            return schemaForPath;
          }
        })()
      : schemaForPath;
  const patchArraySchemaForPath =
    arraySchemaForPath && patchSchemaForPath instanceof z.ZodObject
      ? z.array(patchSchemaForPath)
      : arraySchemaForPath;
  const reorderSchema = z.array(
    z.object({
      id: z.union([z.string(), z.number()]),
      orderIndex: z.number(),
    }),
  );

  const addParentFilter = (filters: any[], parentId: string | undefined) => {
    if (parent && parentId != null) {
      filters.push(eq((table.table as any)[parent.fk], parentId));
    }
  };

  const findDraftCandidate = async (resolvedParentId: string) => {
    if (!isObjectField(item)) return undefined;
    if (!childSingletons.length) return undefined;
    if (!parent) return undefined;

    const conditions: any[] = [
      eq((table.table as any)[parent.fk], resolvedParentId),
    ];

    for (const [propName, propDescRaw] of Object.entries(item.properties)) {
      const propDesc = propDescRaw as FieldDescriptor;
      let colName: string | undefined;
      if (isScalarField(propDesc)) {
        colName = descriptorPrimitiveTypeToColumnName(propName);
      } else if (propDesc.kind === "modelRef") {
        colName = resolveModelRefColumnName(
          table.table,
          propName,
          propDesc.model,
        );
      }
      if (!colName) continue;
      const col = (table.table as any)[colName];
      if (col) conditions.push(isNull(col));
    }

    if (hasOrderIndex) {
      const orderCol =
        (table.table as any).orderIndex ?? (table.table as any).order_index;
      if (orderCol) conditions.push(isNull(orderCol));
    }

    const candidates = await db
      .select({ id: (table.table as any).id })
      .from(table.table)
      .where(and(...conditions))
      .limit(5);

    for (const candidate of candidates) {
      const candidateId = candidate.id as string;
      for (const childRes of childSingletons) {
        const childFkColName = childRes.rootLink?.column;
        if (!childFkColName) continue;
        const childFkCol = (childRes.table.table as any)[childFkColName];
        if (!childFkCol) continue;
        const existingChild = await db
          .select({ id: (childRes.table.table as any).id })
          .from(childRes.table.table)
          .where(eq(childFkCol, candidateId))
          .limit(1);
        if (existingChild.length > 0) return candidateId;
      }
    }

    return undefined;
  };

  return {
    list: async (
      parentId?: string,
      opts?: {
        raw?: boolean;
        page?: number;
        pageSize?: number;
        orderBy?: string;
        orderDir?: "asc" | "desc";
        search?: string;
        expand?: string[];
        expandArrays?: string[];
        expandObjects?: string[];
        locale?: string;
      },
    ) => {
      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        false,
      );

      if (parent && resolvedParentId === undefined && parentId !== undefined) {
        return { items: [], total: 0 };
      }

      const rawPage = Number(opts?.page ?? 0);
      const rawPageSize = opts?.pageSize ?? 50;
      const page = Number.isFinite(rawPage)
        ? Math.max(0, Math.floor(rawPage))
        : 0;
      if (!Number.isFinite(rawPageSize) || rawPageSize <= 0) {
        throw new Error(
          "Collection list pageSize must be a positive finite number.",
        );
      }
      const pageSize = Math.max(1, Math.min(Math.floor(rawPageSize), 500));
      const filters: any[] = [];
      addParentFilter(filters, resolvedParentId);
      const searchFilter = opts?.search
        ? buildSearchFilter(opts.search, table.table)
        : undefined;
      if (searchFilter) filters.push(searchFilter);

      const where = filters.length ? and(...filters) : undefined;

      const orderCol = opts?.orderBy
        ? resolveColumnByName(table.table, opts.orderBy)
        : resolveOrderColumn(table.table);
      const orderDir = opts?.orderDir === "desc" ? "desc" : "asc";

      const baseQuery = db.select().from(table.table);
      const filteredQuery = where ? baseQuery.where(where) : baseQuery;

      let orderedQuery = filteredQuery;
      if (orderCol) {
        orderedQuery =
          orderDir === "desc"
            ? filteredQuery.orderBy(desc(orderCol))
            : filteredQuery.orderBy(asc(orderCol));
      }

      const rows = await orderedQuery.limit(pageSize).offset(page * pageSize);

      const baseTotalQuery = db
        .select({ value: sql<number>`count(*)` })
        .from(table.table);
      const totalRows = where
        ? await baseTotalQuery.where(where)
        : await baseTotalQuery;
      const total = Number(totalRows[0]?.value ?? 0);

      const ordered = rows;
      let expanded = await sanitizeLegacyUnionRows(db, ordered, resource);

      if (opts?.expand?.length) {
        expanded = await hydrateModelRefs(
          db,
          schema,
          expanded,
          resource,
          opts.expand,
          tableResourceByName,
        );
      }

      if (opts?.expandArrays?.length || opts?.expandObjects?.length) {
        expanded = await hydrateNestedExpansionsRecursively(
          db,
          schema,
          expanded,
          resource,
          opts?.expandArrays ?? [],
          opts?.expandObjects ?? [],
          tableResourceByName,
          { locale: opts?.locale },
        );
      }

      if (opts?.raw) {
        return { items: expanded, total };
      }

      if (isScalarField(item)) {
        return { items: expanded.map((r: any) => r.value ?? null), total };
      }
      if ((item as any).kind === "modelRef") {
        const fkCol = `${camelCase((item as any).model)}Id`;
        return { items: expanded.map((r: any) => r[fkCol] ?? null), total };
      }
      return { items: expanded, total };
    },

    getById: async (
      id: string,
      parentId?: string,
      opts?: {
        raw?: boolean;
        expand?: string[];
        expandArrays?: string[];
        expandObjects?: string[];
        locale?: string;
      },
    ) => {
      if (!isUuidLikeId(id)) return null;

      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        false,
      );
      const predicates: (ReturnType<typeof eq> | undefined)[] = [
        eq((table.table as any).id, id),
      ];
      if (parent && resolvedParentId != null) {
        predicates.push(eq((table.table as any)[parent.fk], resolvedParentId));
      }
      const condition =
        predicates.length > 1 ? and(...predicates) : (predicates[0] as any);
      const rows = await db.select().from(table.table).where(condition);
      const row = rows[0] ?? null;

      if (!row) return row;

      let expandedRow =
        (await sanitizeLegacyUnionRows(db, [row], resource))[0] ?? row;

      if (opts?.expand?.length) {
        const expandedRows = await hydrateModelRefs(
          db,
          schema,
          [expandedRow],
          resource,
          opts.expand,
          tableResourceByName,
        );
        expandedRow = expandedRows[0] ?? expandedRow;
      }

      if (opts?.expandArrays?.length || opts?.expandObjects?.length) {
        const expandedRows = await hydrateNestedExpansionsRecursively(
          db,
          schema,
          [expandedRow],
          resource,
          opts?.expandArrays ?? [],
          opts?.expandObjects ?? [],
          tableResourceByName,
          { locale: opts?.locale },
        );
        expandedRow = expandedRows[0] ?? expandedRow;
      }

      if (opts?.raw) return expandedRow;
      if (isScalarField(item)) return (expandedRow as any).value ?? null;
      if ((item as any).kind === "modelRef") {
        const fkCol = `${camelCase((item as any).model)}Id`;
        return (expandedRow as any)[fkCol] ?? null;
      }
      return expandedRow;
    },

    create: async (body: unknown, parentId?: string) => {
      const assetKind = getAssetKind(item);
      let uploaded: (UploadResult & { kind: AssetKind }) | null = null;

      if (assetKind) {
        const prepared = await prepareAssetBody(body, assetKind, assetStore);
        if (prepared?.error) {
          return { status: 400, error: prepared.error };
        }
        if (prepared?.body) {
          body = prepared.body;
          uploaded = prepared.upload
            ? { ...prepared.upload, kind: assetKind }
            : null;
        }
      }

      if (patchSchemaForPath) {
        if (Array.isArray(body)) {
          const parsed = patchArraySchemaForPath?.safeParse(body);
          if (!parsed?.success) {
            if (uploaded?.filename) {
              await deleteStoredFile(
                uploaded.filename,
                uploaded.kind,
                assetStore,
              );
            }
            return {
              status: 400,
              error: parsed?.error?.format?.() ?? "Invalid array payload",
            };
          }
          body = parsed.data;
        } else {
          const parsed = patchSchemaForPath.safeParse(body);
          if (!parsed.success) {
            if (uploaded?.filename) {
              await deleteStoredFile(
                uploaded.filename,
                uploaded.kind,
                assetStore,
              );
            }
            return { status: 400, error: parsed.error.format() };
          }
          body = parsed.data;
        }
      }
      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        true,
      );

      const items = Array.isArray(body) ? body : [body];
      const values = items.map((value, idx) => {
        const rec: Record<string, unknown> = {};
        if (parent && resolvedParentId != null) {
          rec[parent.fk] = resolvedParentId;
        }
        if (isScalarField(item)) {
          Object.assign(rec, makeScalarSetter("value", item, value));
        } else if (item.kind === "modelRef") {
          const colName = `${camelCase(item.model)}Id`;
          rec[colName] = resolveModelRefArrayItemRefId(value, item.model);
        } else if (isObjectField(item)) {
          const valObj = value as Record<string, unknown>;
          for (const [propName, propDesc] of Object.entries(item.properties)) {
            const v = valObj[propName];
            if (isScalarField(propDesc)) {
              Object.assign(
                rec,
                makeScalarSetter(
                  descriptorPrimitiveTypeToColumnName(propName),
                  propDesc,
                  v,
                ),
              );
            } else if (propDesc.kind === "modelRef") {
              const colName = resolveModelRefColumnName(
                table.table,
                propName,
                propDesc.model,
              );
              const mv = v as { id?: unknown } | unknown;
              rec[colName] = (mv as any)?.id ?? mv ?? null;
            } else if (isObjectField(propDesc)) {
              if (
                !canPersistObjectPropertyOnRootTable(
                  resource,
                  propName,
                  tableResourceByName,
                )
              ) {
                continue;
              }

              // Check if any nested property has localized custom type or asset type
              // If so, persist the entire object as JSON
              const nestedProperties = (propDesc as any).properties;
              if (isRecord(nestedProperties)) {
                const hasLocalizedCustomType = Object.values(
                  nestedProperties,
                ).some(
                  (nestedDesc: unknown) =>
                    isRecord(nestedDesc) &&
                    isLocalizedCustomType(nestedDesc as FieldDescriptor),
                );
                const hasAssetCustomType = Object.values(nestedProperties).some(
                  (nestedDesc: unknown) =>
                    isRecord(nestedDesc) &&
                    isAssetCustomType(nestedDesc as FieldDescriptor),
                );
                if (hasLocalizedCustomType || hasAssetCustomType) {
                  // Persist the entire localized/asset object as JSON
                  const colName = descriptorPrimitiveTypeToColumnName(propName);
                  rec[colName] = v ?? null;
                  continue;
                }
              }
              // Otherwise, recursively handle nested object (fallback - shouldn't reach here in normal flow)
              const colName = descriptorPrimitiveTypeToColumnName(propName);
              rec[colName] = v ?? null;
            }
          }
        }
        if (hasOrderIndex) rec.orderIndex = idx;
        return rec;
      });
      if (
        items.length === 1 &&
        resolvedParentId != null &&
        isObjectField(item)
      ) {
        const draftId = await findDraftCandidate(resolvedParentId);
        if (draftId) {
          const updated = await db
            .update(table.table)
            .set(values[0]!)
            .where(eq((table.table as any).id, draftId))
            .returning();
          if (updated[0]) {
            await persistNestedChildrenForRow(
              db,
              schema,
              resource,
              item,
              String((updated[0] as any).id),
              items[0],
              tableResourceByName,
            );
          }
          return updated;
        }
      }

      try {
        const inserted = await db
          .insert(table.table)
          .values(values)
          .returning();
        await Promise.all(
          inserted.map((row: any, index: number) =>
            persistNestedChildrenForRow(
              db,
              schema,
              resource,
              item,
              String((row as any).id),
              items[index],
              tableResourceByName,
            ),
          ),
        );
        return inserted;
      } catch (err) {
        if (uploaded?.filename) {
          await deleteStoredFile(uploaded.filename, uploaded.kind, assetStore);
        }
        throw err;
      }
    },

    update: async (id: string, body: unknown, parentId?: string) => {
      if (!isUuidLikeId(id)) return null;

      const assetKind = getAssetKind(item);
      let uploaded: (UploadResult & { kind: AssetKind }) | null = null;

      if (assetKind) {
        const prepared = await prepareAssetBody(body, assetKind, assetStore);
        if (prepared?.error) {
          return { status: 400, error: prepared.error };
        }
        if (prepared?.body) {
          body = prepared.body;
          uploaded = prepared.upload
            ? { ...prepared.upload, kind: assetKind }
            : null;
        }
      }

      if (patchSchemaForPath) {
        if (Array.isArray(body)) {
          const parsed = patchArraySchemaForPath?.safeParse(body);
          if (!parsed?.success) {
            if (uploaded?.filename) {
              await deleteStoredFile(
                uploaded.filename,
                uploaded.kind,
                assetStore,
              );
            }
            return {
              status: 400,
              error: parsed?.error?.format?.() ?? "Invalid array payload",
            };
          }
          if ((parsed.data as any[]).length !== 1) {
            if (uploaded?.filename) {
              await deleteStoredFile(
                uploaded.filename,
                uploaded.kind,
                assetStore,
              );
            }
            return {
              status: 400,
              error: "Array payloads must contain exactly one item",
            };
          }
          body = (parsed.data as any[])[0];
        } else {
          const parsed = patchSchemaForPath.safeParse(body);
          if (!parsed.success) {
            if (uploaded?.filename) {
              await deleteStoredFile(
                uploaded.filename,
                uploaded.kind,
                assetStore,
              );
            }
            return { status: 400, error: parsed.error.format() };
          }
          body = parsed.data;
        }
      }
      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        true,
      );
      const rec: Record<string, unknown> = {};
      if (typeof (body as any)?.orderIndex === "number") {
        rec.orderIndex = (body as any).orderIndex;
      }
      if (isScalarField(item)) {
        Object.assign(rec, makeScalarSetter("value", item, body));
      } else if ((item as any).kind === "modelRef") {
        const colName = `${camelCase((item as any).model)}Id`;
        rec[colName] = resolveModelRefArrayItemRefId(body, (item as any).model);
      } else if (isObjectField(item)) {
        const valObj = body as Record<string, unknown>;
        for (const [propName, propDescRaw] of Object.entries(item.properties)) {
          const propDesc = propDescRaw as FieldDescriptor;
          if (!Object.prototype.hasOwnProperty.call(valObj, propName)) {
            continue;
          }
          const v = valObj[propName];
          if (isScalarField(propDesc)) {
            Object.assign(
              rec,
              makeScalarSetter(
                descriptorPrimitiveTypeToColumnName(propName),
                propDesc,
                v,
              ),
            );
          } else if (propDesc.kind === "modelRef") {
            const colName = resolveModelRefColumnName(
              table.table,
              propName,
              propDesc.model,
            );
            const mv = v as { id?: unknown } | unknown;
            rec[colName] = (mv as any)?.id ?? mv ?? null;
            } else if (isObjectField(propDesc)) {
              if (
                !canPersistObjectPropertyOnRootTable(
                  resource,
                  propName,
                  tableResourceByName,
                )
              ) {
                continue;
              }

              // Check if any nested property has localized custom type or asset type
              // If so, persist the entire object as JSON
              const nestedProperties = (propDesc as any).properties;
            if (isRecord(nestedProperties)) {
              const hasLocalizedCustomType = Object.values(
                nestedProperties,
              ).some(
                (nestedDesc: unknown) =>
                  isRecord(nestedDesc) &&
                  isLocalizedCustomType(nestedDesc as FieldDescriptor),
              );
              const hasAssetCustomType = Object.values(nestedProperties).some(
                (nestedDesc: unknown) =>
                  isRecord(nestedDesc) &&
                  isAssetCustomType(nestedDesc as FieldDescriptor),
              );
              if (hasLocalizedCustomType || hasAssetCustomType) {
                // Persist the entire localized/asset object as JSON
                const colName = descriptorPrimitiveTypeToColumnName(propName);
                rec[colName] = v ?? null;
                continue;
              }
            }
            // Otherwise, persist as JSON (fallback)
            const colName = descriptorPrimitiveTypeToColumnName(propName);
            rec[colName] = v ?? null;
          }
        }
      }
      const condition =
        parent && resolvedParentId != null
          ? and(
              eq((table.table as any).id, id),
              eq((table.table as any)[parent.fk], resolvedParentId),
            )
          : eq((table.table as any).id, id);
      let previousFilename: string | null = null;
      if (uploaded) {
        const existing = await db
          .select({ filename: (table.table as any).filename })
          .from(table.table)
          .where(condition)
          .limit(1);
        previousFilename = (existing[0] as any)?.filename ?? null;
      }
      if (!Object.keys(rec).length) {
        const existing = await db
          .select()
          .from(table.table)
          .where(condition)
          .limit(1);
        const row = existing[0] ?? null;
        if (row) {
          await persistNestedChildrenForRow(
            db,
            schema,
            resource,
            item,
            String((row as any).id),
            body,
            tableResourceByName,
          );
        }
        return row;
      }
      const updated = await db
        .update(table.table)
        .set(rec)
        .where(condition)
        .returning();
      const row = updated[0] ?? null;
      if (row) {
        await persistNestedChildrenForRow(
          db,
          schema,
          resource,
          item,
          String((row as any).id),
          body,
          tableResourceByName,
        );
      }
      if (uploaded) {
        if (!row) {
          await deleteStoredFile(uploaded.filename, uploaded.kind, assetStore);
        } else if (previousFilename && previousFilename !== uploaded.filename) {
          await deleteStoredFile(previousFilename, uploaded.kind, assetStore);
        }
      }
      return row;
    },

    reorder: async (order: unknown, parentId?: string) => {
      if (!hasOrderIndex) {
        return { status: 400, error: "Reordering not supported" };
      }

      const orderItems = Array.isArray(order) ? order : (order as any)?.order;
      const parsed = reorderSchema.safeParse(orderItems);
      if (!parsed.success) {
        return { status: 400, error: parsed.error.format() };
      }

      const items = parsed.data.map((item) => ({
        id: String(item.id),
        orderIndex: item.orderIndex,
      }));

      if (!items.length) {
        return { status: 400, error: "Missing order items" };
      }

      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        false,
      );

      if (parent && resolvedParentId == null) {
        return { status: 404, error: "Parent not found" };
      }

      const orderKey =
        (table.table as any).orderIndex != null
          ? "orderIndex"
          : (table.table as any).order_index != null
            ? "order_index"
            : undefined;

      if (!orderKey) {
        return { status: 400, error: "Reordering not supported" };
      }

      await Promise.all(
        items.map(({ id, orderIndex }: { id: string; orderIndex: number }) => {
          const conditions = [eq((table.table as any).id, id)];
          if (parent && resolvedParentId != null) {
            conditions.push(
              eq((table.table as any)[parent.fk], resolvedParentId),
            );
          }
          const updateValues: Record<string, unknown> = {
            [orderKey]: orderIndex,
          };
          return db
            .update(table.table)
            .set(updateValues)
            .where(conditions.length > 1 ? and(...conditions) : conditions[0]!);
        }),
      );

      return { updated: items.length };
    },

    delete: async (id: string, parentId?: string) => {
      if (!isUuidLikeId(id)) return null;

      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        true,
      );
      const condition =
        parent && resolvedParentId != null
          ? and(
              eq((table.table as any).id, id),
              eq((table.table as any)[parent.fk], resolvedParentId),
            )
          : eq((table.table as any).id, id);
      const deleted = await db.delete(table.table).where(condition).returning();
      return deleted[0] ?? null;
    },

    deleteMany: async (ids: unknown, parentId?: string) => {
      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        true,
      );
      const arr = Array.isArray(ids) ? ids : [ids];
      const idVals = arr
        .map((v) => String(v))
        .filter((s) => typeof s === "string" && s.length > 0) as string[];
      if (!idVals.length) return { status: 400, error: "Invalid ids" };
      const conditions: any[] = [
        inArray((table.table as any).id, idVals as any),
      ];
      if (parent && resolvedParentId != null) {
        conditions.push(eq((table.table as any)[parent.fk], resolvedParentId));
      }
      const deleted = await db
        .delete(table.table)
        .where(and(...conditions))
        .returning();
      return deleted;
    },

    // Diff-based replace: upserts items that have matching IDs, inserts new ones,
    // deletes rows no longer present. Used by the _graph/_mutate engine for nested
    // array properties so mutations are surgical rather than drop-and-recreate.
    replace: async (newItems: unknown[], parentId?: string) => {
      if (!Array.isArray(newItems)) return;

      const resolvedParentId = await ensureParentId(
        db,
        resource,
        parentId,
        tableResourceByName,
        true,
      );

      // Fetch current item IDs for this parent. Model-ref arrays need the FK too:
      // graph documents contain resolved model ids, while the array table has
      // independent join-row ids.
      const modelRefColumnName =
        item.kind === "modelRef" ? `${camelCase(item.model)}Id` : null;
      const modelRefColumn = modelRefColumnName
        ? (table.table as any)[modelRefColumnName]
        : null;
      const parentConditions: any[] = [];
      if (parent && resolvedParentId != null) {
        parentConditions.push(
          eq((table.table as any)[parent.fk], resolvedParentId),
        );
      }
      const currentSelect = modelRefColumn
        ? { id: (table.table as any).id, refId: modelRefColumn }
        : { id: (table.table as any).id };
      const currentRows = await (parentConditions.length
        ? db
            .select(currentSelect)
            .from(table.table)
            .where(and(...parentConditions))
        : db.select(currentSelect).from(table.table));

      const currentIdSet = new Set<string>(
        currentRows.map((r: any) => String(r.id)).filter(Boolean),
      );
      const currentRefRows = new Map<string, string[]>();
      if (modelRefColumn) {
        for (const row of currentRows as any[]) {
          if (!row?.refId || !row?.id) continue;
          const refId = String(row.refId);
          const rowIds = currentRefRows.get(refId) ?? [];
          rowIds.push(String(row.id));
          currentRefRows.set(refId, rowIds);
        }
      }
      const retainedIds = new Set<string>();
      const consumedIds = new Set<string>();

      for (const [idx, rawItem] of newItems.entries()) {
        if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem))
          continue;
        const raw = rawItem as Record<string, unknown>;
        const itemId = raw.id ? String(raw.id) : null;
        const modelRefId =
          item.kind === "modelRef"
            ? resolveModelRefArrayItemRefId(rawItem, item.model)
            : null;
        let existingItemId =
          itemId && currentIdSet.has(itemId) ? itemId : null;
        if (!existingItemId && modelRefId) {
          const candidates = currentRefRows.get(modelRefId) ?? [];
          existingItemId =
            candidates.find((candidate) => !consumedIds.has(candidate)) ?? null;
        }

        // Build column record using the same mapping as `create`
        const rec: Record<string, unknown> = {};
        if (parent && resolvedParentId != null) {
          rec[parent.fk] = resolvedParentId;
        }
        if (isScalarField(item)) {
          Object.assign(rec, makeScalarSetter("value", item, raw));
        } else if (item.kind === "modelRef") {
          if (modelRefColumnName) rec[modelRefColumnName] = modelRefId;
        } else if (isObjectField(item)) {
          for (const [propName, propDescRaw] of Object.entries(
            item.properties,
          )) {
            const propDesc = propDescRaw as FieldDescriptor;
            const v = raw[propName];
            if (isScalarField(propDesc)) {
              Object.assign(
                rec,
                makeScalarSetter(
                  descriptorPrimitiveTypeToColumnName(propName),
                  propDesc,
                  v,
                ),
              );
            } else if (propDesc.kind === "modelRef") {
              const colName = resolveModelRefColumnName(
                table.table,
                propName,
                propDesc.model,
              );
              rec[colName] = (v as any)?.id ?? v ?? null;
            } else if (isLocalizedCustomType(propDesc) || isObjectField(propDesc)) {
              rec[descriptorPrimitiveTypeToColumnName(propName)] = v ?? null;
            }
          }
        }
        if (hasOrderIndex) rec.orderIndex = idx;
        const definedRec = Object.fromEntries(
          Object.entries(rec).filter(
            ([key, value]) =>
              value !== undefined && (table.table as any)[key] != null,
          ),
        );

        if (existingItemId) {
          retainedIds.add(existingItemId);
          consumedIds.add(existingItemId);
          if (Object.keys(definedRec).length > 0) {
            await db
              .update(table.table)
              .set(definedRec)
              .where(eq((table.table as any).id, existingItemId));
          }
          if (isObjectField(item)) {
            await persistNestedChildrenForRow(
              db,
              schema,
              resource,
              item,
              existingItemId,
              raw,
              tableResourceByName,
            );
          }
        } else {
          const inserted = await db
            .insert(table.table)
            .values(definedRec)
            .returning();
          const insertedId = inserted[0]?.id;
          if (insertedId && isObjectField(item)) {
            await persistNestedChildrenForRow(
              db,
              schema,
              resource,
              item,
              String(insertedId),
              raw,
              tableResourceByName,
            );
          }
        }
      }

      // Delete rows no longer present in the new list
      const toDelete = [...currentIdSet].filter((id) => !retainedIds.has(id));
      if (toDelete.length > 0) {
        await db
          .delete(table.table)
          .where(inArray((table.table as any).id, toDelete as any));
      }
    },
  };
}

type AssetKind = "file" | "image" | "video";

type UploadResult = {
  filename: string;
  name: string;
  extension: string;
  mimeType: string;
  size: number;
  storageKey?: string;
};

function getAssetKind(desc: FieldDescriptor): AssetKind | null {
  if (!isObjectField(desc)) return null;
  const props = desc.properties ?? {};
  const requiredKeys = ["filename", "extension", "mimeType", "size"];
  const hasFileFields = requiredKeys.every((key) => key in props);
  if (!hasFileFields) return null;
  if ("length" in props) return "video";
  if ("width" in props || "height" in props) return "image";
  return "file";
}

function isFileLike(value: unknown): value is File {
  if (!value || typeof value !== "object") return false;
  const maybe = value as any;
  return (
    typeof maybe.arrayBuffer === "function" &&
    typeof maybe.name === "string" &&
    typeof maybe.type === "string"
  );
}

function sanitizeFilename(name: string) {
  const base = path.basename(name || "file");
  return base.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extractExtension(filename: string) {
  const ext = path
    .extname(filename || "")
    .slice(1)
    .toLowerCase();
  return ext;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "svg",
]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "avi", "mkv", "ogg"]);

function isAllowedAssetFile(kind: AssetKind, file: File) {
  if (kind === "file") return true;
  const mime = file.type || "";
  const ext = extractExtension(file.name);
  if (kind === "image") {
    return mime.startsWith("image/") || IMAGE_EXTENSIONS.has(ext);
  }
  if (kind === "video") {
    return mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext);
  }
  return false;
}

function coerceNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function getLocalUploadsPath() {
  const uploadsPath = process.env.CMS0_STORAGE_PATH?.trim();
  if (!uploadsPath) {
    throw new Error(
      "CMS0_STORAGE_PATH is required when no runtime asset store is configured.",
    );
  }
  return uploadsPath;
}

async function saveUploadedFile(
  file: File,
  kind: AssetKind,
  assetStore?: RuntimeAssetStore,
): Promise<UploadResult> {
  const safeName = sanitizeFilename(file.name);
  const extension = safeName.includes(".")
    ? safeName.slice(safeName.lastIndexOf(".") + 1)
    : "";
  const name = extension
    ? safeName.slice(0, -(extension.length + 1))
    : safeName;
  const filename = `${randomUUID()}-${safeName}`;
  const data = Buffer.from(await file.arrayBuffer());
  if (assetStore) {
    await assetStore.write(kind, filename, data);
  } else {
    await fs.writeFile(path.join(getLocalUploadsPath(), filename), data);
  }
  return {
    filename,
    name,
    extension,
    mimeType: file.type || "application/octet-stream",
    size: file.size ?? data.length,
    ...(assetStore
      ? { storageKey: assetStore.getStorageKey(kind, filename) }
      : {}),
  };
}

async function deleteStoredFile(
  filename: string,
  kind: AssetKind,
  assetStore?: RuntimeAssetStore,
) {
  if (!filename) return;
  if (assetStore) {
    await assetStore.delete(kind, filename).catch(() => undefined);
    return;
  }
  const safeName = path.basename(filename);
  await fs
    .unlink(path.join(getLocalUploadsPath(), safeName))
    .catch(() => undefined);
}

async function prepareAssetBody(
  body: unknown,
  kind: AssetKind,
  assetStore?: RuntimeAssetStore,
): Promise<
  | {
      body: Record<string, unknown>;
      upload: UploadResult;
      error?: undefined;
    }
  | { error: string; body?: undefined; upload?: undefined }
  | null
> {
  if (Array.isArray(body)) {
    const hasFile = body.some(
      (item) =>
        item && typeof item === "object" && isFileLike((item as any).file),
    );
    if (hasFile) {
      return {
        error: "File uploads must be sent as a single object, not an array.",
      };
    }
    return null;
  }

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    body = Object.fromEntries(body.entries());
  }

  if (!body || typeof body !== "object") return null;
  const file = (body as any).file;
  if (!isFileLike(file)) return null;
  if (!isAllowedAssetFile(kind, file)) {
    return {
      error:
        kind === "image"
          ? "Only image files are allowed."
          : "Only video files are allowed.",
    };
  }

  const upload = await saveUploadedFile(file, kind, assetStore);
  const next: Record<string, unknown> = { ...(body as any) };
  delete next.file;

  next.name = next.name ?? upload.name;
  next.filename = upload.filename;
  if (upload.storageKey) {
    next.storageKey = upload.storageKey;
  }
  next.extension = upload.extension;
  next.mimeType = upload.mimeType;
  next.size = upload.size;

  if (kind === "image" || kind === "video") {
    if ("width" in next) next.width = coerceNumber(next.width);
    if ("height" in next) next.height = coerceNumber(next.height);
  }
  if (kind === "video") {
    if ("length" in next) next.length = coerceNumber(next.length);
  }

  if (next.alt === "") delete next.alt;

  return { body: next, upload };
}
