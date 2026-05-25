"use client";

import * as React from "react";

import {
  buildAdminGraphQueryKey,
  createAdminClient,
  useAdminGraphQuery,
  type QueryOptions,
} from "@cms0/admin-client";
import type { SchemaDescriptorSnapshot } from "@cms0/admin-contract";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { applySetOpToDocument, type GraphMutationOp } from "./helpers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CollectionGraphOp =
  | { op: "insert"; path: string; value: unknown }
  | { op: "delete"; path: string }
  | { op: "deleteById"; path: string; id: string }
  | { op: "updateById"; path: string; id: string; value: unknown };

type GraphMutateOptions = {
  /**
   * Top-level field name in the document that a collection op affects.
   * After the mutation resolves the context refetches only that field slice
   * and splices it into the cached document — no full document refetch.
   */
  affectedField?: string;
  successMessage?: string;
};

export type GraphDocumentContextValue = {
  // ── Document state ────────────────────────────────────────────────────
  document: unknown;
  isLoading: boolean;
  /** True while the main query or a targeted field fetch is in-flight. */
  isFetching: boolean;
  /** True while a graph mutation op is in-flight. */
  isMutating: boolean;

  // ── Cache patching ────────────────────────────────────────────────────
  /** Directly patch the cached document. Prefer `mutate` for normal ops. */
  patchDocument: (patchFn: (prev: unknown) => unknown) => void;

  // ── Mutation ──────────────────────────────────────────────────────────
  /**
   * Fire one or more graph ops and update the cached document.
   *
   * - For `set` ops: patches each path in the document immediately via
   *   `applySetOpToDocument` — no refetch.
   * - For collection ops (`insert`, `deleteById`, `updateById`, `delete`):
   *   provides `options.affectedField` to trigger a targeted field refetch
   *   that splices only that field into the existing cached document.
   */
  mutate: (
    ops: GraphMutationOp[],
    options?: GraphMutateOptions,
  ) => Promise<void>;

  // ── Field-level query options (pagination / search / sort) ────────────
  fieldOptions: Record<string, Partial<QueryOptions>>;
  /**
   * Update pagination/search/sort options for a specific field path and
   * immediately fetch just that field, splicing the result into the document.
   */
  updateFieldOptions: (
    fieldPath: string[],
    patch: Partial<QueryOptions>,
  ) => Promise<void>;
  getFieldOptions: (fieldPath: string[]) => Partial<QueryOptions>;

  // ── Static config (eliminates prop drilling) ──────────────────────────
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  resourceRouteBase?: string;
  snapshot: SchemaDescriptorSnapshot | null;
  graphPath: string;
  /**
   * True only for singleton document contexts where nested-object accordion
   * submits should fire individual graph `set` ops. False for the
   * static-config-only provider that wraps collection pages (enabled=false).
   */
  canSubmitNestedDocument: boolean;
};

export const GraphDocumentContext =
  React.createContext<GraphDocumentContextValue | null>(null);

export function useGraphDocument(): GraphDocumentContextValue {
  const ctx = React.useContext(GraphDocumentContext);
  if (!ctx) {
    throw new Error("useGraphDocument must be used inside GraphDocumentProvider");
  }
  return ctx;
}

/** Returns null when not inside a GraphDocumentProvider. */
export function useGraphDocumentOptional(): GraphDocumentContextValue | null {
  return React.useContext(GraphDocumentContext);
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type GraphDocumentProviderProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  resourceRouteBase?: string;
  snapshot: SchemaDescriptorSnapshot | null;
  graphPath: string;
  initialData?: unknown;
  /** Global page size applied to all array fields without a per-field override. */
  pageSize?: number;
  enabled?: boolean;
  staleTime?: number;
  children: React.ReactNode;
};

