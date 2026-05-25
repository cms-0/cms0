"use client";

import * as React from "react";

import { arrayMove } from "@dnd-kit/sortable";
import {
  useAdminLatestSnapshotQuery,
  useAdminModelReferenceOptionsQuery,
} from "@cms0/admin-client";
import type {
  AdminContentEntry,
  SchemaDescriptor,
} from "@cms0/admin-contract";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "../button";
import { FieldLabel } from "../field";
import { Input } from "../input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";
import { DescriptorColumnRepresentation } from "./descriptor-representation";
import { buildExpandParamsFromDescriptorProperties } from "./expand-params";
import {
  compileObjectFieldPlan,
  resolveUiOrderingPolicy,
} from "./descriptor-plan";
import { DescriptorValueForm } from "./descriptor-value-form";
import {
  createDescriptorDefault,
  extractLocaleConfigFromSnapshot,
  isRecord,
  normalizeObjectDescriptor,
  resolveModelDescriptorFromSnapshot,
  toTitle,
  unwrapDescriptorFormValue,
} from "./helpers";
import { ModelReferenceSheetEditor } from "./model-reference-sheet-editor";
import {
  normalizeDescriptorTableRow,
  resolveCellAsset,
  resolveNestedArrayCellValue,
} from "./table-value-resolution";
import {
  GraphDocumentContext,
  useGraphDocument,
} from "./graph-document-context";

type NestedArrayFieldProps = {
  disabled?: boolean;
  descriptor: SchemaDescriptor;
  label: string;
  onChange: (value: unknown) => void;
  pathSegments?: string[];
  showHeader?: boolean;
  value: unknown;
  currentPath?: string[];
};

type DescriptorMap = Record<string, SchemaDescriptor>;

const PAGE_SIZE = 10;

function resolveNestedArrayRowId(item: unknown, index: number) {
  if (isRecord(item)) {
    const rawId = item.id;
    if (typeof rawId === "string" || typeof rawId === "number") {
      return String(rawId);
    }
  }

  return `index-${index}`;
}

function NestedArrayReorderHandle() {
  return (
    <div
      aria-label="Reorder row"
      className="text-muted-foreground"
      data-testid="nested-array-reorder-handle"
    >
      <GripVertical className="size-4" />
    </div>
  );
}

type PaginatedArray = {
  data: unknown[];
  pagination: {
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  };
};

function isPaginatedArray(value: unknown): value is PaginatedArray {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value &&
    Array.isArray((value as PaginatedArray).data) &&
    "pagination" in value &&
    typeof (value as PaginatedArray).pagination === "object"
  );
}

