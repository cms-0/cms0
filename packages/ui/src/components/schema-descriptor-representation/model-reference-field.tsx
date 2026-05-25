"use client";

import * as React from "react";

import {
  useAdminLatestSnapshotQuery,
  useAdminModelReferenceOptionsQuery,
} from "@cms0/admin-client";
import type {
  AdminContentEntry,
  SchemaDescriptor,
} from "@cms0/admin-contract";

import { Field, FieldContent, FieldDescription, FieldLabel } from "../field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import {
  DescriptorSelectionOptionItem,
  formatDescriptorValue,
  resolvePreferredDisplayField,
} from "./descriptor-representation";
import { buildExpandParamsFromDescriptorProperties } from "./expand-params";
import {
  isRecord,
  resolveAssetKindFromModelDescriptor,
  resolveModelDescriptorFromSnapshot,
} from "./helpers";
import { useGraphDocument } from "./graph-document-context";

type ModelReferenceFieldProps = {
  disabled?: boolean;
  label: string;
  modelName: string;
  onChange: (value: unknown) => void;
  value: unknown;
};

export function ModelReferenceField({
  disabled = false,
  label,
  modelName,
  onChange,
  value,
}: Readonly<ModelReferenceFieldProps>) {
  const ctx = useGraphDocument();
  const [isSelectOpen, setIsSelectOpen] = React.useState(false);
  const modelDescriptor = React.useMemo(
    () => resolveModelDescriptorFromSnapshot(ctx.snapshot, modelName),
    [modelName, ctx.snapshot],
  );
  const snapshotQuery = useAdminLatestSnapshotQuery({
    adminBaseUrl: ctx.adminBaseUrl,
    adminRoutePrefix: ctx.adminRoutePrefix,
    enabled: !modelDescriptor && modelName.trim().length > 0,
  });
  const effectiveModelDescriptor = React.useMemo(
    () =>
      modelDescriptor ??
      resolveModelDescriptorFromSnapshot(snapshotQuery.data?.snapshot, modelName),
    [modelDescriptor, modelName, snapshotQuery.data?.snapshot],
  );
  const assetKind = React.useMemo(
    () =>
      resolveAssetKindFromModelDescriptor(modelName, effectiveModelDescriptor),
    [effectiveModelDescriptor, modelName],
  );

  const selectedValue = React.useMemo(() => {
    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
    if (
      isRecord(value) &&
      (typeof value.id === "string" || typeof value.id === "number")
    ) {
      return String(value.id);
    }
    return "";
  }, [value]);

  const preferredModelField = React.useMemo(() => {
    if (!isRecord(effectiveModelDescriptor?.properties)) {
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

  const expandQuery = React.useMemo(
    () =>
      buildExpandParamsFromDescriptorProperties(
        isRecord(effectiveModelDescriptor?.properties)
          ? (effectiveModelDescriptor.properties as Record<string, SchemaDescriptor>)
          : undefined,
      ),
    [effectiveModelDescriptor],
  );

  const query = useAdminModelReferenceOptionsQuery({
    adminBaseUrl: ctx.adminBaseUrl,
    adminRoutePrefix: ctx.adminRoutePrefix,
    modelName,
    query: expandQuery,
    enabled: isSelectOpen && modelName.trim().length > 0,
  });

  const options = React.useMemo(() => {
    const loaded = Array.isArray(query.data?.value)
      ? (query.data.value as AdminContentEntry[])
      : [];
    if (!isRecord(value) || selectedValue.length === 0) {
      return loaded;
    }
    if (loaded.some((entry) => String(entry.id) === selectedValue)) {
      return loaded;
    }
    return [value as AdminContentEntry, ...loaded];
  }, [query.data?.value, selectedValue, value]);

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <FieldContent>
        <Select
          disabled={disabled}
          open={isSelectOpen}
          onOpenChange={setIsSelectOpen}
          value={selectedValue || "__none__"}
          onValueChange={(nextValue) =>
            onChange(nextValue === "__none__" ? null : nextValue)
          }
        >
          <SelectTrigger
            className="w-full"
            data-testid="model-reference-select"
          >
            <SelectValue placeholder={`Select ${modelName}`} />
          </SelectTrigger>
          <SelectContent>
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
                return (
                  <SelectItem key={option.id} value={String(option.id)}>
                    <DescriptorSelectionOptionItem
                      descriptor={preferredModelField?.descriptor}
                      option={{
                        id: option.id,
                        label: labelText || String(fallbackValue),
                        labelValue: preferredValue ?? fallbackValue,
                        filename:
                          typeof option.filename === "string"
                            ? option.filename
                            : undefined,
                        url:
                          typeof option.url === "string"
                            ? option.url
                            : undefined,
                        alt:
                          typeof option.alt === "string"
                            ? option.alt
                            : undefined,
                      }}
                      assetKind={assetKind}
                      compact
                    />
                  </SelectItem>
                );
              })}
              {options.length === 0 ? (
                <SelectItem value="__loading__" disabled>
                  {query.isFetching ? "Loading..." : `No ${modelName} entries`}
                </SelectItem>
              ) : null}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>
          Links this value to the {modelName} model collection.
        </FieldDescription>
      </FieldContent>
    </Field>
  );
}
