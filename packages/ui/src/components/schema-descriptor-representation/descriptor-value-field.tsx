"use client";

import * as React from "react";

import type { SchemaDescriptor } from "@cms0/admin-contract";
import { ChevronRight } from "lucide-react";

import { Button } from "../button";
import { Checkbox } from "../checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../accordion";
import { Field, FieldContent, FieldDescription, FieldLabel } from "../field";
import { Input } from "../input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import { Textarea } from "../textarea";
import { JsonEditorField } from "./json-editor-field";
import { LocalizedRichTextField } from "./localized-rich-text-field";
import { LocalizedStringField } from "./localized-string-field";
import { ModelReferenceField } from "./model-reference-field";
import { NestedArrayField } from "./nested-array-field";
import { RichTextEditorField } from "./rich-text-editor-field";
import { DescriptorValueForm } from "./descriptor-value-form";
import {
  compileObjectFieldPlan,
  resolveUiOrderingPolicy,
} from "./descriptor-plan";
import {
  createDescriptorDefault,
  extractLocaleConfigFromSnapshot,
  hasMeaningfulValue,
  isDescriptorRequired,
  isRecord,
  readFieldType,
  readUnionBranches,
  readUnionLabel,
  shouldDefaultOpenNestedSection,
  toTitle,
  type ObjectValue,
} from "./helpers";
import { useGraphDocumentOptional } from "./graph-document-context";

export type DescriptorValueFieldProps = {
  descriptor: SchemaDescriptor;
  disabled?: boolean;
  hideSelfHeader?: boolean;
  label: string;
  nestedSubmitLabel?: string;
  onChange: (value: unknown) => void;
  pathSegments?: string[];
  queryPathSegments?: string[];
  value: unknown;
};

