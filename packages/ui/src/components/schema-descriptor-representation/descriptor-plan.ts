"use client";

import type { SchemaDescriptor } from "@cms0/admin-contract";

import { isRecord } from "./helpers";
import { resolvePreferredDisplayField } from "./descriptor-representation";

// ── UiOrderingPolicy ──────────────────────────────────────────────────────────

export type UiOrderingMode = "schema" | "kindThenSchema" | "alphabetical";

export type UiOrderingPolicy = {
  formFields: UiOrderingMode;
  collectionColumns: UiOrderingMode;
  navRoots: UiOrderingMode;
  navChildren: UiOrderingMode;
  modelList: UiOrderingMode;
  prioritizeNavNodesWithChildren: boolean;
  promoteModelRefDisplayField: boolean;
};

export const DEFAULT_UI_ORDERING_POLICY: UiOrderingPolicy = {
  formFields: "schema",
  collectionColumns: "schema",
  navRoots: "schema",
  navChildren: "schema",
  modelList: "schema",
  prioritizeNavNodesWithChildren: false,
  promoteModelRefDisplayField: false,
};

function normalizeUiOrderingMode(value: unknown): UiOrderingMode | null {
  if (value === "schema") return "schema";
  if (value === "kindThenSchema") return "kindThenSchema";
  if (value === "alphabetical") return "alphabetical";
  return null;
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  return null;
}

type PartialUiOrderingPolicy = Partial<{
  formFields: UiOrderingMode;
  collectionColumns: UiOrderingMode;
  navRoots: UiOrderingMode;
  navChildren: UiOrderingMode;
  modelList: UiOrderingMode;
  prioritizeNavNodesWithChildren: boolean;
  promoteModelRefDisplayField: boolean;
}>;

function parsePolicyPatch(input: unknown): PartialUiOrderingPolicy {
  if (!isRecord(input)) return {};

  const patch: PartialUiOrderingPolicy = {};
  const formFields = normalizeUiOrderingMode(input.formFields);
  if (formFields) patch.formFields = formFields;

  const collectionColumns = normalizeUiOrderingMode(input.collectionColumns);
  if (collectionColumns) patch.collectionColumns = collectionColumns;

  const navRoots = normalizeUiOrderingMode(input.navRoots);
  if (navRoots) patch.navRoots = navRoots;

  const navChildren = normalizeUiOrderingMode(input.navChildren);
  if (navChildren) patch.navChildren = navChildren;

  const modelList = normalizeUiOrderingMode(input.modelList);
  if (modelList) patch.modelList = modelList;

  const prioritizeNavNodesWithChildren = normalizeBoolean(
    input.prioritizeNavNodesWithChildren,
  );
  if (prioritizeNavNodesWithChildren !== null) {
    patch.prioritizeNavNodesWithChildren = prioritizeNavNodesWithChildren;
  }

  const promoteModelRefDisplayField = normalizeBoolean(
    input.promoteModelRefDisplayField,
  );
  if (promoteModelRefDisplayField !== null) {
    patch.promoteModelRefDisplayField = promoteModelRefDisplayField;
  }

  return patch;
}

function parseDescriptorPolicyPatch(
  descriptor?: SchemaDescriptor | null,
): PartialUiOrderingPolicy {
  const metadata = isRecord(descriptor) ? descriptor.metadata : null;
  if (!isRecord(metadata)) return {};

  const direct = isRecord(metadata.uiOrdering) ? metadata.uiOrdering : null;
  const uiEntry = isRecord(metadata.ui) ? metadata.ui : null;
  const nested = isRecord(uiEntry?.ordering) ? (uiEntry!.ordering as Record<string, unknown>) : null;
  const source = direct ?? nested;
  if (!source) return {};

  return {
    ...parsePolicyPatch(source),
    ...parsePolicyPatch(source.overrides),
  };
}

export function resolveUiOrderingPolicy(
  descriptor?: SchemaDescriptor | null,
): UiOrderingPolicy {
  const patch = parseDescriptorPolicyPatch(descriptor);
  return { ...DEFAULT_UI_ORDERING_POLICY, ...patch };
}

// ── Field / Column Plan ───────────────────────────────────────────────────────

export type SchemaFieldKind = "primitive" | "modelRef" | "object" | "array";

export type FieldPlanEntry = {
  name: string;
  descriptor: SchemaDescriptor;
  kind: SchemaFieldKind;
  order: number;
};

export type CollectionColumnPlanEntry = {
  key: string;
  header: string;
  descriptor: SchemaDescriptor;
  source: "primitive" | "object" | "modelRef";
};

export function resolveSchemaFieldKind(
  descriptor: SchemaDescriptor,
): SchemaFieldKind {
  if (descriptor.kind === "modelRef") return "modelRef";
  if (descriptor.type === "object") return "object";
  if (descriptor.type === "array") return "array";
  return "primitive";
}

function fieldSortWeight(kind: SchemaFieldKind): number {
  if (kind === "array") return 2;
  if (kind === "object") return 1;
  return 0;
}

function sortFieldEntries<T extends { name: string; kind: SchemaFieldKind; order: number }>(
  entries: T[],
  mode: UiOrderingMode,
): T[] {
  if (mode === "schema") {
    return [...entries].sort((a, b) => a.order - b.order);
  }

  if (mode === "alphabetical") {
    return [...entries].sort((a, b) => a.name.localeCompare(b.name));
  }

  // kindThenSchema
  return [...entries].sort((a, b) => {
    const weightDiff = fieldSortWeight(a.kind) - fieldSortWeight(b.kind);
    if (weightDiff !== 0) return weightDiff;
    return a.order - b.order;
  });
}

