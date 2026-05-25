import { eq, asc, and } from "drizzle-orm";
import { camelCase, snakeCase } from "lodash";
import type { ZodTypeAny } from "zod";
import { decodeTaggedUnionValue, type FieldDescriptor } from "@cms0/shared";
import type { Resource, TableSpec } from "./types";
import { getCanonicalSingletonId } from "./canonical-singleton";
import {
  descriptorPrimitiveTypeToColumnName,
  makeScalarSetter,
  isScalarField,
  isObjectField,
  isUnionField,
  findColumn,
  resolveOrderColumn,
  isLocalizedCustomType,
  isAssetCustomType,
  resolveModelRefColumnName,
} from "./helpers";
import { ensureSingletonChain } from "./singleton-handlers-internal";

type Db = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

function getDescriptorPathFieldName(path: string): string {
  return path.split("/").filter(Boolean).pop() ?? path;
}

export function buildSingletonHandlers(
  db: Db,
  schema: Record<string, unknown>,
  resource: Extract<Resource, { kind: "singleton" }>,
  path: string,
  descriptor: FieldDescriptor,
  schemaForPath: ZodTypeAny | undefined,
  tableResourceByName: Map<string, Resource>,
) {
  const table = resource.table;

  async function sanitizeLegacyUnionObjectColumns(
    row: Record<string, unknown>,
    objectDescriptor: Extract<FieldDescriptor, { type: "object" }>,
  ) {
    const rowId = typeof row.id === "string" ? row.id : null;
    const updates: Record<string, unknown> = {};
    const nextRow: Record<string, unknown> = { ...row };

    for (const [propName, propDesc] of Object.entries(
      objectDescriptor.properties,
    )) {
      if (!isUnionField(propDesc as FieldDescriptor)) continue;
      const columnName = descriptorPrimitiveTypeToColumnName(propName);
      const rawUnion = row[columnName];
      if (rawUnion == null) continue;
      if (decodeTaggedUnionValue(rawUnion)) continue;
      updates[columnName] = null;
      nextRow[columnName] = null;
      nextRow[propName] = null;
    }

    if (rowId && Object.keys(updates).length > 0) {
      await db
        .update(table.table)
        .set(updates as any)
        .where(eq((table.table as any).id, rowId));
    }

    return nextRow;
  }

  return {
    get: async (
      parentId?: string,
      opts?: { expandArrays?: string[]; locale?: string },
    ) => {
      if (isScalarField(descriptor)) {
        const col = descriptorPrimitiveTypeToColumnName(path);
        const id = await getCanonicalSingletonId(db, table, "read");
        if (!id) return null;

        const rows = await db
          .select()
          .from(table.table)
          .where(eq((table.table as any).id, id))
          .limit(1);
        const rawValue = rows[0] ? (rows[0] as any)[col] : null;
        if (
          isUnionField(descriptor) &&
          rawValue != null &&
          !decodeTaggedUnionValue(rawValue)
        ) {
          await db
            .update(table.table)
            .set({ [col]: null } as any)
            .where(eq((table.table as any).id, id));
          return null;
        }
        return rawValue;
      }

      if (descriptor.kind === "modelRef") {
        const colName = resolveModelRefColumnName(
          table.table,
          getDescriptorPathFieldName(path),
          descriptor.model,
        );
        const id = await getCanonicalSingletonId(db, table, "read");
        if (!id) return null;

        const rows = await db
          .select()
          .from(table.table)
          .where(eq((table.table as any).id, id))
          .limit(1);
        return rows[0] ? (rows[0] as any)[colName] : null;
      }

      if (resource.rootLink && isObjectField(descriptor)) {
        const parentTable = resource.rootLink.table;
        const targetTable = table.table;

        const parentRes = tableResourceByName.get(parentTable.name);
        let effectiveParentId: string | undefined;

        const validParentId =
          parentId && parentId !== "undefined" ? parentId : undefined;

        if (validParentId && parentRes?.kind === "collection") {
          effectiveParentId = validParentId;
        } else if (!parentRes || parentRes.kind === "singleton") {
          effectiveParentId = await getCanonicalSingletonId(
            db,
            parentTable,
            "read",
          );
        }

        if (!effectiveParentId) return {};

        const parentRows = await db
          .select()
          .from(parentTable.table)
          .where(eq((parentTable.table as any).id, effectiveParentId))
          .limit(1);
        const parentRow = parentRows[0];
        if (!parentRow) return {};

        let childIdValue = (parentRow as any)[resource.rootLink.column];

        if (!childIdValue) {
          const fkCol = `${camelCase(parentTable.name)}Id`;
          if ((targetTable as any)[fkCol]) {
            const linked = await db
              .select()
              .from(targetTable)
              .where(eq((targetTable as any)[fkCol], effectiveParentId))
              .orderBy(asc((targetTable as any).createdAt))
              .limit(1);
            if (linked[0]) {
              childIdValue = (linked[0] as any).id;
            }
          }
        }

        if (!childIdValue) return {};

        const childRows = await db
          .select()
          .from(targetTable)
          .where(eq((targetTable as any).id, childIdValue))
          .limit(1);
        const childRow = childRows[0] ?? {};
        const sanitizedChildRow =
          childRow && isObjectField(descriptor)
            ? await sanitizeLegacyUnionObjectColumns(
                childRow as Record<string, unknown>,
                descriptor,
              )
            : childRow;
        if (
          opts?.expandArrays?.length &&
          childRow &&
          isObjectField(descriptor)
        ) {
          return await hydrateSingletonArrays(
            db,
            schema,
            sanitizedChildRow,
            resource,
            descriptor,
            opts.expandArrays,
            tableResourceByName,
            opts,
          );
        }
        return sanitizedChildRow;
      }

      const id = await getCanonicalSingletonId(db, table, "read");
      if (!id) return {};

      const rows = await db
        .select()
        .from(table.table)
        .where(eq((table.table as any).id, id))
        .limit(1);
      const row = rows[0] ?? {};
      const sanitizedRow =
        row && isObjectField(descriptor)
          ? await sanitizeLegacyUnionObjectColumns(
              row as Record<string, unknown>,
              descriptor,
            )
          : row;
      if (opts?.expandArrays?.length && row && isObjectField(descriptor)) {
        return await hydrateSingletonArrays(
          db,
          schema,
          sanitizedRow,
          resource,
          descriptor,
          opts.expandArrays,
          tableResourceByName,
          opts,
        );
      }
      return sanitizedRow;
    },

    patch: async (body: unknown, parentId?: string, childId?: string) => {
      if (schemaForPath) {
        if (Array.isArray(body)) {
          return {
            status: 400,
            error: "Arrays are not supported for singletons",
          };
        }
        const parsed = schemaForPath.safeParse(body);
        if (!parsed.success) {
          return { status: 400, error: parsed.error.format() };
        }
        body = parsed.data;
      }

      if (isScalarField(descriptor)) {
        const col = descriptorPrimitiveTypeToColumnName(path);
        const value = makeScalarSetter(col, descriptor, body)![col];
        const id = await getCanonicalSingletonId(db, table, "write");
        if (!id) return null;

        await db
          .update(table.table)
          .set({ [col]: value })
          .where(eq((table.table as any).id, id));
        return value ?? null;
      }

      if (descriptor.kind === "modelRef") {
        const colName = resolveModelRefColumnName(
          table.table,
          getDescriptorPathFieldName(path),
          descriptor.model,
        );
        const valObj = body as { id?: unknown };
        const value = (valObj as any)?.id ?? valObj ?? null;
        const id = await getCanonicalSingletonId(db, table, "write");
        if (!id) return null;

        await db
          .update(table.table)
          .set({ [colName]: value })
          .where(eq((table.table as any).id, id));
        return value ?? null;
      }

      if (resource.rootLink && isObjectField(descriptor)) {
        const parentTable = resource.rootLink.table;
        const targetTable = table.table;
        const fkColOnParent = resource.rootLink.column;

        const objBody: Record<string, unknown> = {};
        const b = body as Record<string, unknown>;

        for (const [propName, propDesc] of Object.entries(
          descriptor.properties,
        )) {
          if (!Object.prototype.hasOwnProperty.call(b, propName)) {
            continue;
          }
          const v = b[propName];
          if (isScalarField(propDesc)) {
            Object.assign(
              objBody,
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
            const val = v as { id?: unknown };
            objBody[colName] = (val as any)?.id ?? val ?? null;
          } else if (isLocalizedCustomType(propDesc)) {
            // Handle LocalizedRichText and LocalizedString as JSON scalars
            const colName = descriptorPrimitiveTypeToColumnName(propName);
            objBody[colName] = v ?? null;
          }
        }

        let effectiveParentId: string | undefined;
        const parentRes = tableResourceByName.get(parentTable.name);
        const validParentId =
          parentId && parentId !== "undefined" ? parentId : undefined;

        if (validParentId && parentRes?.kind === "collection") {
          effectiveParentId = validParentId;
        } else {
          effectiveParentId = await ensureSingletonChain(
            db,
            parentTable,
            tableResourceByName,
          );
        }

        if (!effectiveParentId) return {};

        const parentRows = await db
          .select()
          .from(parentTable.table)
          .where(eq((parentTable.table as any).id, effectiveParentId))
          .limit(1);
        const parentRow = parentRows[0];

        if (!parentRow) return {};

        const fkCol = `${camelCase(parentTable.name)}Id`;
        if ((targetTable as any)[fkCol]) {
          objBody[fkCol] = effectiveParentId;
        }
        const hasSetValues = Object.keys(objBody).length > 0;

        let childIdValue = (parentRow as any)[fkColOnParent];

        if (!childIdValue) {
          const fkColOnChild = `${camelCase(parentTable.name)}Id`;
          let existing: any[] = [];

          if ((targetTable as any)[fkColOnChild]) {
            existing = await db
              .select()
              .from(targetTable)
              .where(eq((targetTable as any)[fkColOnChild], effectiveParentId))
              .orderBy(asc((targetTable as any).createdAt))
              .limit(1);
          } else {
            existing = await db
              .select()
              .from(targetTable)
              .orderBy(asc((targetTable as any).createdAt))
              .limit(1);
          }

          if (existing[0]) {
            childIdValue = (existing[0] as any).id;
            if (hasSetValues) {
              await db
                .update(targetTable)
                .set(objBody)
                .where(eq((targetTable as any).id, childIdValue));
            }
          } else {
            const inserted = await db
              .insert(targetTable)
              .values(objBody)
              .returning({ id: (targetTable as any).id });
            childIdValue = inserted[0]?.id;
          }

          if (childIdValue && findColumn(parentTable.table, [fkColOnParent])) {
            await db
              .update(parentTable.table)
              .set({ [fkColOnParent]: childIdValue })
              .where(eq((parentTable.table as any).id, effectiveParentId));
          }
        } else if (hasSetValues) {
          await db
            .update(targetTable)
            .set(objBody)
            .where(eq((targetTable as any).id, childIdValue));
        }

        if (!childIdValue) return {};

        const result = await db
          .select()
          .from(targetTable)
          .where(eq((targetTable as any).id, childIdValue))
          .limit(1);
        return result[0] ?? {};
      }

      if (isObjectField(descriptor)) {
        const objBody: Record<string, unknown> = {};
        const b = body as Record<string, unknown>;

        for (const [propName, propDesc] of Object.entries(
          descriptor.properties,
        )) {
          if (!Object.prototype.hasOwnProperty.call(b, propName)) {
            continue;
          }
          const v = b[propName];
          if (isScalarField(propDesc)) {
            Object.assign(
              objBody,
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
            const val = v as { id?: unknown };
            objBody[colName] = (val as any)?.id ?? val ?? null;
          } else if (isLocalizedCustomType(propDesc)) {
            // Handle LocalizedRichText and LocalizedString as JSON scalars
            const colName = descriptorPrimitiveTypeToColumnName(propName);
            objBody[colName] = v ?? null;
          } else if (isAssetCustomType(propDesc)) {
            // Handle Image and File types as JSON scalars
            const colName = descriptorPrimitiveTypeToColumnName(propName);
            objBody[colName] = v ?? null;
          }
        }

        const id = await getCanonicalSingletonId(db, table, "write");
        if (!id) return {};

        if (!Object.keys(objBody).length) {
          const result = await db
            .select()
            .from(table.table)
            .where(eq((table.table as any).id, id))
            .limit(1);
          return result[0] ?? {};
        }

        await db
          .update(table.table)
          .set(objBody)
          .where(eq((table.table as any).id, id));

        const result = await db
          .select()
          .from(table.table)
          .where(eq((table.table as any).id, id))
          .limit(1);
        return result[0] ?? {};
      }

      return {};
    },

    delete: async (parentId?: string, childId?: string) => {
      if (resource.rootLink) {
        const parentTable = resource.rootLink.table;
        const fkCol = resource.rootLink.column;

        const parentRes = tableResourceByName.get(parentTable.name);
        let effectiveParentId: string | undefined;

        if (!parentRes || parentRes.kind === "singleton") {
          effectiveParentId = await getCanonicalSingletonId(
            db,
            parentTable,
            "read",
          );
        } else if (parentId) {
          effectiveParentId = parentId;
        }

        if (!effectiveParentId) return { ok: true };

        const parentRows = await db
          .select()
          .from(parentTable.table)
          .where(eq((parentTable.table as any).id, effectiveParentId))
          .limit(1);
        const parentRow = parentRows[0] as any;

        const parentHasLink = !!findColumn(parentTable.table, [fkCol]);
        if (parentHasLink && parentRow && parentRow[fkCol]) {
          const childVal = parentRow[fkCol];
          await db
            .update(parentTable.table)
            .set({ [fkCol]: null })
            .where(eq((parentTable.table as any).id, parentRow.id));
          await db
            .delete(table.table)
            .where(eq((table.table as any).id, childVal as any));
          return { ok: true };
        }

        const fkColOnChild = `${camelCase(parentTable.name)}Id`;
        if ((table.table as any)[fkColOnChild]) {
          await db
            .delete(table.table)
            .where(eq((table.table as any)[fkColOnChild], effectiveParentId));
        }
        return { ok: true };
      }

      const id = await getCanonicalSingletonId(db, table, "read");
      if (!id) return { ok: true };

      await db.delete(table.table).where(eq((table.table as any).id, id));
      return { ok: true };
    },
  };
}

async function hydrateSingletonArrays(
  db: Db,
  schema: Record<string, unknown>,
  row: any,
  resource: Extract<Resource, { kind: "singleton" }>,
  descriptor: Extract<FieldDescriptor, { type: "object" }>,
  expandArrays: string[],
  tableResourceByName: Map<string, Resource>,
  opts?: { locale?: string },
) {
  if (!expandArrays.length) return row;

  const arrayFields: {
    propName: string;
    tableName: string;
    localized: boolean;
  }[] = [];

  for (const [propName, propDesc] of Object.entries(descriptor.properties)) {
    if ((propDesc as any).type === "array" && expandArrays.includes(propName)) {
      const tableName = `${resource.table.name}_${snakeCase(propName)}_item`;
      const resourceForArray = Array.from(tableResourceByName.values()).find(
        (r) => r.table.name === camelCase(tableName),
      );
      if (resourceForArray) {
        arrayFields.push({
          propName,
          tableName: resourceForArray.table.name,
          localized: isLocalizedCustomType(propDesc as FieldDescriptor),
        });
      }
    }
  }

  if (!arrayFields.length) return row;

  const obj = { ...row };
  for (const arrayField of arrayFields) {
    const arrayTable = (schema as any)[arrayField.tableName];
    if (!arrayTable) continue;
    const fkColName = `${resource.table.name}Id`;
    const fkCol = arrayTable[fkColName];
    if (!fkCol) continue;

    const locale = opts?.locale;
    const localeCol = findColumn(arrayTable, ["locale"]);
    const isDefaultCol = findColumn(arrayTable, ["isDefault", "is_default"]);
    const orderCol = resolveOrderColumn(arrayTable);

    if (arrayField.localized && localeCol && isDefaultCol) {
      if (locale && locale !== "all") {
        const items = await db
          .select()
          .from(arrayTable)
          .where(and(eq(fkCol, row.id), eq(arrayTable[localeCol], locale)))
          .orderBy(orderCol);
        obj[arrayField.propName] = items;
        continue;
      }
      if (locale === "all") {
        const items = await db
          .select()
          .from(arrayTable)
          .where(eq(fkCol, row.id))
          .orderBy(orderCol);
        obj[arrayField.propName] = items;
        continue;
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
      obj[arrayField.propName] = items;
      continue;
    }

    const items = await db
      .select()
      .from(arrayTable)
      .where(eq(fkCol, row.id))
      .orderBy(orderCol);
    obj[arrayField.propName] = items;
  }

  return obj;
}
