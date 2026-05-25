"use client";

import * as React from "react";

import {
  buildAdminLatestSnapshotQueryKey,
  buildAdminModelReferenceQueryKey,
  useAdminCreateContentMutation,
  useAdminGraphMutate,
  useAdminLatestSnapshotQuery,
  useAdminModelReferenceOptionsQuery,
  useAdminUpdateContentMutation,
} from "@cms0/admin-client";
import type {
  AdminContentEntry,
  AdminContentResponse,
  SchemaDescriptor,
} from "@cms0/admin-contract";
import { useQueryClient } from "@tanstack/react-query";

import { Button } from "../button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../field";
import { Input } from "../input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
} from "../select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../tabs";
import {
  DescriptorSelectionOptionItem,
  formatDescriptorValue,
  resolvePreferredDisplayField,
} from "./descriptor-representation";
import { DescriptorValueForm } from "./descriptor-value-form";
import { useGraphDocument } from "./graph-document-context";
import { buildExpandParamsFromDescriptorProperties } from "./expand-params";
import {
  createDescriptorDefault,
  extractLocaleConfigFromSnapshot,
  isModelRefIdentity,
  isRecord,
  materializeDescriptorRecord,
  normalizeObjectDescriptor,
  resolveAssetKindFromModelDescriptor,
  resolveModelRefFromItem,
  resolveModelDescriptorFromSnapshot,
} from "./helpers";
import { AssetModelForm } from "./inputs/asset-model-form";

type ModelReferenceSheetEditorMode = "create" | "edit";

type ModelReferenceSheetEditorProps = {
  disabled?: boolean;
  linkActionLabel: string;
  mode?: ModelReferenceSheetEditorMode;
  modelName: string;
  onCommit: (value: string | null) => Promise<void> | void;
  value: unknown;
};

const resolveSelectedId = (value: unknown, modelName: string) => {
  const resolution = resolveModelRefFromItem(value, modelName);
  if (resolution.id != null) {
    return String(resolution.id);
  }
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  // value is the resolved model object itself (backend returned it directly)
  if (isRecord(value) && isModelRefIdentity(value.id)) {
    return String(value.id);
  }
  return "";
};

const extractCreatedModelId = (
  result: AdminContentResponse | unknown,
  knownIds: Set<string>,
) => {
  if (isRecord(result) && isRecord(result.mutation) && result.mutation.entryId) {
    return String(result.mutation.entryId);
  }

  const entries = Array.isArray(result)
    ? result
    : isRecord(result) && Array.isArray(result.value)
      ? result.value
      : isRecord(result) && Array.isArray(result.data)
        ? result.data
        : null;

  if (!entries) {
    return null;
  }

  const nextEntries = entries as AdminContentEntry[];
  const created =
    nextEntries
      .slice()
      .reverse()
      .find((entry) => !knownIds.has(String(entry.id))) ??
    nextEntries[nextEntries.length - 1];

  return created ? String(created.id) : null;
};

const toModelEditorDescriptor = (
  descriptor: SchemaDescriptor | null,
): SchemaDescriptor | null => {
  if (!descriptor) {
    return null;
  }

  if (!isRecord(descriptor.properties) && isRecord(descriptor.items)) {
    return toModelEditorDescriptor(descriptor.items as SchemaDescriptor);
  }

  if (!isRecord(descriptor.properties)) {
    return null;
  }

  return {
    type: "object",
    properties: descriptor.properties as Record<string, SchemaDescriptor>,
    required: Array.isArray(descriptor.required)
      ? descriptor.required
      : [],
    propertyOrder: Array.isArray(descriptor.propertyOrder)
      ? descriptor.propertyOrder
      : undefined,
    metadata: descriptor.metadata,
  } as SchemaDescriptor;
};

