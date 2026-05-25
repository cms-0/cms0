"use client";

import * as React from "react";

import type { SchemaDescriptor } from "@cms0/admin-contract";
import { useForm } from "@tanstack/react-form";

import { Button } from "../button";
import {
  DescriptorFormWorkflowContext,
  dispatchRichTextFlush,
  useDescriptorFormWorkflow,
} from "./descriptor-form-workflow";
import {
  createDescriptorDefault,
  extractLocaleConfigFromSnapshot,
  isRecord,
  resolveAssetKindFromDescriptor,
} from "./helpers";
import { AssetModelForm } from "./inputs/asset-model-form";
import { DescriptorValueField } from "./descriptor-value-field";
import { useGraphDocumentOptional } from "./graph-document-context";

const toSignaturePart = (value: unknown): string => {
  if (value == null) return "";
  if (typeof value !== "object") return JSON.stringify(value);
  try {
    return JSON.stringify(value, (_key, nestedValue) => {
      if (
        nestedValue &&
        typeof nestedValue === "object" &&
        !Array.isArray(nestedValue)
      ) {
        return Object.keys(nestedValue as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (nestedValue as Record<string, unknown>)[key];
            return acc;
          }, {});
      }

      return nestedValue;
    });
  } catch {
    return String(value);
  }
};

const buildInitialValueSignature = (
  descriptor: SchemaDescriptor,
  value: unknown,
) => `${toSignaturePart(descriptor)}::${toSignaturePart(value)}`;

type DescriptorValueFormProps = {
  autoSave?: boolean;
  autoSaveDelay?: number;
  descriptor: SchemaDescriptor;
  initialValue: unknown;
  nestedSubmitLabel?: string;
  onDirtyStateChange?: (isDirty: boolean) => void;
  onRegisterSubmit?: (submit: () => Promise<void>) => void;
  onSubmit: (value: unknown) => Promise<void>;
  pathSegments?: string[];
  queryPathSegments?: string[];
  renderAsForm?: boolean;
  participateInParentSubmit?: boolean;
  showSubmitActions?: boolean;
  submitDisabled?: boolean;
  submitDisabledMessage?: string;
  submitLabel: string;
  valueLabel?: string;
};

