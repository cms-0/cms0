import type { AnyPgTable } from "drizzle-orm/pg-core";
import type { ZodTypeAny } from "zod";
import type { FieldDescriptor } from "@cms0/shared";

export type TableSpec = {
  name: string;
  table: AnyPgTable;
};

export type ResourceSchemas = Record<
  string,
  {
    item: ZodTypeAny;
    array: ZodTypeAny;
  }
>;

export type Resource =
  | {
      kind: "singleton";
      path: string;
      table: TableSpec;
      descriptor: FieldDescriptor;
      rootLink?: { table: TableSpec; column: string };
    }
  | {
      kind: "collection";
      path: string;
      table: TableSpec;
      parent?: { table: TableSpec; fk: string };
      parentRootLink?: { table: TableSpec; column: string };
      item: FieldDescriptor;
    };
