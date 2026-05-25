"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  useAdminCreateContentMutation,
  useAdminGraphMutate,
  useAdminGraphQuery,
  useAdminUpdateContentMutation,
} from "@cms0/admin-client";
import { valueToOps } from "./schema-descriptor-representation/helpers";
import {
  GraphDocumentProvider,
  useGraphDocument,
} from "./schema-descriptor-representation/graph-document-context";
import type {
  AdminContentResponse,
  SchemaDescriptorSnapshot,
} from "@cms0/admin-contract";

import { ManualTriggerFab } from "./manual-trigger-fab";
import { Button } from "./button";
import { Card, CardDescription, CardHeader, CardTitle } from "./card";
import { CollectionEditor } from "./schema-descriptor-representation/collection-editor";
import { SingletonEditor } from "./schema-descriptor-representation/singleton-editor";

export type ContentResourceAccess = {
  canCreate: boolean;
  canDelete: boolean;
  canRead: boolean;
  canReorder?: boolean;
  canUpdate: boolean;
};

export type ContentResourcePanelProps = {
  actions?: React.ReactNode;
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  contentAccess?: Partial<ContentResourceAccess>;
  graphPath?: string;
  inline?: boolean;
  initialResponse: AdminContentResponse;
  schemaSnapshot?: SchemaDescriptorSnapshot | null;
  resourceRouteBase?: string;
  manualTriggerAdminBaseUrl?: string;
  manualTriggerResourceName?: string;
  manualTriggerResourceType?: "model" | "root";
  settingsHref?: string;
  settingsLabel?: string;
};

// ── Singleton section ─────────────────────────────────────────────────────────
// Rendered inside GraphDocumentProvider so it can consume the graph document
// context for mutations and pagination without prop drilling.

type SingletonSectionProps = {
  actions?: React.ReactNode;
  canUpdate: boolean;
  contentResponse: AdminContentResponse;
  initialValue: unknown;
  manualTriggerProps: {
    adminBaseUrl: string;
    adminRoutePrefix?: string;
    resourceName: string;
    resourceType: "model" | "root";
  } | null;
  settingsHref?: string;
  settingsLabel: string;
};