export function ModelReferenceSheetEditor({
  disabled = false,
  linkActionLabel,
  mode = "create",
  modelName,
  onCommit,
  value,
}: Readonly<ModelReferenceSheetEditorProps>) {
  const ctx = useGraphDocument();
  const effectiveAdminBaseUrl = ctx.adminBaseUrl;
  const effectiveAdminRoutePrefix = ctx.adminRoutePrefix;
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx.snapshot),
    [ctx.snapshot],
  );
  const queryClient = useQueryClient();
  const resolvedModelObject = React.useMemo(() => {
    const resolution = resolveModelRefFromItem(value, modelName);
    if (resolution.modelObject) return resolution.modelObject;
    // value is the resolved model object itself (backend returned it directly)
    if (isRecord(value) && isModelRefIdentity(value.id)) {
      return value as Record<string, unknown>;
    }
    return null;
  }, [value, modelName]);
  const hasResolvedObject = mode === "edit" && resolvedModelObject != null;
  const [selectedId, setSelectedId] = React.useState(() =>
    resolveSelectedId(value, modelName),
  );
  const [linkSearch, setLinkSearch] = React.useState("");
  const deferredLinkSearch = React.useDeferredValue(linkSearch);
  const [tab, setTab] = React.useState<"create" | "link">("link");

  React.useEffect(() => {
    setSelectedId(resolveSelectedId(value, modelName));
  }, [modelName, value]);

  const modelDescriptor = React.useMemo(
    () =>
      toModelEditorDescriptor(
        normalizeObjectDescriptor(
          resolveModelDescriptorFromSnapshot(ctx.snapshot, modelName),
        ),
      ),
    [modelName, ctx.snapshot],
  );
  const snapshotQuery = useAdminLatestSnapshotQuery({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    enabled: !modelDescriptor && modelName.trim().length > 0,
  });
  const effectiveModelDescriptor = React.useMemo(
    () =>
      modelDescriptor ??
      toModelEditorDescriptor(
        normalizeObjectDescriptor(
          resolveModelDescriptorFromSnapshot(snapshotQuery.data?.snapshot, modelName),
        ),
      ),
    [modelDescriptor, modelName, snapshotQuery.data?.snapshot],
  );
  const expandQuery = React.useMemo(
    () =>
      buildExpandParamsFromDescriptorProperties(
        isRecord(effectiveModelDescriptor?.properties)
          ? (effectiveModelDescriptor.properties as Record<string, SchemaDescriptor>)
          : undefined,
      ),
    [effectiveModelDescriptor],
  );
  const optionsQueryInput = React.useMemo(() => {
    const search = deferredLinkSearch.trim();
    return {
      ...expandQuery,
      search: search.length > 0 ? search : undefined,
    };
  }, [deferredLinkSearch, expandQuery]);

  const optionsQuery = useAdminModelReferenceOptionsQuery({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    modelName,
    enabled: modelName.trim().length > 0 && !hasResolvedObject,
    query: optionsQueryInput,
  });

  const createMutation = useAdminCreateContentMutation({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    apiPath: `models/${modelName}`,
  });

  const updateMutation = useAdminUpdateContentMutation({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    apiPath: `models/${modelName}`,
  });
  const graphMutation = useAdminGraphMutate({
    adminBaseUrl: effectiveAdminBaseUrl,
    adminRoutePrefix: effectiveAdminRoutePrefix,
    path: `models/${modelName}`,
  });

  const preferredModelField = React.useMemo(() => {
    if (
      !effectiveModelDescriptor ||
      !isRecord(effectiveModelDescriptor.properties)
    ) {
      return null;
    }

    const resolved = resolvePreferredDisplayField(
      effectiveModelDescriptor.properties as Record<string, SchemaDescriptor>,
    );
    if (!resolved) return null;
    return {
      descriptor: resolved[1],
      key: resolved[0],
    };
  }, [effectiveModelDescriptor]);
  const assetKind = React.useMemo(
    () =>
      resolveAssetKindFromModelDescriptor(modelName, effectiveModelDescriptor),
    [effectiveModelDescriptor, modelName],
  );

  const options = React.useMemo(
    () =>
      Array.isArray(optionsQuery.data?.value)
        ? (optionsQuery.data.value as AdminContentEntry[])
        : [],
    [optionsQuery.data?.value],
  );

  const selectedEntry = React.useMemo(() => {
    if (hasResolvedObject && resolvedModelObject) {
      return resolvedModelObject as AdminContentEntry;
    }
    if (!selectedId) return null;
    return options.find((entry) => String(entry.id) === selectedId) ?? null;
  }, [hasResolvedObject, resolvedModelObject, options, selectedId]);

  const selectedEntryValue = React.useMemo(() => {
    if (!selectedEntry) return null;
    return (
      (effectiveModelDescriptor
        ? materializeDescriptorRecord(selectedEntry, effectiveModelDescriptor)
        : undefined) ??
      selectedEntry
    );
  }, [effectiveModelDescriptor, selectedEntry]);

  const canCreate = Boolean(effectiveModelDescriptor);
  const canEdit = Boolean(
    effectiveModelDescriptor && selectedEntryValue && selectedId,
  );
  const isLoadingLinkOptions = optionsQuery.isLoading || optionsQuery.isFetching;
  const hasLinkSearch = linkSearch.trim().length > 0;
  const canLink = options.length > 0 || hasLinkSearch || isLoadingLinkOptions;

  React.useEffect(() => {
    if (mode !== "create") {
      return;
    }

    setTab(canLink ? "link" : canCreate ? "create" : "link");
  }, [canCreate, canLink, mode]);

  const invalidateModelQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: buildAdminModelReferenceQueryKey(
        effectiveAdminBaseUrl,
        modelName,
        optionsQueryInput,
      ),
    });
    await queryClient.invalidateQueries({
      queryKey: ["admin", "graph", effectiveAdminBaseUrl, `models/${modelName}`],
    });
    await queryClient.invalidateQueries({
      queryKey: buildAdminLatestSnapshotQueryKey(effectiveAdminBaseUrl),
    });
  };

  const isMutationPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    graphMutation.isPending;

  const createModelEntry = async (nextValue: FormData | unknown) => {
    if (typeof FormData !== "undefined" && nextValue instanceof FormData) {
      return createMutation.mutateAsync(nextValue);
    }
    return graphMutation.mutateAsync({
      ops: [{ op: "insert", path: "/-", value: nextValue }],
    });
  };

  const updateModelEntry = async (
    entryId: string,
    nextValue: FormData | unknown,
  ) => {
    if (typeof FormData !== "undefined" && nextValue instanceof FormData) {
      return updateMutation.mutateAsync({
        entryId,
        value: nextValue,
      });
    }
    return graphMutation.mutateAsync({
      ops: [{ op: "updateById", path: "/", id: entryId, value: nextValue }],
    });
  };

  if (mode === "edit") {
    if (
      !hasResolvedObject &&
      selectedId &&
      optionsQuery.isLoading &&
      (!selectedEntryValue || !selectedEntry)
    ) {
      return (
        <div className="text-sm text-muted-foreground">
          Loading the referenced {modelName} entry…
        </div>
      );
    }

    if (
      !canEdit ||
      !effectiveModelDescriptor ||
      !selectedEntryValue ||
      !selectedId
    ) {
      return (
        <div className="text-sm text-muted-foreground">
          Unable to load the referenced {modelName} entry.
        </div>
      );
    }

    return (
      assetKind ? (
        <AssetModelForm
          disabled={disabled}
          initialValue={isRecord(selectedEntryValue) ? selectedEntryValue : null}
          kind={assetKind}
          submitLabel={isMutationPending ? "Saving..." : linkActionLabel}
          onSubmit={async (nextValue) => {
            await updateModelEntry(selectedId, nextValue);
            await invalidateModelQueries();
            await onCommit(selectedId);
          }}
        />
      ) : (
        <DescriptorValueForm
          descriptor={effectiveModelDescriptor}
          initialValue={selectedEntryValue}
          submitDisabled={disabled}
          submitLabel={isMutationPending ? "Saving..." : linkActionLabel}
          onSubmit={async (nextValue) => {
            await updateModelEntry(selectedId, nextValue);
            await invalidateModelQueries();
            await onCommit(selectedId);
          }}
        />
      )
    );
  }

  const handleCreatedEntry = async (nextValue: FormData | unknown) => {
    const knownIds = new Set(options.map((entry) => String(entry.id)));
    const result = await createModelEntry(nextValue);
    const createdId = extractCreatedModelId(result, knownIds);
    if (!createdId) {
      throw new Error(`Unable to resolve the new ${modelName} entry.`);
    }

    await invalidateModelQueries();
    setSelectedId(createdId);
    await onCommit(createdId);
  };

  const createContent =
    canCreate && effectiveModelDescriptor ? (
      assetKind ? (
        <AssetModelForm
          disabled={disabled}
          initialValue={
            createDescriptorDefault(effectiveModelDescriptor, localeConfig) as
              | Record<string, unknown>
              | null
          }
          kind={assetKind}
          submitLabel={isMutationPending ? "Creating..." : "Create & Link"}
          onSubmit={handleCreatedEntry}
        />
      ) : (
        <DescriptorValueForm
          descriptor={effectiveModelDescriptor}
          initialValue={createDescriptorDefault(effectiveModelDescriptor, localeConfig)}
          submitDisabled={disabled}
          submitLabel={isMutationPending ? "Creating..." : "Create & Link"}
          onSubmit={handleCreatedEntry}
        />
      )
    ) : (
      <div className="text-sm text-muted-foreground">
        Unable to load the {modelName} schema for creation.
      </div>
    );

  const linkContent = canLink ? (
    <>
      <div className="space-y-2">
        <FieldLabel>Search {modelName}</FieldLabel>
        <Input
          data-testid="model-reference-sheet-link-search"
          disabled={disabled}
          placeholder={`Search existing ${modelName} entries`}
          value={linkSearch}
          onChange={(event) => setLinkSearch(event.target.value)}
        />
        <FieldDescription>
          Narrow existing {modelName} entries before linking.
        </FieldDescription>
      </div>

      <Field>
        <FieldLabel>{modelName}</FieldLabel>
        <FieldContent>
          <Select
            disabled={disabled}
            value={selectedId || "__none__"}
            onValueChange={(nextValue) =>
              setSelectedId(nextValue === "__none__" ? "" : nextValue)
            }
          >
            <SelectTrigger
              className="w-full"
              data-testid="model-reference-sheet-link-select"
            >
              {selectedId ? (
                (() => {
                  const preferredValue =
                    preferredModelField && selectedEntry
                      ? selectedEntry[preferredModelField.key]
                      : undefined;
                  const fallbackValue =
                    selectedEntry && typeof selectedEntry.title === "string"
                      ? selectedEntry.title
                      : selectedEntry && typeof selectedEntry.name === "string"
                        ? selectedEntry.name
                        : selectedEntry && typeof selectedEntry.label === "string"
                          ? selectedEntry.label
                          : selectedEntry && typeof selectedEntry.slug === "string"
                            ? selectedEntry.slug
                            : selectedEntry?.id ?? selectedId;
                  const filename =
                    selectedEntry && typeof selectedEntry.filename === "string"
                      ? selectedEntry.filename
                      : undefined;
                  const url =
                    selectedEntry && typeof selectedEntry.url === "string"
                      ? selectedEntry.url
                      : undefined;

                  return (
                    <DescriptorSelectionOptionItem
                      compact
                      assetKind={assetKind}
                      descriptor={preferredModelField?.descriptor}
                      option={{
                        id: selectedId,
                        label:
                          formatDescriptorValue(
                            preferredModelField?.descriptor,
                            preferredValue ?? fallbackValue,
                          ) || String(fallbackValue),
                        labelValue: preferredValue ?? fallbackValue,
                        filename,
                        url,
                        alt:
                          selectedEntry && typeof selectedEntry.alt === "string"
                            ? selectedEntry.alt
                            : undefined,
                      }}
                    />
                  );
                })()
              ) : (
                <span className="text-muted-foreground">
                  Select {modelName}
                </span>
              )}
            </SelectTrigger>
            <SelectContent
              align="start"
              className="w-[var(--radix-select-trigger-width)]"
              position="popper"
            >
              <SelectGroup>
                <SelectItem value="__none__">No selection</SelectItem>
                {options.map((option) => {
                  const preferredValue =
                    preferredModelField && isRecord(option)
                      ? option[preferredModelField.key]
                      : undefined;
                  const fallbackValue =
                    typeof option.title === "string"
                      ? option.title
                      : typeof option.name === "string"
                        ? option.name
                        : typeof option.label === "string"
                          ? option.label
                          : typeof option.slug === "string"
                            ? option.slug
                            : option.id;
                  const labelText = formatDescriptorValue(
                    preferredModelField?.descriptor,
                    preferredValue ?? fallbackValue,
                  );
                  const filename =
                    typeof option.filename === "string"
                      ? option.filename
                      : undefined;
                  const url =
                    typeof option.url === "string" ? option.url : undefined;

                  return (
                    <SelectItem key={option.id} value={String(option.id)}>
                      <DescriptorSelectionOptionItem
                        compact
                        assetKind={assetKind}
                        descriptor={preferredModelField?.descriptor}
                        option={{
                          id: String(option.id),
                          label: labelText || String(fallbackValue),
                          labelValue: preferredValue ?? fallbackValue,
                          filename,
                          url,
                          alt:
                            typeof option.alt === "string"
                              ? option.alt
                              : undefined,
                        }}
                      />
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Link an existing {modelName} entry into this field.
          </FieldDescription>
        </FieldContent>
      </Field>

      <div className="flex justify-end">
        <Button
          disabled={disabled || isMutationPending || !selectedId}
          type="button"
          onClick={() => void onCommit(selectedId || null)}
        >
          {linkActionLabel}
        </Button>
      </div>
    </>
  ) : (
    <div className="text-sm text-muted-foreground">
      {isLoadingLinkOptions
        ? `Loading existing ${modelName} entries...`
        : `No existing ${modelName} entries are available to link.`}
    </div>
  );

  if (canLink && canCreate) {
    return (
      <Tabs
        value={tab}
        onValueChange={(nextValue) => setTab(nextValue as "create" | "link")}
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger data-testid="model-reference-sheet-link-tab" value="link">
            Link Existing
          </TabsTrigger>
          <TabsTrigger
            data-testid="model-reference-sheet-create-tab"
            value="create"
          >
            Add New
          </TabsTrigger>
        </TabsList>

        <TabsContent className="flex flex-col gap-4 pt-4" value="create">
          {createContent}
        </TabsContent>
        <TabsContent className="flex flex-col gap-4 pt-4" value="link">
          {linkContent}
        </TabsContent>
      </Tabs>
    );
  }

  if (canCreate) {
    return (
      <div className="flex flex-col gap-4">
        {!canLink ? (
          <div className="text-sm text-muted-foreground">
            {isLoadingLinkOptions
              ? `Loading existing ${modelName} entries...`
              : `No existing ${modelName} entries are available to link. Create a new entry below.`}
          </div>
        ) : null}
        {createContent}
      </div>
    );
  }

  if (canLink) {
    return <div className="flex flex-col gap-4">{linkContent}</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {linkContent}
      {createContent}
    </div>
  );
}
