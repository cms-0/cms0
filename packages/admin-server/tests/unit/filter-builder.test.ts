import { describe, expect, it } from "vitest";
import { buildFilterWhere } from "../../src/route-gen/filter-builder";
import type { GraphFilterClause } from "@cms0/shared";

const createMockColumn = (name: string, dataType = "string") => ({
  name,
  dataType,
  columnType: "PgText",
});

const createMockTable = (columns: Record<string, { dataType?: string }>) => {
  const table: Record<string, any> = {};
  for (const [key, config] of Object.entries(columns)) {
    table[key] = createMockColumn(key, config.dataType);
  }
  return table;
};

describe("filter-builder", () => {
  const table = createMockTable({
    title: { dataType: "string" },
    views: { dataType: "number" },
    published: { dataType: "boolean" },
    status: { dataType: "string" },
    metadata: { dataType: "json" },
  });

  describe("exact match", () => {
    it("builds eq condition for string shorthand", () => {
      const clause: GraphFilterClause = { title: "Hello" };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds eq condition for number shorthand", () => {
      const clause: GraphFilterClause = { views: 100 };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds eq condition for boolean shorthand", () => {
      const clause: GraphFilterClause = { published: true };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("returns undefined for unknown field", () => {
      const clause: GraphFilterClause = { unknown: "value" };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeUndefined();
    });
  });

  describe("explicit operators", () => {
    it("builds eq condition", () => {
      const clause: GraphFilterClause = { title: { eq: "Hello" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds ne condition", () => {
      const clause: GraphFilterClause = { title: { ne: "Hello" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds gt condition", () => {
      const clause: GraphFilterClause = { views: { gt: 100 } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds gte condition", () => {
      const clause: GraphFilterClause = { views: { gte: 100 } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds lt condition", () => {
      const clause: GraphFilterClause = { views: { lt: 100 } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds lte condition", () => {
      const clause: GraphFilterClause = { views: { lte: 100 } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds in condition", () => {
      const clause: GraphFilterClause = { status: { in: ["draft", "published"] } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds notIn condition", () => {
      const clause: GraphFilterClause = { status: { notIn: ["archived"] } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds contains condition", () => {
      const clause: GraphFilterClause = { title: { contains: "hello" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds startsWith condition", () => {
      const clause: GraphFilterClause = { title: { startsWith: "hello" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds endsWith condition", () => {
      const clause: GraphFilterClause = { title: { endsWith: "world" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds isNull true condition", () => {
      const clause: GraphFilterClause = { title: { isNull: true } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds isNull false condition", () => {
      const clause: GraphFilterClause = { title: { isNull: false } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds between condition", () => {
      const clause: GraphFilterClause = { views: { between: [10, 100] } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });
  });

  describe("combinators", () => {
    it("builds AND condition", () => {
      const clause: GraphFilterClause = {
        AND: [
          { title: { contains: "hello" } },
          { views: { gt: 10 } },
        ],
      };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds OR condition", () => {
      const clause: GraphFilterClause = {
        OR: [
          { status: "draft" },
          { status: "published" },
        ],
      };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds NOT condition", () => {
      const clause: GraphFilterClause = {
        NOT: { status: "archived" },
      };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });

    it("builds nested AND/OR condition", () => {
      const clause: GraphFilterClause = {
        AND: [
          { views: { gt: 10 } },
          {
            OR: [
              { status: "draft" },
              { status: "published" },
            ],
          },
        ],
      };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });
  });

  describe("dot-path fields", () => {
    it("builds condition for JSON dot-path", () => {
      const clause: GraphFilterClause = { "metadata.title": { contains: "hello" } };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });
  });

  describe("edge cases", () => {
    it("returns undefined for empty clause", () => {
      const clause: GraphFilterClause = {};
      const result = buildFilterWhere(clause, table);
      expect(result).toBeUndefined();
    });

    it("returns undefined for undefined clause", () => {
      const result = buildFilterWhere(undefined, table);
      expect(result).toBeUndefined();
    });

    it("handles multiple field conditions", () => {
      const clause: GraphFilterClause = {
        title: { contains: "hello" },
        views: { gt: 10 },
        published: true,
      };
      const result = buildFilterWhere(clause, table);
      expect(result).toBeDefined();
    });
  });
});
