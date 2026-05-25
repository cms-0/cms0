import { describe, expect, it } from "vitest";

import {
  applyGraphMutations,
  parseGraphMutationInput,
} from "@cms0/admin-server";

describe("graph-mutation-engine", () => {
  describe("parseGraphMutationInput", () => {
    it("parses a valid set op", () => {
      const result = parseGraphMutationInput({
        ops: [{ op: "set", path: "/title", value: "Hello" }],
      });
      expect(result).toEqual({
        ops: [{ op: "set", path: "/title", value: "Hello" }],
      });
    });

    it("parses a valid insert op", () => {
      const result = parseGraphMutationInput({
        ops: [{ op: "insert", path: "/items/-", value: "new" }],
      });
      expect(result).toEqual({
        ops: [{ op: "insert", path: "/items/-", value: "new" }],
      });
    });

    it("parses a valid delete op", () => {
      const result = parseGraphMutationInput({
        ops: [{ op: "delete", path: "/items/0" }],
      });
      expect(result).toEqual({
        ops: [{ op: "delete", path: "/items/0" }],
      });
    });

    it("rejects missing ops array", () => {
      expect(parseGraphMutationInput({})).toBeNull();
    });

    it("rejects non-array ops", () => {
      expect(parseGraphMutationInput({ ops: "bad" })).toBeNull();
    });

    it("rejects invalid op type", () => {
      expect(
        parseGraphMutationInput({
          ops: [{ op: "replace", path: "/x", value: "y" }],
        }),
      ).toBeNull();
    });

    it("rejects op missing path", () => {
      expect(
        parseGraphMutationInput({
          ops: [{ op: "set", value: "y" }],
        }),
      ).toBeNull();
    });

    it("rejects op missing op field", () => {
      expect(
        parseGraphMutationInput({
          ops: [{ path: "/x", value: "y" }],
        }),
      ).toBeNull();
    });
  });

  describe("applyGraphMutations — set", () => {
    it("sets a root property", () => {
      const doc = { title: "Old", body: "Content" };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/title", value: "New" }],
      });
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toEqual({ title: "New", body: "Content" });
    });

    it("sets a deeply nested property", () => {
      const doc = { seo: { meta: { title: "A" } } };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/seo/meta/title", value: "B" }],
      });
      expect(result.ok && result.value).toEqual({
        seo: { meta: { title: "B" } },
      });
    });

    it("sets a new intermediate object path", () => {
      const doc = { existing: true };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/new/deep/value", value: 42 }],
      });
      expect(result.ok && result.value).toEqual({
        existing: true,
        new: { deep: { value: 42 } },
      });
    });

    it("sets an array element by index", () => {
      const doc = { items: ["a", "b", "c"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/items/1", value: "B" }],
      });
      expect(result.ok && result.value).toEqual({ items: ["a", "B", "c"] });
    });

    it("replaces the root document when path is /", () => {
      const doc = { old: true };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/", value: { new: true } }],
      });
      expect(result.ok && result.value).toEqual({ new: true });
    });

    it("deep clones so original is not mutated", () => {
      const doc = { nested: { value: 1 } };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/nested/value", value: 2 }],
      });
      expect(doc.nested.value).toBe(1);
      expect(result.ok && (result.value as any).nested.value).toBe(2);
    });
  });

  describe("applyGraphMutations — insert", () => {
    it("inserts into an array at index", () => {
      const doc = { items: ["a", "c"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "insert", path: "/items/1", value: "b" }],
      });
      expect(result.ok && result.value).toEqual({ items: ["a", "b", "c"] });
    });

    it("appends to array with dash index", () => {
      const doc = { items: ["a", "b"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "insert", path: "/items/-", value: "c" }],
      });
      expect(result.ok && result.value).toEqual({ items: ["a", "b", "c"] });
    });

    it("appends to array property by pushing", () => {
      const doc = { list: [1, 2] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "insert", path: "/list", value: 3 }],
      });
      expect(result.ok && result.value).toEqual({ list: [1, 2, 3] });
    });
  });

  describe("applyGraphMutations — delete", () => {
    it("removes an object property", () => {
      const doc = { a: 1, b: 2 };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "delete", path: "/a" }],
      });
      expect(result.ok && result.value).toEqual({ b: 2 });
    });

    it("removes an array element", () => {
      const doc = { items: ["a", "b", "c"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "delete", path: "/items/1" }],
      });
      expect(result.ok && result.value).toEqual({ items: ["a", "c"] });
    });
  });

  describe("applyGraphMutations — batch", () => {
    it("applies multiple ops in order", () => {
      const doc = { title: "A", items: ["x"] };
      const result = applyGraphMutations(doc, {
        ops: [
          { op: "set", path: "/title", value: "B" },
          { op: "insert", path: "/items/-", value: "y" },
          { op: "set", path: "/count", value: 3 },
        ],
      });
      expect(result.ok && result.value).toEqual({
        title: "B",
        items: ["x", "y"],
        count: 3,
      });
    });
  });

  describe("applyGraphMutations — errors", () => {
    it("fails for invalid path missing leading slash", () => {
      const result = applyGraphMutations({}, {
        ops: [{ op: "set", path: "foo", value: 1 }],
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain("must start with \"/\"");
    });

    it("fails when setting on missing intermediate path", () => {
      const doc = { existing: true };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/existing/missing/field", value: 1 }],
      });
      expect(result.ok).toBe(false);
    });

    it("fails insert into non-array", () => {
      const doc = { count: 5 };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "insert", path: "/count", value: 6 }],
      });
      expect(result.ok).toBe(false);
    });

    it("fails delete on array out of bounds", () => {
      const doc = { items: ["a"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "delete", path: "/items/5" }],
      });
      expect(result.ok).toBe(false);
    });

    it("fails set on array out of bounds", () => {
      const doc = { items: ["a"] };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/items/5", value: "z" }],
      });
      expect(result.ok).toBe(false);
    });

    it("fails delete at root", () => {
      const doc = { a: 1 };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "delete", path: "/" }],
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("JSON Pointer escaping", () => {
    it("handles ~0 (escaped ~) in keys", () => {
      const doc = { "~key": "value" };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/~0key", value: "updated" }],
      });
      expect(result.ok && result.value).toEqual({ "~key": "updated" });
    });

    it("handles ~1 (escaped /) in keys", () => {
      const doc = { "a/b": "value" };
      const result = applyGraphMutations(doc, {
        ops: [{ op: "set", path: "/a~1b", value: "updated" }],
      });
      expect(result.ok && result.value).toEqual({ "a/b": "updated" });
    });
  });
});