function sortColumnEntries<
  T extends { key: string; descriptor: SchemaDescriptor; order: number },
>(entries: T[], mode: UiOrderingMode): T[] {
  if (mode === "schema") {
    return [...entries].sort((a, b) => a.order - b.order);
  }

  if (mode === "alphabetical") {
    return [...entries].sort((a, b) => a.key.localeCompare(b.key));
  }

  // kindThenSchema
  return [...entries].sort((a, b) => {
    const aKind = resolveSchemaFieldKind(a.descriptor);
    const bKind = resolveSchemaFieldKind(b.descriptor);
    const weightDiff = fieldSortWeight(aKind) - fieldSortWeight(bKind);
    if (weightDiff !== 0) return weightDiff;
    return a.order - b.order;
  });
}

export function normalizePropertyOrder(
  propertyNames: string[],
  propertyOrderHint: unknown,
): string[] {
  const uniqueNames = Array.from(new Set(propertyNames));
  if (!Array.isArray(propertyOrderHint) || propertyOrderHint.length === 0) {
    return uniqueNames;
  }

  const hinted = propertyOrderHint
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, source) => {
      return uniqueNames.includes(entry) && source.indexOf(entry) === index;
    });

  const remaining = uniqueNames.filter((name) => !hinted.includes(name));
  return [...hinted, ...remaining];
}

export function compileObjectFieldPlan(
  descriptor: SchemaDescriptor | undefined,
  orderingPolicy: UiOrderingPolicy = DEFAULT_UI_ORDERING_POLICY,
  surface: "formFields" | "collectionColumns" = "formFields",
): FieldPlanEntry[] {
  if (!descriptor || descriptor.type !== "object") {
    return [];
  }

  const properties = isRecord(descriptor.properties)
    ? (descriptor.properties as Record<string, SchemaDescriptor>)
    : {};
  const names = normalizePropertyOrder(
    Object.keys(properties),
    descriptor.propertyOrder,
  );

  const planned = names
    .map((name, index) => {
      const fieldDescriptor = properties[name];
      if (!fieldDescriptor || !isRecord(fieldDescriptor)) return null;
      const kind = resolveSchemaFieldKind(fieldDescriptor as SchemaDescriptor);
      return {
        name,
        descriptor: fieldDescriptor as SchemaDescriptor,
        kind,
        order: index,
      } as FieldPlanEntry;
    })
    .filter((entry): entry is FieldPlanEntry => Boolean(entry));

  const mode =
    surface === "collectionColumns"
      ? orderingPolicy.collectionColumns
      : orderingPolicy.formFields;

  return sortFieldEntries(planned, mode);
}

function compileModelRefColumnPlan(
  modelDescriptor: SchemaDescriptor | undefined,
  orderingPolicy: UiOrderingPolicy,
): CollectionColumnPlanEntry[] {
  const properties = isRecord(modelDescriptor?.properties)
    ? (modelDescriptor!.properties as Record<string, SchemaDescriptor>)
    : {};
  const names = normalizePropertyOrder(
    Object.keys(properties),
    isRecord(modelDescriptor) ? modelDescriptor.propertyOrder : undefined,
  );
  const entries = names
    .map((name) => [name, properties[name]!] as [string, SchemaDescriptor])
    .filter(([, descriptor]) => isRecord(descriptor));
  if (entries.length === 0) {
    return [
      {
        key: "id",
        header: "id",
        descriptor: { type: "string" } as SchemaDescriptor,
        source: "modelRef",
      },
    ];
  }

  const ordered = entries.map(([key, descriptor], index) => ({
    key,
    descriptor,
    order: index,
  }));

  if (orderingPolicy.promoteModelRefDisplayField) {
    const preferredKey = resolvePreferredDisplayField(properties)?.[0];
    if (preferredKey) {
      const index = ordered.findIndex((entry) => entry.key === preferredKey);
      if (index > 0) {
        const [picked] = ordered.splice(index, 1);
        if (picked) ordered.unshift(picked);
      }
    }
  }

  const orderedWithUpdatedIndexes = ordered.map((entry, index) => ({
    ...entry,
    order: index,
  }));

  return sortColumnEntries(
    orderedWithUpdatedIndexes,
    orderingPolicy.collectionColumns,
  ).map(({ key, descriptor }) => ({
    key,
    header: key,
    descriptor,
    source: "modelRef" as const,
  }));
}

export function compileCollectionColumnPlan(args: {
  itemKind: "primitive" | "object" | "modelRef";
  itemDescriptor: SchemaDescriptor;
  modelDescriptor?: SchemaDescriptor;
  orderingPolicy?: UiOrderingPolicy;
}): CollectionColumnPlanEntry[] {
  const {
    itemKind,
    itemDescriptor,
    modelDescriptor,
    orderingPolicy = DEFAULT_UI_ORDERING_POLICY,
  } = args;

  if (itemKind === "primitive") {
    return [
      {
        key: "value",
        header: "Value",
        descriptor: itemDescriptor,
        source: "primitive",
      },
    ];
  }

  if (itemKind === "object") {
    const compiled = compileObjectFieldPlan(
      itemDescriptor,
      orderingPolicy,
      "collectionColumns",
    ).map((entry) => ({
      key: entry.name,
      header: entry.name,
      descriptor: entry.descriptor,
      source: "object" as const,
      order: entry.order,
    }));
    if (compiled.length > 0) return compiled;
    return [
      {
        key: "id",
        header: "Item",
        descriptor: { type: "string" } as SchemaDescriptor,
        source: "object",
      },
    ];
  }

  return compileModelRefColumnPlan(modelDescriptor, orderingPolicy);
}
