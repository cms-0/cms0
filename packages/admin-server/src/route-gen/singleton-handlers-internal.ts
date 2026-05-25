import { eq, asc } from "drizzle-orm";
import { camelCase } from "lodash";
import type { Resource, TableSpec } from "./types";
import { getCanonicalSingletonId } from "./canonical-singleton";
import { findColumn } from "./helpers";

type Db = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export async function ensureSingletonChain(
  db: Db,
  targetTable: TableSpec,
  tableResourceByName: Map<string, Resource>,
  createIfMissing = true,
): Promise<string | undefined> {
  const targetRes = tableResourceByName.get(targetTable.name);

  if (targetRes && targetRes.kind === "singleton" && targetRes.rootLink) {
    const parentTable = targetRes.rootLink.table;
    const fkColOnParent = targetRes.rootLink.column;

    const parentId = await ensureSingletonChain(
      db,
      parentTable,
      tableResourceByName,
      createIfMissing,
    );
    if (!parentId) return undefined;

    const parentRows = await db
      .select()
      .from(parentTable.table)
      .where(eq((parentTable.table as any).id, parentId))
      .limit(1);
    const parentRow = parentRows[0] as any;
    if (!parentRow) return undefined;

    let childId = parentRow[fkColOnParent];

    if (!childId) {
      const fkColOnChild = `${camelCase(parentTable.name)}Id`;

      if ((targetTable.table as any)[fkColOnChild]) {
        const existing = await db
          .select()
          .from(targetTable.table)
          .where(eq((targetTable.table as any)[fkColOnChild], parentId))
          .orderBy(asc((targetTable.table as any).createdAt))
          .limit(1);
        if (existing[0]) {
          childId = (existing[0] as any).id;
        }
      }

      if (!childId) {
        if (!createIfMissing) return undefined;
        const insertData: any = {};
        if ((targetTable.table as any)[fkColOnChild]) {
          insertData[fkColOnChild] = parentId;
        }

        const inserted = await db
          .insert(targetTable.table)
          .values(insertData)
          .returning({ id: (targetTable.table as any).id });
        childId = inserted[0]?.id;
      }

      if (createIfMissing && childId && findColumn(parentTable.table, [fkColOnParent])) {
        await db
          .update(parentTable.table)
          .set({ [fkColOnParent]: childId })
          .where(eq((parentTable.table as any).id, parentId));
      }
    }

    return childId;
  }

  if (targetRes && targetRes.kind === "collection") {
    if (!createIfMissing) return undefined;

    if (targetRes.parent) {
      const parentTable = targetRes.parent.table;
      const parentFk = targetRes.parent.fk;

      const parentId = await ensureSingletonChain(
        db,
        parentTable,
        tableResourceByName,
        createIfMissing,
      );

      const insertData: Record<string, unknown> = {};
      if (parentId) {
        insertData[parentFk] = parentId;
      }

      const inserted = await db
        .insert(targetTable.table)
        .values(insertData)
        .returning({ id: (targetTable.table as any).id });

      return inserted[0]?.id;
    } else {
      const inserted = await db
        .insert(targetTable.table)
        .values({})
        .returning({ id: (targetTable.table as any).id });
      return inserted[0]?.id;
    }
  }

  const operation = createIfMissing ? "write" : "read";
  let id = await getCanonicalSingletonId(db, targetTable, operation);
  if (!id) {
    if (!createIfMissing) return undefined;
    const inserted = await db
      .insert(targetTable.table)
      .values({})
      .returning({ id: (targetTable.table as any).id });
    id = inserted[0]?.id;
  }
  return id;
}
