import { asc } from "drizzle-orm";
import type { TableSpec } from "./types";

type Db = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export async function getCanonicalSingletonId(
  db: Db,
  tableSpec: TableSpec,
  operation: "read" | "write",
): Promise<string | undefined> {
  const table = tableSpec.table as any;

  const existing = await db
    .select({ id: table.id })
    .from(table)
    .orderBy(asc(table.createdAt))
    .limit(1);

  if (existing.length > 0) {
    return existing[0]!.id;
  }

  if (operation === "read") {
    return undefined;
  }

  const created = await db.insert(table).values({}).returning({ id: table.id });
  return created[0]!.id;
}

export async function ensureCanonicalSingleton(
  db: Db,
  tableSpec: TableSpec,
): Promise<string> {
  const id = await getCanonicalSingletonId(db, tableSpec, "write");
  if (!id) {
    throw new Error(`Failed to ensure singleton for table ${tableSpec.name}`);
  }
  return id;
}

export async function getCanonicalSingleton<T = any>(
  db: Db,
  tableSpec: TableSpec,
  operation: "read" | "write",
): Promise<T | null> {
  const table = tableSpec.table as any;

  const existing = await db
    .select()
    .from(table)
    .orderBy(asc(table.createdAt))
    .limit(1);

  if (existing.length > 0) {
    return existing[0] as T;
  }

  if (operation === "read") {
    return null;
  }

  const created = await db.insert(table).values({}).returning();
  const createdArray = Array.isArray(created) ? created : [created];
  return createdArray.length > 0 ? (createdArray[0] as T) : null;
}