export function DescriptorValueForm({
  autoSave = false,
  autoSaveDelay = 1000,
  descriptor,
  initialValue,
  nestedSubmitLabel = "Update",
  onDirtyStateChange,
  onRegisterSubmit,
  onSubmit,
  pathSegments = [],
  queryPathSegments = [],
  renderAsForm = true,
  participateInParentSubmit = true,
  showSubmitActions = true,
  submitDisabled = false,
  submitDisabledMessage,
  submitLabel,
  valueLabel = "Value",
}: Readonly<DescriptorValueFormProps>) {
  const ctx = useGraphDocumentOptional();
  const apiPath = React.useMemo(() => pathSegments.join("/"), [pathSegments]);
  const parentWorkflow = useDescriptorFormWorkflow();
  const formId = React.useId();
  const localeConfig = React.useMemo(
    () => extractLocaleConfigFromSnapshot(ctx?.snapshot),
    [ctx?.snapshot],
  );
  const assetKind = React.useMemo(
    () => resolveAssetKindFromDescriptor(descriptor, ctx?.snapshot),
    [descriptor, ctx?.snapshot],
  );
  const initialValueSignature = React.useMemo(
    () => buildInitialValueSignature(descriptor, initialValue),
    [descriptor, initialValue],
  );
  const initialFormValue = React.useMemo(
    () => initialValue ?? createDescriptorDefault(descriptor, localeConfig),
    // Collection create flows pass freshly-created default objects on parent
    // rerenders.  Key resets off semantic input instead of object identity so
    // selected model refs and typed fields are not wiped before submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initialValueSignature],
  );
  const form = useForm({
    defaultValues: {
      value: initialFormValue,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value.value);
    },
  });

  React.useEffect(() => {
    form.reset({
      value: initialFormValue,
    });
  }, [form, initialFormValue]);

  if (assetKind) {
    const isBusy = Boolean(ctx?.isMutating || ctx?.isFetching);
    return (
      <AssetModelForm
        disabled={submitDisabled || isBusy}
        initialValue={isRecord(initialValue) ? initialValue : null}
        kind={assetKind}
        label={valueLabel}
        submitLabel={submitLabel}
        onSubmit={onSubmit}
      />
    );
  }

  const nestedDirtyStateRef = React.useRef(new Map<string, boolean>());
  const nestedSubmittersRef = React.useRef(
    new Map<string, () => Promise<void>>(),
  );
  const nestedFlushersRef = React.useRef(new Map<string, () => Promise<void>>());
  const ownDirtyRef = React.useRef(false);

  const getIsDirty = React.useCallback(() => {
    if (ownDirtyRef.current) {
      return true;
    }

    for (const isDirty of nestedDirtyStateRef.current.values()) {
      if (isDirty) {
        return true;
      }
    }

    return false;
  }, []);

  const emitDirtyState = React.useCallback(() => {
    const nextIsDirty = getIsDirty();
    onDirtyStateChange?.(nextIsDirty);
    parentWorkflow?.registerNestedDirtyState(formId, nextIsDirty);
  }, [formId, getIsDirty, onDirtyStateChange, parentWorkflow]);

  const workflowContextValue = React.useMemo(
    () => ({
      registerNestedDirtyState(id: string, isDirty: boolean) {
        nestedDirtyStateRef.current.set(id, isDirty);
        emitDirtyState();
      },
      registerNestedFlush(id: string, flush: () => Promise<void> | void) {
        nestedFlushersRef.current.set(id, async () => {
          await flush();
        });

        return () => {
          nestedFlushersRef.current.delete(id);
        };
      },
      registerNestedSubmit(id: string, submit: () => Promise<void> | void) {
        nestedSubmittersRef.current.set(id, async () => {
          await submit();
        });

        return () => {
          nestedSubmittersRef.current.delete(id);
          nestedDirtyStateRef.current.delete(id);
          emitDirtyState();
        };
      },
    }),
    [emitDirtyState],
  );

  React.useEffect(() => {
    const subscription = form.store.subscribe((state) => {
      ownDirtyRef.current = state.isDirty;
      emitDirtyState();
    });
    return () => subscription.unsubscribe();
  }, [emitDirtyState, form.store]);

  const submitWithWorkflow = React.useCallback(async () => {
    await dispatchRichTextFlush();

    for (const flush of nestedFlushersRef.current.values()) {
      await flush();
    }

    for (const submit of nestedSubmittersRef.current.values()) {
      await submit();
    }

    await dispatchRichTextFlush();
    await form.handleSubmit();
  }, [form]);

  React.useEffect(() => {
    const unregisterParent =
      participateInParentSubmit && parentWorkflow
        ? parentWorkflow.registerNestedSubmit(formId, submitWithWorkflow)
        : undefined;

    if (!onRegisterSubmit) {
      return () => unregisterParent?.();
    }

    onRegisterSubmit(submitWithWorkflow);
    return () => unregisterParent?.();
  }, [
    formId,
    onRegisterSubmit,
    parentWorkflow,
    participateInParentSubmit,
    submitWithWorkflow,
  ]);

  React.useEffect(
    () => () => {
      parentWorkflow?.registerNestedDirtyState(formId, false);
    },
    [formId, parentWorkflow],
  );

  const [autoSaveStatus, setAutoSaveStatus] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const clearStatusTimerRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  React.useEffect(() => {
    if (!autoSave) return;

    const subscription = form.store.subscribe((state) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

      if (
        state.isDirty &&
        state.canSubmit &&
        !state.isSubmitting &&
        !submitDisabled
      ) {
        autoSaveTimerRef.current = setTimeout(() => {
          setAutoSaveStatus("saving");
          Promise.resolve(submitWithWorkflow())
            .then(() => {
              setAutoSaveStatus("saved");
              if (clearStatusTimerRef.current) {
                clearTimeout(clearStatusTimerRef.current);
              }
              clearStatusTimerRef.current = setTimeout(
                () => setAutoSaveStatus("idle"),
                2000,
              );
            })
            .catch(() => setAutoSaveStatus("error"));
        }, autoSaveDelay);
      }
    });

    return () => {
      subscription.unsubscribe();
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (clearStatusTimerRef.current) {
        clearTimeout(clearStatusTimerRef.current);
      }
    };
  }, [autoSave, autoSaveDelay, form.store, submitDisabled, submitWithWorkflow]);

  return (
    <DescriptorFormWorkflowContext.Provider value={workflowContextValue}>
      {renderAsForm ? (
        <form
          className="grid gap-4"
          data-api-path={apiPath}
          data-testid="object-form"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (submitDisabled) {
              return;
            }
            Promise.resolve(submitWithWorkflow()).catch(() => {});
          }}
        >
          <fieldset className="grid gap-4" disabled={submitDisabled}>
            <form.Field name="value">
              {(field) => (
                <DescriptorValueField
                  descriptor={descriptor}
                  disabled={submitDisabled}
                  label={valueLabel}
                  nestedSubmitLabel={nestedSubmitLabel}
                  value={field.state.value}
                  pathSegments={pathSegments}
                  queryPathSegments={queryPathSegments}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </fieldset>
          {showSubmitActions ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                {autoSave ? (
                  <span className="text-xs text-muted-foreground">
                    {autoSaveStatus === "saving" && "Saving…"}
                    {autoSaveStatus === "saved" && "Saved"}
                    {autoSaveStatus === "error" && "Error saving"}
                  </span>
                ) : null}
                <form.Subscribe
                  selector={(state) => ({
                    canSubmit: state.canSubmit,
                    isSubmitting: state.isSubmitting,
                  })}
                >
                  {(state) => (
                    <Button
                      data-api-path={apiPath}
                      data-testid="object-form-submit"
                      disabled={
                        submitDisabled || !state.canSubmit || state.isSubmitting
                      }
                      type="submit"
                    >
                      {state.isSubmitting ? "Saving..." : submitLabel}
                    </Button>
                  )}
                </form.Subscribe>
              </div>
              {submitDisabledMessage ? (
                <p className="text-right text-sm text-muted-foreground">
                  {submitDisabledMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </form>
      ) : (
        <div
          className="grid gap-4"
          data-api-path={apiPath}
          data-testid="object-form"
        >
          <fieldset className="grid gap-4" disabled={submitDisabled}>
            <form.Field name="value">
              {(field) => (
                <DescriptorValueField
                  descriptor={descriptor}
                  disabled={submitDisabled}
                  label={valueLabel}
                  nestedSubmitLabel={nestedSubmitLabel}
                  value={field.state.value}
                  pathSegments={pathSegments}
                  queryPathSegments={queryPathSegments}
                  onChange={field.handleChange}
                />
              )}
            </form.Field>
          </fieldset>
          {showSubmitActions ? (
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-3">
                {autoSave ? (
                  <span className="text-xs text-muted-foreground">
                    {autoSaveStatus === "saving" && "Saving…"}
                    {autoSaveStatus === "saved" && "Saved"}
                    {autoSaveStatus === "error" && "Error saving"}
                  </span>
                ) : null}
                <form.Subscribe
                  selector={(state) => ({
                    canSubmit: state.canSubmit,
                    isSubmitting: state.isSubmitting,
                  })}
                >
                  {(state) => (
                    <Button
                      data-api-path={apiPath}
                      data-testid="object-form-submit"
                      disabled={
                        submitDisabled || !state.canSubmit || state.isSubmitting
                      }
                      type="button"
                      onClick={() => {
                        if (
                          submitDisabled ||
                          !state.canSubmit ||
                          state.isSubmitting
                        ) {
                          return;
                        }
                        Promise.resolve(submitWithWorkflow()).catch(() => {});
                      }}
                    >
                      {state.isSubmitting ? "Saving..." : submitLabel}
                    </Button>
                  )}
                </form.Subscribe>
              </div>
              {submitDisabledMessage ? (
                <p className="text-right text-sm text-muted-foreground">
                  {submitDisabledMessage}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </DescriptorFormWorkflowContext.Provider>
  );
}
