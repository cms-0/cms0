import {
  eq,
  ne,
  and,
  or,
  not,
  gt,
  gte,
  lt,
  lte,
  inArray,
  ilike,
  sql,
  isNull,
  isNotNull,
  type SQL,
} from "drizzle-orm";
import type { GraphFilterClause } from "@cms0/shared";

type TableLike = Record<string, any>;

const isOperatorObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const resolveColumn = (table: TableLike, fieldPath: string): any | undefined => {
  const segments = fieldPath.split(".");
  const topField = segments[0];
  if (!topField) return undefined;

  const column = table[topField];
  if (!column || typeof column !== "object") return undefined;

  if (segments.length === 1) return column;

  const jsonPath = segments.slice(1).join(".");
  return sql`${column}->>${jsonPath}`;
};

const resolveColumnDataType = (table: TableLike, fieldPath: string): string | undefined => {
  const segments = fieldPath.split(".");
  const topField = segments[0];
  if (!topField) return undefined;

  const col = table[topField];
  if (!col || typeof col !== "object") return undefined;

  return (col as any).dataType;
};

const coerceValue = (dataType: string | undefined, value: unknown): unknown => {
  if (value === null || value === undefined) return value;
  if (dataType === "number" || dataType === "bigint") {
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }
  if (dataType === "boolean") {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
  }
  return value;
};

const buildFieldCondition = (
  table: TableLike,
  field: string,
  condition: unknown,
): SQL | undefined => {
  const column = resolveColumn(table, field);
  if (!column) return undefined;

  const dataType = resolveColumnDataType(table, field);
  const isJsonPath = field.includes(".");

  if (condition === null) {
    return isNull(column);
  }

  if (!isOperatorObject(condition)) {
    const coerced = coerceValue(dataType, condition);
    return eq(column, coerced);
  }

  const conditions: SQL[] = [];

  for (const [op, rawValue] of Object.entries(condition)) {
    switch (op) {
      case "eq": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(eq(column, value));
        break;
      }
      case "ne": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(ne(column, value));
        break;
      }
      case "gt": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(gt(column, value));
        break;
      }
      case "gte": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(gte(column, value));
        break;
      }
      case "lt": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(lt(column, value));
        break;
      }
      case "lte": {
        const value = coerceValue(dataType, rawValue);
        conditions.push(lte(column, value));
        break;
      }
      case "between": {
        if (Array.isArray(rawValue) && rawValue.length === 2) {
          const [low, high] = rawValue;
          conditions.push(
            and(
              gte(column, coerceValue(dataType, low)),
              lte(column, coerceValue(dataType, high)),
            )!,
          );
        }
        break;
      }
      case "in": {
        if (Array.isArray(rawValue) && rawValue.length > 0) {
          const values = rawValue.map((v) => coerceValue(dataType, v));
          conditions.push(inArray(column, values));
        }
        break;
      }
      case "notIn": {
        if (Array.isArray(rawValue) && rawValue.length > 0) {
          const values = rawValue.map((v) => coerceValue(dataType, v));
          conditions.push(not(inArray(column, values)));
        }
        break;
      }
      case "contains": {
        if (typeof rawValue === "string") {
          const target = isJsonPath ? sql`${column}` : column;
          conditions.push(ilike(target, `%${rawValue}%`));
        }
        break;
      }
      case "startsWith": {
        if (typeof rawValue === "string") {
          const target = isJsonPath ? sql`${column}` : column;
          conditions.push(ilike(target, `${rawValue}%`));
        }
        break;
      }
      case "endsWith": {
        if (typeof rawValue === "string") {
          const target = isJsonPath ? sql`${column}` : column;
          conditions.push(ilike(target, `%${rawValue}`));
        }
        break;
      }
      case "isNull": {
        if (rawValue === true) {
          conditions.push(isNull(column));
        } else if (rawValue === false) {
          conditions.push(isNotNull(column));
        }
        break;
      }
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
};

export const buildFilterWhere = (
  clause: GraphFilterClause | undefined,
  table: TableLike,
): SQL | undefined => {
  if (!clause) return undefined;

  const conditions: SQL[] = [];

  for (const [key, value] of Object.entries(clause)) {
    if (key === "AND" || key === "OR" || key === "NOT") continue;

    const condition = buildFieldCondition(table, key, value);
    if (condition) conditions.push(condition);
  }

  if (Array.isArray(clause.AND) && clause.AND.length > 0) {
    const andConditions = clause.AND
      .map((sub) => buildFilterWhere(sub, table))
      .filter((c): c is SQL => c !== undefined);
    if (andConditions.length > 0) {
      conditions.push(and(...andConditions)!);
    }
  }

  if (Array.isArray(clause.OR) && clause.OR.length > 0) {
    const orConditions = clause.OR
      .map((sub) => buildFilterWhere(sub, table))
      .filter((c): c is SQL => c !== undefined);
    if (orConditions.length > 0) {
      conditions.push(or(...orConditions)!);
    }
  }

  if (clause.NOT && typeof clause.NOT === "object") {
    const notCondition = buildFilterWhere(clause.NOT as GraphFilterClause, table);
    if (notCondition) {
      conditions.push(not(notCondition));
    }
  }

  if (conditions.length === 0) return undefined;
  if (conditions.length === 1) return conditions[0];
  return and(...conditions);
};
