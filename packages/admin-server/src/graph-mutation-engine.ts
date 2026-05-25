/**
 * Graph Mutation Engine
 *
 * Applies a batch of JSON-Pointer-like mutation operations to a resolved graph
 * document and returns a new document.  Operations are atomic: if any op fails
 * the whole batch is rejected.
 */

export type GraphMutationOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "insert"; path: string; value: unknown }
  | { op: "delete"; path: string }
  /** Delete the first item in the array at `path` whose `id` field equals `id`. */
  | { op: "deleteById"; path: string; id: string }
  /** Merge `value` into the first item in the array at `path` whose `id` equals `id`. */
  | { op: "updateById"; path: string; id: string; value: unknown };

export type GraphMutationInput = {
  ops: GraphMutationOp[];
};

function parseJsonPointerPath(path: string): string[] {
  if (!path.startsWith("/")) {
    throw new Error(`Invalid mutation path: must start with "/", got "${path}"`);
  }
  if (path === "/") {
    return [];
  }
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepClone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }
  if (isObjectRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = deepClone(child);
    }
    return out as T;
  }
  return value;
}

function getParent(
  document: unknown,
  tokens: string[],
): { parent: Record<string, unknown> | unknown[]; key: string; exists: boolean } {
  if (tokens.length === 0) {
    throw new Error("Cannot mutate root document directly");
  }

  let current: unknown = document;
  const leading = tokens.slice(0, -1);
  const key = tokens[tokens.length - 1]!;

  for (const token of leading) {
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        throw new Error(`Array index out of bounds: ${token}`);
      }
      current = current[index];
    } else if (isObjectRecord(current)) {
      if (!(token in current)) {
        throw new Error(`Missing intermediate property: ${token}`);
      }
      current = current[token];
    } else {
      throw new Error(`Cannot traverse non-object/array at "${token}"`);
    }
  }

  if (Array.isArray(current)) {
    const index = Number(key);
    const exists =
      Number.isFinite(index) && index >= 0 && index < current.length;
    return { parent: current, key, exists };
  }

  if (isObjectRecord(current)) {
    return { parent: current, key, exists: key in current };
  }

  throw new Error(`Cannot apply mutation to non-object/array parent at "${key}"`);
}

function applySet(
  document: unknown,
  tokens: string[],
  value: unknown,
): unknown {
  if (tokens.length === 0) {
    return deepClone(value);
  }

  const cloned = deepClone(document);

  let current: unknown = cloned;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        throw new Error(`Array index out of bounds in set: ${token}`);
      }
      current = current[index];
    } else if (isObjectRecord(current)) {
      if (!(token in current)) {
        current[token] = {};
      }
      current = current[token];
    } else {
      throw new Error(`Cannot traverse non-object/array at "${token}" during set`);
    }
  }

  const last = tokens[tokens.length - 1]!;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (!Number.isFinite(index) || index < 0 || index > current.length) {
      throw new Error(`Invalid array index in set: ${last}`);
    }
    if (index === current.length) {
      current.push(deepClone(value));
    } else {
      current[index] = deepClone(value);
    }
  } else if (isObjectRecord(current)) {
    current[last] = deepClone(value);
  } else {
    throw new Error(`Cannot set on non-object/array at "${last}"`);
  }

  return cloned;
}

function applyInsert(
  document: unknown,
  tokens: string[],
  value: unknown,
): unknown {
  if (tokens.length === 0) {
    throw new Error("Cannot insert at root");
  }

  const cloned = deepClone(document);

  let current: unknown = cloned;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        throw new Error(`Array index out of bounds in insert: ${token}`);
      }
      current = current[index];
    } else if (isObjectRecord(current)) {
      if (!(token in current)) {
        throw new Error(`Missing intermediate property in insert: ${token}`);
      }
      current = current[token];
    } else {
      throw new Error(`Cannot traverse non-object/array at "${token}" during insert`);
    }
  }

  const last = tokens[tokens.length - 1]!;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (last === "-" || index === current.length) {
      current.push(deepClone(value));
    } else if (Number.isFinite(index) && index >= 0 && index <= current.length) {
      current.splice(index, 0, deepClone(value));
    } else {
      throw new Error(`Invalid array insert index: ${last}`);
    }
  } else if (isObjectRecord(current) && Array.isArray(current[last])) {
    (current[last] as unknown[]).push(deepClone(value));
  } else {
    throw new Error(`Cannot insert into non-array at "${last}"`);
  }

  return cloned;
}

function applyDeleteById(
  document: unknown,
  tokens: string[],
  id: string,
): unknown {
  const cloned = deepClone(document);
  if (tokens.length === 0) {
    if (!Array.isArray(cloned)) {
      throw new Error('deleteById: expected root document to be an array');
    }
    const idx = cloned.findIndex(
      (item) => isObjectRecord(item) && (item as any).id === id,
    );
    if (idx === -1) throw new Error(`deleteById: no item with id "${id}" found`);
    cloned.splice(idx, 1);
    return cloned;
  }
  const { parent, key } = getParent(cloned, tokens);
  const arr = Array.isArray(parent) ? parent : (parent as Record<string, unknown>)[key];
  if (!Array.isArray(arr)) {
    throw new Error(`deleteById: expected array at "${tokens.join("/")}"`);
  }
  const idx = arr.findIndex((item) => isObjectRecord(item) && (item as any).id === id);
  if (idx === -1) throw new Error(`deleteById: no item with id "${id}" found`);
  arr.splice(idx, 1);
  return cloned;
}