export function NestedArrayField({
  descriptor,
  disabled = false,
  showHeader = true,
  label,
  value,
  pathSegments = [],
  onChange,
  currentPath = [],
}: Readonly<NestedArrayFieldProps>) {
  const ctx = useGraphDocument();
  const isBusy = ctx.isMutating || ctx.isFetching;
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx.snapshot),
    [ctx.snapshot],
  );
  // Item edit/create sheets must not allow sub-object accordions to fire
  // ctx.mutate — those paths are relative to the singleton root, not the item.
  const itemSheetCtxValue = React.useMemo(
    () => ({ ...ctx, canSubmitNestedDocument: false }),
    [ctx],
  );
  const [localPage, setLocalPage] = React.useState(1);
  const [localSearch, setLocalSearch] = React.useState("");
  const [isAdding, setIsAdding] = React.useState(false);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [draftValue, setDraftValue] = React.useState<unknown>(null);
  const currentPathKey = currentPath.join(".");
  const stableCurrentPath = React.useMemo(
    () => currentPath,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPathKey],
  );

  const effectiveAdminBaseUrl = ctx.adminBaseUrl;
  const effectiveAdminRoutePrefix = ctx.adminRoutePrefix;

  // Get field-level query options from context for this path
  const ctxFieldOpts = ctx.getFieldOptions(stableCurrentPath);
  const searchValue = ctxFieldOpts?.search ?? localSearch;

  // Derive paginated slice from context document (kept fresh after fetchAndSpliceField).
  // Falls back to the value prop for the non-server-paginated case.
  const ownSlice =
    stableCurrentPath.length > 0
      ? stableCurrentPath.reduce<unknown>(
          (doc, key) =>
            isRecord(doc) ? (doc as Record<string, unknown>)[key] : undefined,
          ctx.document,
        )
      : undefined;

  const paginatedResponse = isPaginatedArray(ownSlice)
    ? ownSlice
    : isPaginatedArray(value)
      ? value
      : null;

  // When editing a singleton graph document, route nested array mutations
  // through the graph API even if the initial server payload is a plain array.
  const useServerSideMutation = Boolean(
    ctx.canSubmitNestedDocument && stableCurrentPath.length > 0,
  );

  const items = paginatedResponse
    ? paginatedResponse.data
    : Array.isArray(value)
      ? value
      : [];
  const indexedItems = React.useMemo(
    () => items.map((item, index) => ({ item, index })),
    [items],
  );
  const filteredItems = React.useMemo(() => {
    if (paginatedResponse || searchValue.trim().length === 0) {
      return indexedItems;
    }

    const normalizedSearch = searchValue.trim().toLowerCase();
    return indexedItems.filter(({ item }) =>
      JSON.stringify(item).toLowerCase().includes(normalizedSearch),
    );
  }, [indexedItems, paginatedResponse, searchValue]);

  const serverPagination = paginatedResponse?.pagination;
  const requestedPageSize =
    serverPagination?.pageSize ?? ctxFieldOpts?.pageSize ?? PAGE_SIZE;
  const currentPageSize =
    requestedPageSize === "full"
      ? Math.max(filteredItems.length, PAGE_SIZE)
      : requestedPageSize;
  const pageCount = serverPagination
    ? serverPagination.pageCount
    : requestedPageSize === "full"
      ? 1
      : Math.max(1, Math.ceil(filteredItems.length / currentPageSize));
  const currentPage =
    requestedPageSize === "full" && !serverPagination
      ? 1
      : (ctxFieldOpts?.page ?? serverPagination?.page ?? localPage);

  const pageStart = (currentPage - 1) * currentPageSize;
  const currentPageItems = serverPagination
    ? filteredItems
    : filteredItems.slice(pageStart, pageStart + currentPageSize);
  const reorderablePageItems = React.useMemo(
    () =>
      currentPageItems.map((entry, pageIndex) => ({
        ...entry,
        pageIndex,
        rowId: resolveNestedArrayRowId(entry.item, entry.index),
      })),
    [currentPageItems],
  );
  const isReorderEnabled = reorderablePageItems.length > 1;

  const itemDescriptor = isRecord(descriptor.items)
    ? (descriptor.items as SchemaDescriptor)
    : ({} as SchemaDescriptor);
  const isModelRefArray = itemDescriptor.kind === "modelRef";
  const isObjectArray =
    itemDescriptor.type === "object" && isRecord(itemDescriptor.properties);
  const modelName = isModelRefArray ? String(itemDescriptor.model ?? "") : "";
  const openHref =
    ctx.resourceRouteBase && pathSegments.length > 0
      ? `${ctx.resourceRouteBase}/${pathSegments.map(encodeURIComponent).join("/")}`
      : null;

  const modelDescriptor = React.useMemo(() => {
    if (!isModelRefArray || modelName.length === 0) {
      return null;
    }

    return normalizeObjectDescriptor(
      resolveModelDescriptorFromSnapshot(ctx.snapshot, modelName),
    );
  }, [isModelRefArray, modelName, ctx?.snapshot]);

  const snapshotQuery = useAdminLatestSnapshotQuery({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    enabled: isModelRefArray && modelName.length > 0 && !modelDescriptor,
  });

  const effectiveModelDescriptor = React.useMemo(
    () =>
      modelDescriptor ??
      normalizeObjectDescriptor(
        resolveModelDescriptorFromSnapshot(snapshotQuery.data?.snapshot, modelName),
      ),
    [modelDescriptor, modelName, snapshotQuery.data?.snapshot],
  );
  const effectiveSchemaSnapshot =
    ctx.snapshot ?? snapshotQuery.data?.snapshot ?? null;

  const modelReferenceExpandQuery = React.useMemo(
    () =>
      buildExpandParamsFromDescriptorProperties(
        isRecord(effectiveModelDescriptor?.properties)
          ? (effectiveModelDescriptor?.properties as Record<string, SchemaDescriptor>)
          : undefined,
      ),
    [effectiveModelDescriptor],
  );

  // Only fetch model options when a sheet is open — the main document fetch
  // already returns resolved model data (resolveModelRefs=true) so table cells
  // use resolution.modelObject as a fallback and don't need this on mount.
  const modelOptionsQuery = useAdminModelReferenceOptionsQuery({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    modelName,
    query: modelReferenceExpandQuery,
    enabled:
      isModelRefArray &&
      modelName.length > 0 &&
      (isAdding || editingIndex !== null),
  });

  const modelEntries = React.useMemo(
    () =>
      Array.isArray(modelOptionsQuery.data?.value)
        ? (modelOptionsQuery.data?.value as AdminContentEntry[])
        : [],
    [modelOptionsQuery.data?.value],
  );

  const modelEntryById = React.useMemo(() => {
    const map = new Map<string, AdminContentEntry>();
    for (const entry of modelEntries) {
      map.set(String(entry.id), entry);
    }
    return map;
  }, [modelEntries]);

  const modelColumnKeys = React.useMemo(() => {
    if (effectiveModelDescriptor) {
      const policy = resolveUiOrderingPolicy(effectiveModelDescriptor);
      return compileObjectFieldPlan(
        effectiveModelDescriptor,
        policy,
        "collectionColumns",
      ).map((entry) => entry.name);
    }

    const first = modelEntries[0];
    if (!first) return [];

    return Object.keys(first)
      .filter((key) => !["id", "createdAt", "updatedAt"].includes(key))
      .sort((left, right) => left.localeCompare(right));
  }, [effectiveModelDescriptor, modelEntries]);

  const objectColumnKeys = React.useMemo(() => {
    if (!isObjectArray) return [];
    const policy = resolveUiOrderingPolicy(itemDescriptor);
    return compileObjectFieldPlan(
      itemDescriptor,
      policy,
      "collectionColumns",
    ).map((entry) => entry.name);
  }, [isObjectArray, itemDescriptor]);

  const { updateFieldOptions } = ctx;

  // Always-current ref so the search effect below doesn't need useServerSideMutation
  // as a reactive dep (avoids firing when the boolean first becomes true on data load).
  const useServerSideMutationRef = React.useRef(useServerSideMutation);
  useServerSideMutationRef.current = useServerSideMutation;

  React.useEffect(() => {
    if (currentPage > pageCount) {
      if (useServerSideMutation) {
        void updateFieldOptions(stableCurrentPath, { page: pageCount });
      } else {
        setLocalPage(pageCount);
      }
    }
  }, [
    currentPage,
    pageCount,
    updateFieldOptions,
    stableCurrentPath,
    useServerSideMutation,
  ]);

  // Skip the initial mount — the full document fetch already loaded page 1 with
  // no search filter.  Only fire when the user actually changes localSearch.
  const searchMountedRef = React.useRef(false);
  React.useEffect(() => {
    if (!searchMountedRef.current) {
      searchMountedRef.current = true;
      return;
    }

    if (!useServerSideMutationRef.current) {
      return;
    }

    if (localSearch.length > 0 && localSearch.length < 3) {
      return;
    }

    const timer = setTimeout(() => {
      void updateFieldOptions(stableCurrentPath, {
        page: 1,
        search: localSearch.trim() || undefined,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [stableCurrentPath, updateFieldOptions, localSearch]);

  const reorderVisibleItem = React.useCallback(
    async (fromPageIndex: number, toPageIndex: number) => {
      if (disabled || isBusy) return;
      if (fromPageIndex === toPageIndex) return;

      const source = reorderablePageItems[fromPageIndex];
      const target = reorderablePageItems[toPageIndex];
      if (!source || !target) return;

      if (useServerSideMutation) {
        const path = "/" + stableCurrentPath.join("/");
        const id = resolveNestedArrayRowId(source.item, source.index);
        const targetIndex = serverPagination
          ? pageStart + toPageIndex
          : target.index;

        await ctx.mutate(
          [
            {
              op: "deleteById",
              path,
              id,
            },
            {
              op: "insert",
              path: `${path}/${targetIndex}`,
              value: source.item,
            },
          ],
          { affectedField: stableCurrentPath[0] },
        );
        return;
      }

      onChange(arrayMove(items, source.index, target.index));
    },
    [
      ctx,
      disabled,
      isBusy,
      items,
      onChange,
      pageStart,
      reorderablePageItems,
      serverPagination,
      stableCurrentPath,
      useServerSideMutation,
    ],
  );

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between">
        {showHeader ? <FieldLabel>{toTitle(label)}</FieldLabel> : null}
        {showHeader && openHref ? (
          <Button asChild type="button" variant="ghost" size="sm">
            <a href={openHref} className="flex items-center gap-1">
              <span>Open</span>
              <ChevronRight className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="min-w-0 rounded-lg border p-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Input
            disabled={disabled}
            className="w-48"
            data-testid="nested-array-search"
            placeholder="Search..."
            value={searchValue}
            onChange={(event) => {
              setLocalSearch(event.target.value);
              if (!paginatedResponse) {
                setLocalPage(1);
              }
            }}
          />
          <Button
            type="button"
            data-testid="nested-array-add"
            disabled={disabled || isBusy}
            onClick={() => {
              if (disabled || isBusy) return;
              setDraftValue(
                isModelRefArray
                  ? null
                  : createDescriptorDefault(itemDescriptor, localeConfig),
              );
              setIsAdding(true);
            }}
          >
            Add
          </Button>
        </div>

        <div className="rounded-md border">
          <Table className="min-w-max" data-testid="nested-array-table">
            <TableHeader>
              <TableRow>
                {isReorderEnabled ? <TableHead className="w-28" /> : null}
                {isModelRefArray && modelColumnKeys.length > 0 ? (
                  modelColumnKeys.map((key) => (
                    <TableHead key={key}>{toTitle(key)}</TableHead>
                  ))
                ) : isObjectArray && objectColumnKeys.length > 0 ? (
                  objectColumnKeys.map((key) => (
                    <TableHead key={key}>{toTitle(key)}</TableHead>
                  ))
                ) : (
                  <TableHead>Value</TableHead>
                )}
                <TableHead className="w-36">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentPageItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={
                      (isModelRefArray && modelColumnKeys.length > 0
                        ? modelColumnKeys.length
                        : isObjectArray && objectColumnKeys.length > 0
                          ? objectColumnKeys.length
                          : 1) + 1 + (isReorderEnabled ? 1 : 0)
                    }
                    className="text-muted-foreground"
                  >
                    No entries yet.
                  </TableCell>
                </TableRow>
              ) : (
                reorderablePageItems.map(({ item, index, pageIndex, rowId }) => {
                  const normalizedRow = normalizeDescriptorTableRow({
                    itemDescriptor,
                    modelDescriptor: effectiveModelDescriptor,
                    modelEntriesById: modelEntryById,
                    modelName,
                    row: item,
                  });
                  const itemId = normalizedRow.modelRefId ?? "";

                  return (
                    <TableRow
                      key={`${rowId}-${itemId || JSON.stringify(item)}`}
                      data-entry-id={rowId}
                    >
                      {isReorderEnabled ? (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <NestedArrayReorderHandle />
                            <Button
                              type="button"
                              aria-label="Move row up"
                              data-testid="nested-array-move-up"
                              variant="ghost"
                              size="icon-sm"
                              disabled={disabled || isBusy || pageIndex === 0}
                              onClick={() => {
                                void reorderVisibleItem(
                                  pageIndex,
                                  pageIndex - 1,
                                );
                              }}
                            >
                              <ChevronUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              aria-label="Move row down"
                              data-testid="nested-array-move-down"
                              variant="ghost"
                              size="icon-sm"
                              disabled={
                                disabled ||
                                isBusy ||
                                pageIndex >= reorderablePageItems.length - 1
                              }
                              onClick={() => {
                                void reorderVisibleItem(
                                  pageIndex,
                                  pageIndex + 1,
                                );
                              }}
                            >
                              <ChevronDown className="size-4" />
                            </Button>
                          </div>
                        </TableCell>
                      ) : null}
                      {isModelRefArray && modelColumnKeys.length > 0 ? (
                        modelColumnKeys.map((key) => {
                          const descriptorForField =
                            effectiveModelDescriptor &&
                            isRecord(effectiveModelDescriptor.properties)
                              ? (effectiveModelDescriptor.properties as DescriptorMap)[
                                  key
                                ]
                              : undefined;
                          let resolved = resolveNestedArrayCellValue(
                            normalizedRow.row,
                            key,
                            descriptorForField,
                          );
                          if (
                            (resolved == null || resolved === "") &&
                            key === modelColumnKeys[0]
                          ) {
                            resolved = itemId || "—";
                          }
                          const asset = resolveCellAsset(
                            key,
                            normalizedRow.row,
                            resolved,
                            descriptorForField,
                            effectiveSchemaSnapshot,
                          );
                          return (
                            <TableCell
                              key={`${index}-${key}`}
                              className="text-sm"
                            >
                              <DescriptorColumnRepresentation
                                asset={asset}
                                descriptor={descriptorForField}
                                value={resolved}
                              />
                            </TableCell>
                          );
                        })
                      ) : isObjectArray && objectColumnKeys.length > 0 ? (
                        objectColumnKeys.map((key) => {
                          const descriptorForField = isRecord(
                            itemDescriptor.properties,
                          )
                            ? (itemDescriptor.properties as DescriptorMap)[key]
                            : undefined;
                          const objectValue = resolveNestedArrayCellValue(
                            normalizedRow.row,
                            key,
                            descriptorForField,
                          );
                          const asset = resolveCellAsset(
                            key,
                            normalizedRow.row,
                            objectValue,
                            descriptorForField,
                            effectiveSchemaSnapshot,
                          );
                          return (
                            <TableCell
                              key={`${index}-${key}`}
                              className="text-sm"
                            >
                              <DescriptorColumnRepresentation
                                asset={asset}
                                descriptor={descriptorForField}
                                value={objectValue}
                              />
                            </TableCell>
                          );
                        })
                      ) : (
                        <TableCell className="font-mono text-sm">
                          <DescriptorColumnRepresentation
                            descriptor={itemDescriptor}
                            value={item}
                          />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            data-testid="nested-array-edit"
                            disabled={disabled || isBusy}
                            onClick={() => {
                              if (disabled || isBusy) return;
                              setDraftValue(
                                isModelRefArray
                                  ? item
                                  : unwrapDescriptorFormValue(
                                      item,
                                      itemDescriptor,
                                    ),
                              );
                              setEditingIndex(index);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            data-testid="nested-array-delete"
                            disabled={disabled || isBusy}
                            onClick={() => {
                              if (disabled || isBusy) return;
                              if (useServerSideMutation) {
                                const rawId = isRecord(item)
                                  ? item.id
                                  : undefined;
                                const id =
                                  typeof rawId === "string" ||
                                  typeof rawId === "number"
                                    ? String(rawId)
                                    : String(index);
                                void ctx.mutate(
                                  [
                                    {
                                      op: "deleteById",
                                      path: "/" + stableCurrentPath.join("/"),
                                      id,
                                    },
                                  ],
                                  { affectedField: stableCurrentPath[0] },
                                );
                              } else {
                                onChange(items.filter((_, i) => i !== index));
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="mt-3 flex items-center justify-between">
          <span className="text-muted-foreground text-sm">
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || currentPage <= 1}
              onClick={() => {
                const newPage = Math.max(1, currentPage - 1);
                if (paginatedResponse) {
                  void updateFieldOptions(stableCurrentPath, { page: newPage });
                } else {
                  setLocalPage(newPage);
                }
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || currentPage >= pageCount}
              onClick={() => {
                const newPage = Math.min(pageCount, currentPage + 1);
                if (paginatedResponse) {
                  void updateFieldOptions(stableCurrentPath, { page: newPage });
                } else {
                  setLocalPage(newPage);
                }
              }}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {isAdding ? (
        <Sheet open onOpenChange={setIsAdding}>
          <SheetContent
            side="right"
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>Add {toTitle(label)}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 p-4">
              {isModelRefArray ? (
                <ModelReferenceSheetEditor
                  disabled={disabled || isBusy}
                  linkActionLabel="Add"
                  mode="create"
                  modelName={modelName}
                  value={draftValue}
                  onCommit={async (nextValue) => {
                    if (nextValue != null) {
                      if (useServerSideMutation) {
                        await ctx.mutate(
                          [
                            {
                              op: "insert",
                              path: "/" + stableCurrentPath.join("/"),
                              value: nextValue,
                            },
                          ],
                          { affectedField: stableCurrentPath[0] },
                        );
                      } else {
                        onChange([...items, nextValue]);
                      }
                    }
                    setIsAdding(false);
                  }}
                />
              ) : (
                <GraphDocumentContext.Provider value={itemSheetCtxValue}>
                  <DescriptorValueForm
                    descriptor={itemDescriptor}
                    initialValue={
                      draftValue ?? createDescriptorDefault(itemDescriptor, localeConfig)
                    }
                    submitDisabled={disabled || isBusy}
                    submitLabel="Add"
                    onSubmit={async (nextValue) => {
                      if (useServerSideMutation) {
                        await ctx.mutate(
                          [
                            {
                              op: "insert",
                              path: "/" + stableCurrentPath.join("/"),
                              value: nextValue,
                            },
                          ],
                          { affectedField: stableCurrentPath[0] },
                        );
                      } else {
                        onChange([...items, nextValue]);
                      }
                      setIsAdding(false);
                    }}
                    pathSegments={pathSegments}
                  />
                </GraphDocumentContext.Provider>
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {editingIndex !== null ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) {
              setEditingIndex(null);
            }
          }}
        >
          <SheetContent
            side="right"
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>Edit {toTitle(label)}</SheetTitle>
            </SheetHeader>
            <div className="space-y-4 p-4">
              {isModelRefArray ? (
                <ModelReferenceSheetEditor
                  disabled={disabled || isBusy}
                  linkActionLabel="Save"
                  mode="edit"
                  modelName={modelName}
                  value={draftValue}
                  onCommit={async () => {
                    if (editingIndex === null) {
                      return;
                    }
                    if (useServerSideMutation) {
                      // The model was already saved by ModelReferenceSheetEditor via
                      // updateMutation. No junction row changes — just refetch the field
                      // so the table reflects the updated model data.
                      await ctx.updateFieldOptions(stableCurrentPath, {});
                    } else {
                      // Client-side: replace the item in the local array with the
                      // resolved model object so the table shows the new values.
                      const currentItem = items[editingIndex];
                      if (currentItem !== undefined) {
                        onChange([
                          ...items.slice(0, editingIndex),
                          currentItem,
                          ...items.slice(editingIndex + 1),
                        ]);
                      }
                    }
                    setEditingIndex(null);
                  }}
                />
              ) : (
                <GraphDocumentContext.Provider value={itemSheetCtxValue}>
                  <DescriptorValueForm
                    descriptor={itemDescriptor}
                    initialValue={
                      draftValue ?? createDescriptorDefault(itemDescriptor, localeConfig)
                    }
                    submitDisabled={disabled || isBusy}
                    submitLabel="Save"
                    onSubmit={async (nextValue) => {
                      if (editingIndex === null) {
                        return;
                      }
                      if (useServerSideMutation) {
                        const currentItem = items[editingIndex];
                        const rawId = isRecord(currentItem)
                          ? currentItem.id
                          : undefined;
                        const id =
                          typeof rawId === "string" || typeof rawId === "number"
                            ? String(rawId)
                            : String(editingIndex);
                        await ctx.mutate(
                          [
                            {
                              op: "updateById",
                              path: "/" + stableCurrentPath.join("/"),
                              id,
                              value: nextValue,
                            },
                          ],
                          { affectedField: stableCurrentPath[0] },
                        );
                      } else {
                        const next = [...items];
                        next[editingIndex] = nextValue;
                        onChange(next);
                      }
                      setEditingIndex(null);
                    }}
                    pathSegments={pathSegments}
                  />
                </GraphDocumentContext.Provider>
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