function UnionValueField({
  descriptor,
  disabled = false,
  label,
  onChange,
  pathSegments = [],
  queryPathSegments = [],
  value,
}: Readonly<DescriptorValueFieldProps>) {
  const ctx = useGraphDocumentOptional();
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx?.snapshot),
    [ctx?.snapshot],
  );
  const branches = readUnionBranches(descriptor);

  if (branches.length === 0) {
    return (
      <JsonEditorField
        disabled={disabled}
        label={label}
        value={value}
        onChange={onChange}
        description="Union descriptor without branches."
      />
    );
  }

  const firstBranch = branches[0]!;
  const unionRecord = isRecord(value) ? value : {};
  const unionMeta = isRecord(unionRecord.__cms0Union)
    ? unionRecord.__cms0Union
    : {};
  const activeKey =
    typeof unionMeta.branchKey === "string"
      ? unionMeta.branchKey
      : firstBranch.key;
  const activeIndex = Math.max(
    0,
    branches.findIndex((entry) => entry.key === activeKey),
  );
  const activeBranch = branches[activeIndex] ?? firstBranch;
  const branchValue = Object.hasOwn(unionRecord, "value")
    ? unionRecord.value
    : createDescriptorDefault(activeBranch.descriptor, localeConfig);

  return (
    <div className="flex flex-col gap-2">
      <FieldLabel>{toTitle(label)}</FieldLabel>
      <Select
        disabled={disabled}
        value={activeBranch.key}
        onValueChange={(nextKey) => {
          const nextBranch =
            branches.find((entry) => entry.key === nextKey) ?? firstBranch;
          onChange({
            __cms0Union: { branchKey: nextBranch.key },
            value: createDescriptorDefault(nextBranch.descriptor, localeConfig),
          });
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {branches.map((entry) => (
            <SelectItem key={entry.key} value={entry.key}>
              {toTitle(readUnionLabel(entry.descriptor))}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <DescriptorValueField
        descriptor={activeBranch.descriptor}
        label="Value"
        value={branchValue}
        disabled={disabled}
        pathSegments={pathSegments}
        queryPathSegments={queryPathSegments}
        onChange={(nextValue) =>
          onChange({
            __cms0Union: { branchKey: activeBranch.key },
            value: nextValue,
          })
        }
      />
    </div>
  );
}

export function DescriptorValueField({
  descriptor,
  disabled = false,
  hideSelfHeader = false,
  label,
  nestedSubmitLabel = "Update",
  onChange,
  pathSegments = [],
  queryPathSegments = [],
  value,
}: Readonly<DescriptorValueFieldProps>) {
  const ctx = useGraphDocumentOptional();
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx?.snapshot),
    [ctx?.snapshot],
  );
  const fieldType = readFieldType(descriptor);
  const descriptorDefault = React.useMemo(
    () => createDescriptorDefault(descriptor, localeConfig),
    // descriptor identity is stable per-render; localeConfig changes only on
    // snapshot update which should also reset the form via initialValueSignature
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fieldType, localeConfig],
  );
  const objectValueForMerge = isRecord(value)
    ? value
    : isRecord(descriptorDefault)
      ? (descriptorDefault as ObjectValue)
      : {};
  const latestObjectValueRef = React.useRef<ObjectValue>(objectValueForMerge);
  latestObjectValueRef.current = objectValueForMerge;
  const fieldNameForQueryPath =
    queryPathSegments[queryPathSegments.length - 1] ?? label;
  const queryPathKey = queryPathSegments.join(".");
  const currentQueryPath = React.useMemo(
    () =>
      queryPathKey.length > 0
        ? queryPathKey.split(".")
        : [fieldNameForQueryPath],
    [fieldNameForQueryPath, queryPathKey],
  );
  const requiredIndicator =
    isDescriptorRequired(descriptor) && !hasMeaningfulValue(value, fieldType);

  const applyObjectFieldChange = React.useCallback(
    (fieldName: string, nextValue: unknown) => {
      const nextObjectValue = {
        ...latestObjectValueRef.current,
        [fieldName]: nextValue,
      };
      latestObjectValueRef.current = nextObjectValue;
      onChange(nextObjectValue);
    },
    [onChange],
  );

  if (fieldType === "object") {
    const objectValue = isRecord(value)
      ? value
      : (descriptorDefault as ObjectValue);
    const orderingPolicy = resolveUiOrderingPolicy(descriptor);
    const fieldPlan = compileObjectFieldPlan(
      descriptor,
      orderingPolicy,
      "formFields",
    );

    return (
      <div className="flex min-w-0 flex-col gap-8">
        {fieldPlan.map(({ name: fieldName, descriptor: fieldDescriptor }) => {
          const nextDescriptor = isRecord(fieldDescriptor)
            ? (fieldDescriptor as SchemaDescriptor)
            : {};
          const nextFieldType = readFieldType(nextDescriptor);
          const nextPathSegments = [...pathSegments, fieldName];
          const nextQueryPathSegments = [...queryPathSegments, fieldName];
          const isOpenable =
            nextFieldType === "object" || nextFieldType === "array";
          const openHref =
            ctx?.resourceRouteBase && nextPathSegments.length > 0
              ? `${ctx.resourceRouteBase}/${nextPathSegments.map(encodeURIComponent).join("/")}`
              : null;
          const sectionValue = nextPathSegments.join(".") || fieldName;
          const defaultOpen = shouldDefaultOpenNestedSection(nextDescriptor);
          const canSubmitNestedObject =
            nextFieldType === "object" && (ctx?.canSubmitNestedDocument ?? false);

          if (isOpenable) {
            return (
              <Accordion
                key={fieldName}
                className="min-w-0 rounded-md border px-4"
                collapsible
                defaultValue={defaultOpen ? sectionValue : undefined}
                type="single"
              >
                <AccordionItem
                  className="border-b-0"
                  data-field-name={fieldName}
                  data-testid="object-form-field"
                  value={sectionValue}
                >
                  <div className="flex items-center justify-between gap-3">
                    <AccordionTrigger className="py-4 hover:no-underline">
                      <span>{toTitle(fieldName)}</span>
                    </AccordionTrigger>
                    {openHref ? (
                      <Button asChild size="sm" type="button" variant="ghost">
                        <a href={openHref} className="flex items-center gap-1">
                          <span>Open</span>
                          <ChevronRight className="size-4" />
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <AccordionContent className="pb-4">
                    {canSubmitNestedObject ? (
                      <DescriptorValueForm
                        descriptor={nextDescriptor}
                        initialValue={objectValue[fieldName]}
                        nestedSubmitLabel={nestedSubmitLabel}
                        onSubmit={async (nextValue) => {
                          await ctx!.mutate([
                            {
                              op: "set",
                              path: "/" + nextQueryPathSegments.join("/"),
                              value: nextValue,
                            },
                          ]);
                          applyObjectFieldChange(fieldName, nextValue);
                        }}
                        pathSegments={nextPathSegments}
                        queryPathSegments={nextQueryPathSegments}
                        renderAsForm={false}
                        participateInParentSubmit={false}
                        submitDisabled={disabled}
                        submitLabel={nestedSubmitLabel}
                        showSubmitActions
                        valueLabel=""
                      />
                    ) : (
                      <DescriptorValueField
                        descriptor={nextDescriptor}
                        hideSelfHeader
                        label={fieldName}
                        nestedSubmitLabel={nestedSubmitLabel}
                        value={objectValue[fieldName]}
                        disabled={disabled}
                        pathSegments={nextPathSegments}
                        queryPathSegments={nextQueryPathSegments}
                        onChange={(nextValue) =>
                          applyObjectFieldChange(fieldName, nextValue)
                        }
                      />
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            );
          }

          return (
            <div
              key={fieldName}
              className="min-w-0 rounded-md border p-4"
              data-field-name={fieldName}
              data-testid="object-form-field"
            >
              <DescriptorValueField
                descriptor={nextDescriptor}
                label={fieldName}
                nestedSubmitLabel={nestedSubmitLabel}
                value={objectValue[fieldName]}
                disabled={disabled}
                pathSegments={nextPathSegments}
                queryPathSegments={nextQueryPathSegments}
                onChange={(nextValue) =>
                  applyObjectFieldChange(fieldName, nextValue)
                }
              />
            </div>
          );
        })}
      </div>
    );
  }

  if (fieldType === "array") {
    return (
      <NestedArrayField
        descriptor={descriptor}
        showHeader={!hideSelfHeader}
        label={label}
        value={value ?? descriptorDefault}
        pathSegments={pathSegments}
        onChange={onChange}
        disabled={disabled}
        currentPath={currentQueryPath}
      />
    );
  }

  if (fieldType === "json") {
    return (
      <JsonEditorField
        label={label}
        value={value ?? descriptorDefault}
        disabled={disabled}
        onChange={onChange}
        description="This field is stored as JSON in the rework runtime."
      />
    );
  }

  if (fieldType === "union") {
    return (
      <UnionValueField
        descriptor={descriptor}
        label={label}
        pathSegments={pathSegments}
        queryPathSegments={queryPathSegments}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "localizedString") {
    return (
      <LocalizedStringField
        disabled={disabled}
        label={label}
        requiredIndicator={requiredIndicator}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "localizedRichText") {
    return (
      <LocalizedRichTextField
        disabled={disabled}
        label={label}
        requiredIndicator={requiredIndicator}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "richText") {
    return (
      <RichTextEditorField
        disabled={disabled}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "modelRef") {
    return (
      <ModelReferenceField
        disabled={disabled}
        label={label}
        modelName={String(descriptor.model ?? "model")}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (fieldType === "boolean") {
    return (
      <Field orientation="horizontal">
        <FieldLabel className="flex-0! whitespace-nowrap">
          {toTitle(label)}
          {requiredIndicator ? (
            <span className="text-destructive ml-1">*</span>
          ) : null}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Checkbox
            disabled={disabled}
            checked={Boolean(value)}
            onCheckedChange={(nextValue) => onChange(Boolean(nextValue))}
          />
        </div>
        <FieldDescription>
          Toggle the boolean value for this field.
        </FieldDescription>
      </Field>
    );
  }

  if (fieldType === "enum") {
    type EnumOption = { label: string; token: string; value: unknown };
    const valuesDescriptor = (
      descriptor as { values?: unknown[] }
    ).values;
    const toEnumOption = (item: unknown, index: number): EnumOption | null => {
      let rawValue: unknown = item;
      let rawLabel: unknown = item;

      if (isRecord(item) && Object.hasOwn(item, "value")) {
        rawValue = item.value;
        rawLabel = Object.hasOwn(item, "label") ? item.label : item.value;
      }

      if (
        typeof rawValue !== "string" &&
        typeof rawValue !== "number" &&
        typeof rawValue !== "boolean"
      ) {
        return null;
      }

      return {
        label:
          typeof rawLabel === "string" ||
          typeof rawLabel === "number" ||
          typeof rawLabel === "boolean"
            ? String(rawLabel)
            : String(rawValue),
        token: `option-${index}`,
        value: rawValue,
      };
    };
    const options: EnumOption[] =
      Array.isArray(valuesDescriptor) && valuesDescriptor.length > 0
        ? valuesDescriptor
            .map((item, index) => toEnumOption(item, index))
            .filter((option): option is EnumOption => option !== null)
        : Array.isArray(descriptor.enum)
          ? (descriptor.enum as unknown[])
              .map((item, index) => toEnumOption(item, index))
              .filter((option): option is EnumOption => option !== null)
          : [];

    const selectValue =
      options.find((option) => Object.is(option.value, value))?.token ??
      options[0]?.token ??
      "";

    return (
      <Field>
        <FieldLabel>
          {toTitle(label)}
          {requiredIndicator ? (
            <span className="text-destructive ml-1">*</span>
          ) : null}
        </FieldLabel>
        <FieldContent>
          <Select
            disabled={disabled}
            value={selectValue}
            onValueChange={(nextValue) => {
              const option = options.find((entry) => entry.token === nextValue);
              if (option) {
                onChange(option.value);
              }
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={`Select ${label}`} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.token} value={option.token}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FieldContent>
      </Field>
    );
  }

  if (fieldType === "number") {
    return (
      <Field>
        <FieldLabel>
          {toTitle(label)}
          {requiredIndicator ? (
            <span className="text-destructive ml-1">*</span>
          ) : null}
        </FieldLabel>
        <FieldContent>
          <Input
            disabled={disabled}
            type="number"
            value={
              typeof value === "number" ? String(value) : String(value ?? 0)
            }
            onChange={(event) => onChange(Number(event.target.value))}
          />
        </FieldContent>
      </Field>
    );
  }

  const useTextarea =
    fieldType === "richText" || label.toLowerCase().includes("description");

  return (
    <Field>
      <FieldLabel>
        {toTitle(label)}
        {requiredIndicator ? (
          <span className="text-destructive ml-1">*</span>
        ) : null}
      </FieldLabel>
      <FieldContent>
        {useTextarea ? (
          <Textarea
            disabled={disabled}
            rows={6}
            value={typeof value === "string" ? value : String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <Input
            disabled={disabled}
            value={typeof value === "string" ? value : String(value ?? "")}
            onChange={(event) => onChange(event.target.value)}
          />
        )}
      </FieldContent>
    </Field>
  );
}
