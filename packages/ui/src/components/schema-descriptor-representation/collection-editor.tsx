"use client";

import * as React from "react";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from "@tanstack/react-table";
import type {
  AdminContentEntry,
  AdminContentResponse,
  SchemaDescriptor,
} from "@cms0/admin-contract";
import {
  useAdminModelReferenceOptionsQuery,
  useAdminLatestSnapshotQuery,
} from "@cms0/admin-client";
import { useGraphDocument } from "./graph-document-context";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Pencil,
  Trash2,
} from "lucide-react";

import { Button } from "../button";
import { Input } from "../input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";
import {
  DescriptorColumnRepresentation,
  isAuditTimestampFieldName,
  isIdLikeFieldName,
} from "./descriptor-representation";
import { buildExpandParamsFromDescriptorProperties } from "./expand-params";
import {
  compileCollectionColumnPlan,
  resolveUiOrderingPolicy,
} from "./descriptor-plan";
import { DescriptorValueForm } from "./descriptor-value-form";
import {
  createDescriptorDefault,
  extractLocaleConfigFromSnapshot,
  isRecord,
  materializeDescriptorRecord,
  normalizeObjectDescriptor,
  resolveAssetKindFromModelDescriptor,
  resolveModelRefFromItem,
  resolveModelDescriptorFromSnapshot,
  toTitle,
  unwrapDescriptorFormValue,
} from "./helpers";
import { AssetModelForm } from "./inputs/asset-model-form";
import {
  normalizeDescriptorTableRow,
  resolveCellAsset,
  resolveCollectionCellValue,
} from "./table-value-resolution";
import { ModelReferenceSheetEditor } from "./model-reference-sheet-editor";

const shouldHideColumn = (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (normalized === "orderindex" || normalized === "order_index") return true;
  if (normalized === "locale" || normalized === "defaultlocale") return true;
  if (normalized === "default_locale") return true;
  return isIdLikeFieldName(name) || isAuditTimestampFieldName(name);
};

const PAGE_SIZE = 10;

function DragHandle({ entryId }: Readonly<{ entryId: string }>) {
  const { attributes, listeners, setActivatorNodeRef } = useSortable({
    id: entryId,
  });
  return (
    <div
      ref={setActivatorNodeRef}
      aria-label="Reorder row"
      className="cursor-grab text-muted-foreground"
      data-testid="collection-reorder-handle"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </div>
  );
}

function SortableRow({
  entryId,
  children,
}: Readonly<{ entryId: string; children: React.ReactNode }>) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: entryId,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style} data-entry-id={entryId}>
      {children}
    </TableRow>
  );
}

type CollectionEditorProps = {
  canCreate: boolean;
  canDelete: boolean;
  canReorder?: boolean;
  canUpdate: boolean;
  onCreate: (value: unknown) => Promise<void>;
  onDelete: (entryId: string) => Promise<void>;
  onPageChange?: (page: number) => void;
  onReorder?: (entryId: string, newIndex: number) => Promise<void>;
  onSearchChange?: (search: string) => void;
  onSortChange?: (orderBy: string, orderDir: "asc" | "desc") => void;
  onUpdate: (entryId: string, value: unknown) => Promise<void>;
  page?: number;
  pageSize?: number;
  pagination?: AdminContentResponse["pagination"];
  pendingCreate: boolean;
  pendingUpdate: boolean;
  resource: AdminContentResponse["resource"];
  search?: string;
  settingsHref?: string;
  settingsLabel: string;
  value: unknown;
};