function applyUpdateById(
  document: unknown,
  tokens: string[],
  id: string,
  value: unknown,
): unknown {
  const cloned = deepClone(document);
  if (tokens.length === 0) {
    if (!Array.isArray(cloned)) {
      throw new Error('updateById: expected root document to be an array');
    }
    const idx = cloned.findIndex(
      (item) => isObjectRecord(item) && (item as any).id === id,
    );
    if (idx === -1) throw new Error(`updateById: no item with id "${id}" found`);
    cloned[idx] = isObjectRecord(cloned[idx]) && isObjectRecord(value)
      ? { ...(cloned[idx] as Record<string, unknown>), ...deepClone(value as Record<string, unknown>) }
      : deepClone(value);
    return cloned;
  }
  const { parent, key } = getParent(cloned, tokens);
  const arr = Array.isArray(parent) ? parent : (parent as Record<string, unknown>)[key];
  if (!Array.isArray(arr)) {
    throw new Error(`updateById: expected array at "${tokens.join("/")}"`);
  }
  const idx = arr.findIndex((item) => isObjectRecord(item) && (item as any).id === id);
  if (idx === -1) throw new Error(`updateById: no item with id "${id}" found`);
  arr[idx] = isObjectRecord(arr[idx]) && isObjectRecord(value)
    ? { ...(arr[idx] as Record<string, unknown>), ...deepClone(value as Record<string, unknown>) }
    : deepClone(value);
  return cloned;
}

function applyDelete(
  document: unknown,
  tokens: string[],
): unknown {
  if (tokens.length === 0) {
    throw new Error("Cannot delete root");
  }

  const cloned = deepClone(document);

  let current: unknown = cloned;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isFinite(index) || index < 0 || index >= current.length) {
        throw new Error(`Array index out of bounds in delete: ${token}`);
      }
      current = current[index];
    } else if (isObjectRecord(current)) {
      if (!(token in current)) {
        throw new Error(`Missing intermediate property in delete: ${token}`);
      }
      current = current[token];
    } else {
      throw new Error(`Cannot traverse non-object/array at "${token}" during delete`);
    }
  }

  const last = tokens[tokens.length - 1]!;
  if (Array.isArray(current)) {
    const index = Number(last);
    if (!Number.isFinite(index) || index < 0 || index >= current.length) {
      throw new Error(`Invalid array delete index: ${last}`);
    }
    current.splice(index, 1);
  } else if (isObjectRecord(current)) {
    delete current[last];
  } else {
    throw new Error(`Cannot delete from non-object/array at "${last}"`);
  }

  return cloned;
}

/**
 * Validate and coerce raw input into a clean `GraphMutationInput`.
 */
export function parseGraphMutationInput(body: unknown): GraphMutationInput | null {
  if (!isObjectRecord(body) || !Array.isArray(body.ops)) {
    return null;
  }

  const ops: GraphMutationOp[] = [];
  for (const raw of body.ops) {
    if (!isObjectRecord(raw) || typeof raw.op !== "string" || typeof raw.path !== "string") {
      return null;
    }
    if (raw.op === "set") {
      ops.push({ op: "set", path: raw.path, value: raw.value });
    } else if (raw.op === "insert") {
      ops.push({ op: "insert", path: raw.path, value: raw.value });
    } else if (raw.op === "delete") {
      ops.push({ op: "delete", path: raw.path });
    } else if (raw.op === "deleteById") {
      if (typeof raw.id !== "string") return null;
      ops.push({ op: "deleteById", path: raw.path, id: raw.id });
    } else if (raw.op === "updateById") {
      if (typeof raw.id !== "string") return null;
      ops.push({ op: "updateById", path: raw.path, id: raw.id, value: raw.value });
    } else {
      return null;
    }
  }

  return { ops };
}

/**
 * Apply a batch of graph mutation ops to a document.
 *
 * Returns `{ ok: true, value }` on success or `{ ok: false, error }` on failure.
 */
export function applyGraphMutations(
  document: unknown,
  input: GraphMutationInput,
):
  | { ok: true; value: unknown }
  | { ok: false; error: string } {
  try {
    let current = document;
    for (const op of input.ops) {
      const tokens = parseJsonPointerPath(op.path);
      switch (op.op) {
        case "set":
          current = applySet(current, tokens, op.value);
          break;
        case "insert":
          current = applyInsert(current, tokens, op.value);
          break;
        case "delete":
          current = applyDelete(current, tokens);
          break;
        case "deleteById":
          current = applyDeleteById(current, tokens, op.id);
          break;
        case "updateById":
          current = applyUpdateById(current, tokens, op.id, op.value);
          break;
      }
    }
    return { ok: true, value: current };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