export function GraphDocumentProvider({
  adminBaseUrl,
  adminRoutePrefix,
  resourceRouteBase,
  snapshot,
  graphPath,
  initialData,
  pageSize = 20,
  enabled = true,
  staleTime,
  children,
}: Readonly<GraphDocumentProviderProps>) {
  const queryClient = useQueryClient();

  // ── Stable query key — no per-path overrides ───────────────────────────
  const stableQueryKey = React.useMemo(
    () =>
      buildAdminGraphQueryKey(adminBaseUrl, graphPath, {
        pageSize,
        resolveModelRefs: true,
      }),
    [adminBaseUrl, graphPath, pageSize],
  );

  const graphQuery = useAdminGraphQuery({
    adminBaseUrl,
    adminRoutePrefix,
    path: graphPath,
    pageSize,
    resolveModelRefs: true,
    enabled,
    initialData,
    staleTime,
  });

  // ── Targeted field fetch tracking ──────────────────────────────────────
  const [fetchingFields, setFetchingFields] = React.useState<Set<string>>(
    () => new Set(),
  );
  const addFetchingField = React.useCallback((key: string) => {
    setFetchingFields((prev) => new Set([...prev, key]));
  }, []);
  const removeFetchingField = React.useCallback((key: string) => {
    setFetchingFields((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // ── Per-field query options ────────────────────────────────────────────
  const [fieldOptions, setFieldOptions] = React.useState<
    Record<string, Partial<QueryOptions>>
  >({});

  // Always-current ref so updateFieldOptions / mutate / getFieldOptions don't
  // need to capture fieldOptions in their closure — callers get a stable
  // function reference that never changes, preventing effect dep loops.
  const fieldOptionsRef = React.useRef(fieldOptions);
  fieldOptionsRef.current = fieldOptions;

  const getFieldOptions = React.useCallback(
    (fieldPath: string[]): Partial<QueryOptions> => {
      return fieldOptionsRef.current[fieldPath.join(".")] ?? {};
    },
    [],
  );

  // ── Admin client for direct calls (targeted fetches + mutations) ───────
  const adminClient = React.useMemo(
    () => createAdminClient({ baseUrl: adminBaseUrl, routePrefix: adminRoutePrefix }),
    [adminBaseUrl, adminRoutePrefix],
  );

  // ── Cache patch ────────────────────────────────────────────────────────
  const patchDocument = React.useCallback(
    (patchFn: (prev: unknown) => unknown) => {
      queryClient.setQueryData(stableQueryKey, patchFn);
    },
    [queryClient, stableQueryKey],
  );

  // ── Targeted field fetch — fetches ONE top-level field and splices it ──
  const fetchAndSpliceField = React.useCallback(
    async (
      topLevelField: string,
      opts: Partial<QueryOptions>,
      fieldPathKey = topLevelField,
    ) => {
      const fetchKey = topLevelField;
      addFetchingField(fetchKey);
      try {
        const result = await adminClient.graph.get(graphPath, {
          fields: topLevelField,
          pageSize,
          paths: { [fieldPathKey]: opts },
          resolveModelRefs: true,
        });
        patchDocument((prev) => {
          if (
            typeof prev !== "object" ||
            prev === null ||
            Array.isArray(prev)
          ) {
            return prev;
          }
          return {
            ...(prev as Record<string, unknown>),
            [topLevelField]: (result as Record<string, unknown>)[topLevelField],
          };
        });
      } finally {
        removeFetchingField(fetchKey);
      }
    },
    [adminClient, graphPath, pageSize, addFetchingField, removeFetchingField, patchDocument],
  );

  // ── updateFieldOptions ─────────────────────────────────────────────────
  const updateFieldOptions = React.useCallback(
    async (fieldPath: string[], patch: Partial<QueryOptions>) => {
      const key = fieldPath.join(".");
      const topLevelField = fieldPath[0];
      if (!topLevelField) return;

      // Read current opts from ref so this callback stays stable (no fieldOptions dep).
      const current = fieldOptionsRef.current[key] ?? {};
      const merged = { ...current, ...patch };
      const unchanged =
        current.page === merged.page &&
        current.pageSize === merged.pageSize &&
        current.search === merged.search &&
        current.orderBy === merged.orderBy &&
        current.orderDir === merged.orderDir &&
        current.fields === merged.fields &&
        current.exclude === merged.exclude;
      if (unchanged) return;

      setFieldOptions((prev) => ({ ...prev, [key]: merged }));

      // For nested paths like ["hero", "sections"], the paths key is
      // "hero.sections" but the top-level fetch field is "hero". We use the
      // nested key so the server resolves correctly.
      await fetchAndSpliceField(topLevelField, merged, key);
    },
    [fetchAndSpliceField],
  );

  // ── Mutation ───────────────────────────────────────────────────────────
  const [isMutating, setIsMutating] = React.useState(false);

  const graphMutation = useMutation({
    mutationFn: (ops: GraphMutationOp[]) =>
      adminClient.graph.mutate(graphPath, { ops }),
  });

  const mutate = React.useCallback(
    async (ops: GraphMutationOp[], options: GraphMutateOptions = {}) => {
      const { affectedField, successMessage = "Saved" } = options;
      setIsMutating(true);
      try {
        await graphMutation.mutateAsync(ops);

        // For set ops: patch each path directly — no refetch needed.
        const setOps = ops.filter(
          (op): op is Extract<GraphMutationOp, { op: "set" }> =>
            op.op === "set",
        );
        if (setOps.length > 0) {
          patchDocument((prev) => {
            let doc = prev;
            for (const op of setOps) {
              doc = applySetOpToDocument(doc, op.path, op.value);
            }
            return doc;
          });
        }

        // For collection ops: do a targeted field refetch to pick up new IDs
        // and updated pagination totals.
        if (affectedField) {
          const entries = Object.entries(fieldOptionsRef.current).filter(
            ([key]) => key === affectedField || key.startsWith(`${affectedField}.`),
          );
          if (entries.length === 0) {
            await fetchAndSpliceField(affectedField, {});
          } else {
            for (const [fieldPathKey, currentOpts] of entries) {
              await fetchAndSpliceField(affectedField, currentOpts, fieldPathKey);
            }
          }
        }

        toast.success(successMessage);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Unable to save.");
        throw error;
      } finally {
        setIsMutating(false);
      }
    },
    [graphMutation, patchDocument, fetchAndSpliceField],
  );

  // ── Context value ──────────────────────────────────────────────────────
  const value = React.useMemo<GraphDocumentContextValue>(
    () => ({
      document: graphQuery.data,
      isLoading: graphQuery.isLoading,
      isFetching: graphQuery.isFetching || fetchingFields.size > 0,
      isMutating,
      patchDocument,
      mutate,
      fieldOptions,
      updateFieldOptions,
      getFieldOptions,
      adminBaseUrl,
      adminRoutePrefix,
      resourceRouteBase,
      snapshot,
      graphPath,
      canSubmitNestedDocument: enabled,
    }),
    [
      graphQuery.data,
      graphQuery.isLoading,
      graphQuery.isFetching,
      fetchingFields.size,
      isMutating,
      patchDocument,
      mutate,
      fieldOptions,
      // updateFieldOptions and getFieldOptions are stable (use fieldOptionsRef)
      // — omitted from deps to avoid context churn on every fieldOptions update.
      adminBaseUrl,
      adminRoutePrefix,
      resourceRouteBase,
      snapshot,
      graphPath,
      enabled,
    ],
  );

  return (
    <GraphDocumentContext.Provider value={value}>
      {children}
    </GraphDocumentContext.Provider>
  );
}