export function CollectionEditor({
  canCreate,
  canDelete,
  canReorder = false,
  canUpdate,
  onCreate,
  onDelete,
  onPageChange,
  onReorder,
  onSearchChange,
  onSortChange,
  onUpdate,
  page: externalPage,
  pageSize: externalPageSize,
  pagination,
  pendingCreate,
  pendingUpdate,
  resource,
  search: externalSearch,
  settingsHref,
  settingsLabel,
  value,
}: Readonly<CollectionEditorProps>) {
  const ctx = useGraphDocument();
  const [isHydrated, setIsHydrated] = React.useState(false);
  const isBusy = ctx.isMutating || ctx.isFetching;
  const isAnyPending = pendingCreate || pendingUpdate || isBusy;
  const isActionDisabled = !isHydrated || isAnyPending;
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx.snapshot),
    [ctx.snapshot],
  );
  const effectiveAdminBaseUrl = ctx.adminBaseUrl;
  const effectiveAdminRoutePrefix = ctx.adminRoutePrefix;
  const [localSearch, setLocalSearch] = React.useState(externalSearch ?? "");
  const [localPage, setLocalPage] = React.useState(1);

  const isServerPaginated = pagination != null;
  const page = externalPage ?? localPage;
  const pageSize = externalPageSize ?? PAGE_SIZE;

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  React.useEffect(() => {
    if (externalSearch === undefined) {
      return;
    }

    setLocalSearch((current) =>
      current === externalSearch ? current : externalSearch,
    );
  }, [externalSearch]);

  // Debounced search with 300ms delay and min 3 chars
  React.useEffect(() => {
    if (!onSearchChange) return;

    // Only trigger search if empty or at least 3 chars
    if (localSearch.length === 0 || localSearch.length >= 3) {
      const timer = setTimeout(() => {
        onSearchChange(localSearch);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [localSearch, onSearchChange]);

  const setSearch = (next: string) => {
    setLocalSearch(next);
    setLocalPage(1);
  };

  const setPage = (next: number | ((current: number) => number)) => {
    const resolved = typeof next === "function" ? next(page) : next;
    if (onPageChange) {
      onPageChange(resolved);
    } else {
      setLocalPage(resolved);
    }
  };
  const [editingEntryId, setEditingEntryId] = React.useState<string | null>(
    null,
  );
  const [isCreatingEntry, setIsCreatingEntry] = React.useState(false);
  const [localOrder, setLocalOrder] = React.useState<string[] | null>(null);
  const [isReorderMounted, setIsReorderMounted] = React.useState(false);

  React.useEffect(() => {
    setIsReorderMounted(true);
  }, []);

  const rawEntries = Array.isArray(value) ? (value as AdminContentEntry[]) : [];
  const entries = React.useMemo(() => {
    if (!localOrder) return rawEntries;
    const map = new Map(rawEntries.map((e) => [e.id, e]));
    return localOrder
      .map((id) => map.get(id))
      .filter(Boolean) as AdminContentEntry[];
  }, [rawEntries, localOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const isReorderEnabled = canReorder && Boolean(onReorder) && isReorderMounted;

  const requestReorder = React.useCallback(
    (entryId: string, newIndex: number) => {
      if (!onReorder || newIndex < 0 || newIndex >= entries.length) return;

      const currentIndex = entries.findIndex((entry) => entry.id === entryId);
      if (currentIndex === -1 || currentIndex === newIndex) return;

      const reordered = arrayMove(entries, currentIndex, newIndex);
      setLocalOrder(reordered.map((entry) => entry.id));
      void onReorder(entryId, newIndex);
    },
    [entries, onReorder],
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const oldIndex = entries.findIndex((e) => e.id === activeId);
      const newIndex = entries.findIndex((e) => e.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      requestReorder(activeId, newIndex);
    },
    [entries, requestReorder],
  );
  const editorProperties = React.useMemo(() => {
    const edDesc = isRecord(resource.editorDescriptor)
      ? (resource.editorDescriptor as SchemaDescriptor)
      : undefined;
    // The server provides editorDescriptor as the item descriptor directly.
    // For object items, properties are on edDesc.properties.
    if (isRecord(edDesc?.properties)) {
      return edDesc!.properties as Record<string, unknown>;
    }
    return undefined;
  }, [resource.editorDescriptor]);
  const descriptorByColumnName = React.useMemo(() => {
    const map = new Map<string, SchemaDescriptor>();

    if (editorProperties && isRecord(editorProperties)) {
      for (const [name, descriptor] of Object.entries(editorProperties)) {
        if (isRecord(descriptor)) {
          map.set(name, descriptor as SchemaDescriptor);
        }
      }
    }

    for (const field of resource.fields) {
      if (isRecord(field.descriptor)) {
        map.set(field.name, field.descriptor as SchemaDescriptor);
      }
    }

    return map;
  }, [editorProperties, resource.fields]);

  const orderingPolicy = React.useMemo(
    () => resolveUiOrderingPolicy(resource.editorDescriptor),
    [resource.editorDescriptor],
  );

  const isModelRefArray = React.useMemo(() => {
    const edDesc = isRecord(resource.editorDescriptor)
      ? (resource.editorDescriptor as SchemaDescriptor)
      : undefined;
    return edDesc?.kind === "modelRef";
  }, [resource.editorDescriptor]);

  const resourceModelName = React.useMemo(() => {
    if (resource.segments[0] !== "models") {
      return undefined;
    }
    return resource.segments[1];
  }, [resource.segments]);

  const resourceObjectDescriptor = React.useMemo(
    () => normalizeObjectDescriptor(resource.editorDescriptor),
    [resource.editorDescriptor],
  );

  const collectionAssetKind = React.useMemo(() => {
    if (isModelRefArray) {
      return null;
    }

    return resolveAssetKindFromModelDescriptor(
      resourceModelName,
      resourceObjectDescriptor,
    );
  }, [isModelRefArray, resourceModelName, resourceObjectDescriptor]);

  const modelName = React.useMemo(() => {
    if (!isModelRefArray) {
      return "";
    }

    const edDesc = resource.editorDescriptor as SchemaDescriptor;
    return typeof edDesc.model === "string" ? edDesc.model : "";
  }, [isModelRefArray, resource.editorDescriptor]);

  const modelDescriptor = React.useMemo(() => {
    if (!isModelRefArray || modelName.length === 0) {
      return undefined;
    }

    return (
      normalizeObjectDescriptor(
        resolveModelDescriptorFromSnapshot(ctx.snapshot, modelName),
      ) ?? undefined
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
      (normalizeObjectDescriptor(
        resolveModelDescriptorFromSnapshot(snapshotQuery.data?.snapshot, modelName),
      ) ?? undefined),
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

  const modelOptionsQuery = useAdminModelReferenceOptionsQuery({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    modelName,
    query: modelReferenceExpandQuery,
    enabled:
      isModelRefArray &&
      modelName.length > 0 &&
      (isCreatingEntry || editingEntryId !== null),
  });

  const modelEntriesById = React.useMemo(() => {
    const entries = Array.isArray(modelOptionsQuery.data?.value)
      ? (modelOptionsQuery.data.value as AdminContentEntry[])
      : [];
    return new Map(entries.map((entry) => [String(entry.id), entry]));
  }, [modelOptionsQuery.data?.value]);

  const modelPropertyDescriptors = React.useMemo(() => {
    if (!effectiveModelDescriptor || !isRecord(effectiveModelDescriptor.properties)) {
      return {} as Record<string, SchemaDescriptor>;
    }

    return effectiveModelDescriptor.properties as Record<string, SchemaDescriptor>;
  }, [effectiveModelDescriptor]);

  const columnPlan = React.useMemo(() => {
    const edDesc = isRecord(resource.editorDescriptor)
      ? (resource.editorDescriptor as SchemaDescriptor)
      : undefined;

    // The server provides editorDescriptor as the *item* descriptor (not the
    // array wrapper).  For model collections this is { type: "object",
    // properties: {...} }, for modelRef arrays it's { kind: "modelRef", ... },
    // and for primitive arrays it's { type: "string" } etc.
    const itemKind =
      edDesc?.kind === "modelRef"
        ? "modelRef"
        : edDesc?.type === "object" || isRecord(edDesc?.properties)
          ? "object"
          : "primitive";

    const itemsDescriptor = edDesc ?? { type: "string" };

    const plan = compileCollectionColumnPlan({
      itemKind,
      itemDescriptor: itemsDescriptor,
      modelDescriptor: effectiveModelDescriptor,
      orderingPolicy,
    });

    return plan.filter((col) => !shouldHideColumn(col.key));
  }, [resource.editorDescriptor, orderingPolicy, effectiveModelDescriptor]);

  const columnNames = React.useMemo(
    () =>
      columnPlan.length > 0 ? columnPlan.map((col) => col.key) : ["value"],
    [columnPlan],
  );

  // Server-only pagination - no client-side filtering or slicing
  const pageCount = pagination?.pageCount ?? 1;
  const pageEntries = entries;
  const editingEntry =
    entries.find((entry) => entry.id === editingEntryId) ?? null;
  const editingEntryValue = React.useMemo(() => {
    if (!editingEntry) {
      return null;
    }

    if (isModelRefArray && modelName.length > 0) {
      const resolution = resolveModelRefFromItem(editingEntry, modelName);
      if (resolution.id != null) {
        const linkedEntry = modelEntriesById.get(String(resolution.id));
        const linkedDescriptor = effectiveModelDescriptor;
        if (linkedEntry && linkedDescriptor) {
          return (
            materializeDescriptorRecord(linkedEntry, linkedDescriptor) ??
            linkedEntry
          );
        }
        if (linkedEntry) {
          return linkedEntry;
        }
      }
    }

    return unwrapDescriptorFormValue(editingEntry, resource.editorDescriptor);
  }, [
    editingEntry,
    effectiveModelDescriptor,
    isModelRefArray,
    modelEntriesById,
    modelName,
    resource.editorDescriptor,
  ]);
  const editingAssetEntryValue = React.useMemo(() => {
    if (!editingEntry && !editingEntryValue) {
      return null;
    }

    return {
      ...(isRecord(editingEntry) ? editingEntry : {}),
      ...(isRecord(editingEntryValue) ? editingEntryValue : {}),
    };
  }, [editingEntry, editingEntryValue]);
  const collectionTitle =
    resource.displayName ||
    resource.segments[resource.segments.length - 1] ||
    "Entries";

  React.useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const [sorting, setSorting] = React.useState<SortingState>([]);

  const columnHelper = React.useMemo(
    () => createColumnHelper<AdminContentEntry>(),
    [],
  );

  const columns = React.useMemo(() => {
    const dataColumns = columnNames.map((name) =>
      columnHelper.accessor(
        (row) => {
          const descriptor =
            descriptorByColumnName.get(name) ?? modelPropertyDescriptors[name];
          const normalizedRow = normalizeDescriptorTableRow({
            itemDescriptor: resource.editorDescriptor,
            modelDescriptor: effectiveModelDescriptor,
            modelEntriesById,
            modelName,
            row,
          });
          let resolvedValue = resolveCollectionCellValue(
            normalizedRow.row,
            name,
            descriptor,
          );
          if (
            (resolvedValue == null || resolvedValue === "") &&
            isModelRefArray &&
            name === columnNames[0] &&
            normalizedRow.modelRefId
          ) {
            resolvedValue = normalizedRow.modelRefId;
          }
          const asset = resolveCellAsset(
            name,
            normalizedRow.row,
            resolvedValue,
            descriptor,
            effectiveSchemaSnapshot,
          );
          return { resolvedValue, asset, descriptor };
        },
        {
          id: name,
          header: () => toTitle(name),
          cell: ({ getValue }) => {
            const { resolvedValue, asset, descriptor } = getValue();
            return (
              <DescriptorColumnRepresentation
                asset={asset}
                descriptor={descriptor}
                value={resolvedValue}
              />
            );
          },
          enableSorting: true,
        },
      ),
    );

    const actionsColumn = columnHelper.display({
      id: "actions",
      header: () => <span className="w-32">Actions</span>,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            data-testid="collection-edit"
            variant="ghost"
            size="icon-sm"
            disabled={!canUpdate || isActionDisabled}
            onClick={() => {
              setIsCreatingEntry(false);
              setEditingEntryId(row.original.id);
            }}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            type="button"
            data-testid="collection-delete"
            variant="ghost"
            size="icon-sm"
            disabled={!canDelete || isActionDisabled}
            onClick={() => {
              if (!canDelete || isActionDisabled) return;
              void onDelete(row.original.id);
            }}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      ),
    });

    if (isReorderEnabled) {
      const dragColumn = columnHelper.display({
        id: "drag",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <DragHandle entryId={row.original.id} />
            <Button
              type="button"
              aria-label="Move row up"
              data-testid="collection-move-up"
              variant="ghost"
              size="icon-sm"
              disabled={isActionDisabled || row.index === 0}
              onClick={() => requestReorder(row.original.id, row.index - 1)}
            >
              <ChevronUp className="size-4" />
            </Button>
            <Button
              type="button"
              aria-label="Move row down"
              data-testid="collection-move-down"
              variant="ghost"
              size="icon-sm"
              disabled={isActionDisabled || row.index >= pageEntries.length - 1}
              onClick={() => requestReorder(row.original.id, row.index + 1)}
            >
              <ChevronDown className="size-4" />
            </Button>
          </div>
        ),
        size: 120,
        enableSorting: false,
      });
      return [dragColumn, ...dataColumns, actionsColumn];
    }

    return [...dataColumns, actionsColumn];
  }, [
    columnNames,
    descriptorByColumnName,
    effectiveModelDescriptor,
    isModelRefArray,
    modelEntriesById,
    modelName,
    modelPropertyDescriptors,
    effectiveSchemaSnapshot,
    isReorderEnabled,
    canUpdate,
    canDelete,
    isActionDisabled,
    onDelete,
    pageEntries.length,
    requestReorder,
    columnHelper,
    resource.editorDescriptor,
  ]);

  const table = useReactTable({
    data: pageEntries,
    columns,
    state: { sorting },
    onSortingChange: (updater) => {
      const next =
        typeof updater === "function" ? updater(sorting) : updater;
      setSorting(next);
      if (onSortChange && isServerPaginated && next.length > 0) {
        onSortChange(next[0]!.id, next[0]!.desc ? "desc" : "asc");
      }
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: isServerPaginated ? undefined : getSortedRowModel(),
    manualSorting: isServerPaginated,
    manualPagination: true,
    pageCount,
  });

  const tableNode = (
    <Table className="min-w-max" data-testid="collection-table">
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <TableHead
                key={header.id}
                className={
                  header.column.id === "drag"
                    ? "w-28"
                    : header.column.id === "actions"
                      ? "w-32"
                      : header.column.getCanSort()
                        ? "cursor-pointer select-none"
                        : undefined
                }
                onClick={
                  header.column.getCanSort()
                    ? header.column.getToggleSortingHandler()
                    : undefined
                }
              >
                {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                {header.column.getIsSorted() === "asc"
                  ? " ↑"
                  : header.column.getIsSorted() === "desc"
                    ? " ↓"
                    : null}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => {
          const cells = row.getVisibleCells().map((cell) => (
            <TableCell key={cell.id} className="text-muted-foreground">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          ));

          if (isReorderEnabled) {
            return (
              <SortableRow key={row.id} entryId={row.original.id}>
                {cells}
              </SortableRow>
            );
          }

          return <TableRow key={row.id}>{cells}</TableRow>;
        })}
        {table.getRowModel().rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="text-center text-muted-foreground"
            >
              No data
            </TableCell>
          </TableRow>
        ) : null}
      </TableBody>
    </Table>
  );

  return (
    <div
      className="min-w-0 space-y-3"
      data-creating-entry={isCreatingEntry ? "true" : "false"}
      data-editing-entry={editingEntry ? "true" : "false"}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-semibold" data-testid="collection-title">
          {collectionTitle}
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <Input
            className="w-48"
            data-testid="collection-search"
            placeholder="Search..."
            value={localSearch}
            onChange={(event) => setSearch(event.target.value)}
          />
          {settingsHref ? (
            <Button asChild type="button" variant="outline">
              <a href={settingsHref}>{settingsLabel}</a>
            </Button>
          ) : null}
          <Button
            type="button"
            data-testid="collection-add"
            disabled={!canCreate || isActionDisabled}
            onClick={() => {
              setEditingEntryId(null);
              setIsCreatingEntry(true);
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <div className="min-w-0 rounded-lg border">
        {isReorderEnabled ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={pageEntries.map((e) => e.id)}
              strategy={verticalListSortingStrategy}
            >
              {tableNode}
            </SortableContext>
          </DndContext>
        ) : (
          tableNode
        )}
        <div className="flex items-center justify-between border-t p-3">
          <span className="text-muted-foreground text-sm">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              data-testid="pagination-prev"
              variant="outline"
              size="sm"
              disabled={isActionDisabled || page <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              data-testid="pagination-next"
              variant="outline"
              size="sm"
              disabled={isActionDisabled || page >= pageCount}
              onClick={() =>
                setPage((current) => Math.min(pageCount, current + 1))
              }
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {isCreatingEntry ? (
        <Sheet open onOpenChange={setIsCreatingEntry}>
          <SheetContent
            side="right"
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>Add {collectionTitle}</SheetTitle>
              <SheetDescription className="sr-only">
                Create a content entry for this collection.
              </SheetDescription>
            </SheetHeader>
            <div className="p-4">
              {isModelRefArray ? (
                <ModelReferenceSheetEditor
                  disabled={!canCreate || pendingCreate || isBusy}
                  linkActionLabel={pendingCreate ? "Creating..." : "Create"}
                  mode="create"
                  modelName={modelName}
                  value={null}
                  onCommit={async (nextValue) => {
                    await onCreate(nextValue);
                    setIsCreatingEntry(false);
                  }}
                />
              ) : collectionAssetKind ? (
                <AssetModelForm
                  disabled={!canCreate || isBusy}
                  initialValue={
                    createDescriptorDefault(resource.editorDescriptor, localeConfig) as
                      | Record<string, unknown>
                      | null
                  }
                  kind={collectionAssetKind}
                  submitLabel={pendingCreate ? "Creating..." : "Create"}
                  onSubmit={async (nextValue) => {
                    await onCreate(nextValue);
                    setIsCreatingEntry(false);
                  }}
                />
              ) : (
                <DescriptorValueForm
                  descriptor={resource.editorDescriptor}
                  initialValue={createDescriptorDefault(resource.editorDescriptor, localeConfig)}
                  submitDisabled={!canCreate || isBusy}
                  submitDisabledMessage={
                    canCreate
                      ? undefined
                      : "Your current role cannot create content entries."
                  }
                  submitLabel={pendingCreate ? "Creating..." : "Create"}
                  onSubmit={async (nextValue) => {
                    await onCreate(nextValue);
                    setIsCreatingEntry(false);
                  }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {editingEntry ? (
        <Sheet open onOpenChange={(open) => !open && setEditingEntryId(null)}>
          <SheetContent
            side="right"
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <SheetHeader>
              <SheetTitle>Edit {collectionTitle}</SheetTitle>
              <SheetDescription className="sr-only">
                Update the selected content entry.
              </SheetDescription>
            </SheetHeader>
            <div className="p-4">
              {isModelRefArray ? (
                <ModelReferenceSheetEditor
                  disabled={!canUpdate || pendingUpdate || isBusy}
                  linkActionLabel={pendingUpdate ? "Saving..." : "Save Changes"}
                  mode="edit"
                  modelName={modelName}
                  value={editingEntry}
                  onCommit={async (nextValue) => {
                    if (nextValue != null && editingEntry) {
                      await onUpdate(editingEntry.id, nextValue);
                    }
                    setEditingEntryId(null);
                  }}
                />
              ) : collectionAssetKind ? (
                <AssetModelForm
                  disabled={!canUpdate || pendingUpdate || isBusy}
                  initialValue={editingAssetEntryValue}
                  kind={collectionAssetKind}
                  submitLabel={pendingUpdate ? "Saving..." : "Save Changes"}
                  onSubmit={async (nextValue) => {
                    await onUpdate(editingEntry.id, nextValue);
                    setEditingEntryId(null);
                  }}
                />
              ) : (
                <DescriptorValueForm
                  descriptor={resource.editorDescriptor}
                  initialValue={editingEntryValue}
                  submitDisabled={!canUpdate || isBusy}
                  submitDisabledMessage={
                    canUpdate
                      ? undefined
                      : "Your current role cannot update content entries."
                  }
                  submitLabel={pendingUpdate ? "Saving..." : "Save Changes"}
                  onSubmit={async (nextValue) => {
                    await onUpdate(editingEntry.id, nextValue);
                    setEditingEntryId(null);
                  }}
                />
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