function SingletonSection({
  actions,
  canUpdate,
  contentResponse,
  initialValue,
  manualTriggerProps,
  settingsHref,
  settingsLabel,
}: Readonly<SingletonSectionProps>) {
  const ctx = useGraphDocument();
  const currentValue = ctx.document ?? initialValue;
  const editorResponse = React.useMemo(
    () =>
      ({
        ...contentResponse,
        value: currentValue,
      }) as AdminContentResponse,
    [contentResponse, currentValue],
  );

  // Track the snapshot of the document at the last submit for accurate diff.
  // Uses a ref so changes don't trigger re-renders.
  const lastSubmittedRef = React.useRef(currentValue);

  React.useEffect(() => {
    if (!ctx.isMutating) {
      lastSubmittedRef.current = currentValue;
    }
  }, [currentValue, ctx.isMutating]);

  return (
    <div className="min-w-0 space-y-3 px-6 py-6">
      {actions ? <div className="flex justify-end">{actions}</div> : null}
      <SingletonEditor
        canUpdate={canUpdate}
        initialResponse={editorResponse}
        pending={ctx.isMutating || ctx.isLoading}
        onSubmit={async (nextValue) => {
          const ops = valueToOps(lastSubmittedRef.current, nextValue);
          await ctx.mutate(ops, { successMessage: "Saved" });
          lastSubmittedRef.current = nextValue;
        }}
      />
      {settingsHref ? (
        <div className="flex justify-end">
          <Button asChild type="button" variant="outline">
            <a href={settingsHref}>{settingsLabel}</a>
          </Button>
        </div>
      ) : null}
      {manualTriggerProps ? (
        <ManualTriggerFab {...manualTriggerProps} />
      ) : null}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ContentResourcePanel({
  actions,
  adminBaseUrl,
  adminRoutePrefix,
  contentAccess,
  graphPath,
  inline = false,
  resourceRouteBase,
  initialResponse,
  schemaSnapshot,
  manualTriggerAdminBaseUrl,
  manualTriggerResourceName,
  manualTriggerResourceType,
  settingsHref,
  settingsLabel = "",
}: Readonly<ContentResourcePanelProps>) {
  const pageSize = inline ? 5 : 10;
  const access = React.useMemo<ContentResourceAccess>(
    () => ({
      canCreate: true,
      canDelete: true,
      canRead: true,
      canUpdate: true,
      ...contentAccess,
    }),
    [contentAccess],
  );
  const [page, setPage] = React.useState(1);
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [orderBy, setOrderBy] = React.useState<string | undefined>();
  const [orderDir, setOrderDir] = React.useState<"asc" | "desc">("asc");

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const resource = initialResponse.resource;
  const resourcePathSegments = React.useMemo(
    () => resource.apiPath.split("/").filter(Boolean),
    [resource.apiPath],
  );
  const isTopLevelModelCollection =
    resource.kind === "array" &&
    resourcePathSegments[0] === "models" &&
    resourcePathSegments.length === 2;
  const isNestedPath = resourcePathSegments.length > 1;
  const parentPath =
    (!isTopLevelModelCollection && isNestedPath
      ? resourcePathSegments.slice(0, -1).join("/")
      : resource.apiPath) ?? "";
  const nestedField =
    !isTopLevelModelCollection && isNestedPath
      ? (resourcePathSegments[resourcePathSegments.length - 1] ?? null)
      : null;

  const isNestedArray =
    !isTopLevelModelCollection && isNestedPath && resource.kind === "array";

  // For singletons, always use graph API (resolvedGraphPath is always defined
  // for non-array resources since we fall back to resource.apiPath).
  const resolvedGraphPath =
    graphPath ?? (resource.kind !== "array" ? resource.apiPath : undefined);

  const STALE_TIME = 30 * 1000;

  // ── Collection queries (for array resources only) ─────────────────────────

  const collectionGraphPath = isNestedArray ? parentPath : resource.apiPath;
  const collectionInitialData = React.useMemo(() => {
    if (resource.kind !== "array") return undefined;
    if (isNestedArray && nestedField) {
      return {
        [nestedField]: {
          data: Array.isArray(initialResponse.value)
            ? initialResponse.value
            : [],
          pagination: initialResponse.pagination,
        },
      };
    }
    return {
      data: Array.isArray(initialResponse.value) ? initialResponse.value : [],
      pagination: initialResponse.pagination,
    };
  }, [
    initialResponse.pagination,
    initialResponse.value,
    isNestedArray,
    nestedField,
    resource.kind,
  ]);
  const collectionGraphQuery = useAdminGraphQuery({
    adminBaseUrl,
    adminRoutePrefix,
    path: collectionGraphPath,
    fields: nestedField ?? undefined,
    page,
    pageSize,
    search,
    orderBy,
    orderDir,
    resolveModelRefs: true,
    enabled: resource.kind === "array",
    initialData:
      page === 1 && !search && !orderBy ? collectionInitialData : undefined,
    staleTime: STALE_TIME,
  });

  // ── Collection mutations ──────────────────────────────────────────────────

  const graphMutate = useAdminGraphMutate({
    adminBaseUrl,
    adminRoutePrefix,
    path: collectionGraphPath,
  });

  // Multipart asset upload still needs content transport. Normal JSON content
  // mutations use the graph endpoint below.
  const updateMutation = useAdminUpdateContentMutation({
    adminBaseUrl,
    adminRoutePrefix,
    apiPath: initialResponse.resource.apiPath,
  });

  const createMutation = useAdminCreateContentMutation({
    adminBaseUrl,
    adminRoutePrefix,
    apiPath: initialResponse.resource.apiPath,
  });

  const queryClient = useQueryClient();

  const invalidateCollectionData = React.useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["admin", "graph", adminBaseUrl, collectionGraphPath],
    });
  }, [queryClient, adminBaseUrl, collectionGraphPath]);

  // ── Collection data derivation ────────────────────────────────────────────

  const nestedGraphData =
    isNestedArray && nestedField
      ? (
          collectionGraphQuery.data as Record<
            string,
            | {
                data: unknown[];
                pagination?: AdminContentResponse["pagination"];
              }
            | undefined
          >
        )?.[nestedField]
      : undefined;

  const collectionGraphData =
    resource.kind === "array" &&
    !isNestedArray &&
    collectionGraphQuery.data &&
    typeof collectionGraphQuery.data === "object" &&
    !Array.isArray(collectionGraphQuery.data) &&
    Array.isArray((collectionGraphQuery.data as { data?: unknown }).data)
      ? (collectionGraphQuery.data as {
          data: unknown[];
          pagination?: AdminContentResponse["pagination"];
        })
      : null;

  const contentResponse = isNestedArray
    ? ({
        ...initialResponse,
        value: nestedGraphData?.data ?? initialResponse.value,
        pagination: nestedGraphData?.pagination ?? initialResponse.pagination,
      } as AdminContentResponse)
    : isTopLevelModelCollection
      ? ({
          ...initialResponse,
          value: collectionGraphData?.data ?? initialResponse.value,
          pagination:
            collectionGraphData?.pagination ?? initialResponse.pagination,
        } as AdminContentResponse)
      : resource.kind === "array"
        ? ({
            ...initialResponse,
            value: collectionGraphData?.data ?? initialResponse.value,
            pagination:
              collectionGraphData?.pagination ?? initialResponse.pagination,
          } as AdminContentResponse)
        : initialResponse;

  const manualTriggerProps =
    manualTriggerAdminBaseUrl &&
    manualTriggerResourceName &&
    manualTriggerResourceType
      ? {
          adminBaseUrl: manualTriggerAdminBaseUrl,
          adminRoutePrefix,
          resourceName: manualTriggerResourceName,
          resourceType: manualTriggerResourceType,
        }
      : null;

  if (!access.canRead) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Permission required</CardTitle>
          <CardDescription>
            Your current role cannot read generated model or root content.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Singleton branch ──────────────────────────────────────────────────────

  if (resource.kind !== "array") {
    return (
      <GraphDocumentProvider
        adminBaseUrl={adminBaseUrl}
        adminRoutePrefix={adminRoutePrefix}
        resourceRouteBase={resourceRouteBase}
        snapshot={schemaSnapshot ?? null}
        graphPath={resolvedGraphPath!}
        initialData={contentResponse.value}
        pageSize={pageSize}
        staleTime={STALE_TIME}
        enabled={Boolean(resolvedGraphPath)}
      >
        <SingletonSection
          actions={actions}
          canUpdate={access.canUpdate}
          contentResponse={contentResponse}
          initialValue={contentResponse.value}
          manualTriggerProps={manualTriggerProps}
          settingsHref={settingsHref}
          settingsLabel={settingsLabel}
        />
      </GraphDocumentProvider>
    );
  }

  // ── Collection branch ─────────────────────────────────────────────────────
  // GraphDocumentProvider here is for static-config context only (adminBaseUrl,
  // schemaSnapshot, etc. available to CollectionEditor and its internals without
  // prop drilling). Collection data comes from the query hooks above.

  return (
    <GraphDocumentProvider
      adminBaseUrl={adminBaseUrl}
      adminRoutePrefix={adminRoutePrefix}
      resourceRouteBase={resourceRouteBase}
      snapshot={schemaSnapshot ?? null}
      graphPath={collectionGraphPath}
      staleTime={STALE_TIME}
      enabled={false}
    >
      <div className="min-w-0 space-y-3 px-6 py-6">
        {actions ? <div className="flex justify-end">{actions}</div> : null}
        <CollectionEditor
          canCreate={access.canCreate}
          canDelete={access.canDelete}
          canReorder={access.canReorder}
          canUpdate={access.canUpdate}
          onCreate={async (nextValue) => {
            try {
              if (
                typeof FormData !== "undefined" &&
                nextValue instanceof FormData
              ) {
                await createMutation.mutateAsync(nextValue);
              } else if (isNestedArray && nestedField) {
                await graphMutate.mutateAsync({
                  ops: [
                    {
                      op: "insert",
                      path: `/${nestedField}`,
                      value: nextValue,
                    },
                  ],
                });
              } else {
                await graphMutate.mutateAsync({
                  ops: [{ op: "insert", path: "/-", value: nextValue }],
                });
              }
              invalidateCollectionData();
              toast.success("Created");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to create the content entry.",
              );
              throw error;
            }
          }}
          onDelete={async (entryId) => {
            try {
              if (isNestedArray && nestedField) {
                await graphMutate.mutateAsync({
                  ops: [
                    { op: "deleteById", path: `/${nestedField}`, id: entryId },
                  ],
                });
              } else {
                await graphMutate.mutateAsync({
                  ops: [{ op: "deleteById", path: "/", id: entryId }],
                });
              }
              invalidateCollectionData();
              toast.success("Deleted");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to delete the content entry.",
              );
              throw error;
            }
          }}
          onPageChange={setPage}
          onReorder={async (entryId, newIndex) => {
            try {
              const items =
                (contentResponse.value as Array<{ id?: string }>) ?? [];
              const currentIndex = items.findIndex(
                (item) => item.id === entryId,
              );
              if (currentIndex === -1) throw new Error("Item not found");
              const item = items[currentIndex];

              if (isNestedArray && nestedField) {
                await graphMutate.mutateAsync({
                  ops: [
                    {
                      op: "deleteById",
                      path: `/${nestedField}`,
                      id: entryId,
                    },
                    {
                      op: "insert",
                      path: `/${nestedField}/${newIndex}`,
                      value: item,
                    },
                  ],
                });
              } else {
                await graphMutate.mutateAsync({
                  ops: [
                    {
                      op: "deleteById",
                      path: "/",
                      id: entryId,
                    },
                    {
                      op: "insert",
                      path: `/${newIndex}`,
                      value: item,
                    },
                  ],
                });
              }
              invalidateCollectionData();
              toast.success("Reordered");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to reorder the content entry.",
              );
            }
          }}
          onSearchChange={setSearchInput}
          onSortChange={(col, dir) => {
            setOrderBy(col);
            setOrderDir(dir);
            setPage(1);
          }}
          onUpdate={async (entryId, nextValue) => {
            try {
              if (
                typeof FormData !== "undefined" &&
                nextValue instanceof FormData
              ) {
                await updateMutation.mutateAsync({
                  entryId,
                  value: nextValue,
                });
              } else if (isNestedArray && nestedField) {
                await graphMutate.mutateAsync({
                  ops: [
                    {
                      op: "updateById",
                      path: `/${nestedField}`,
                      id: entryId,
                      value: nextValue,
                    },
                  ],
                });
              } else {
                await graphMutate.mutateAsync({
                  ops: [
                    {
                      op: "updateById",
                      path: "/",
                      id: entryId,
                      value: nextValue,
                    },
                  ],
                });
              }
              invalidateCollectionData();
              toast.success("Updated");
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : "Unable to update the content entry.",
              );
              throw error;
            }
          }}
          page={page}
          pageSize={pageSize}
          pagination={contentResponse.pagination}
          pendingCreate={createMutation.isPending || graphMutate.isPending}
          pendingUpdate={updateMutation.isPending || graphMutate.isPending}
          resource={resource}
          search={search}
          settingsHref={settingsHref}
          settingsLabel={settingsLabel}
          value={contentResponse.value}
        />
        {manualTriggerProps ? (
          <ManualTriggerFab {...manualTriggerProps} />
        ) : null}
      </div>
    </GraphDocumentProvider>
  );
}
