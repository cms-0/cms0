"use client";

import * as React from "react";

import {
  useAdminManualTriggerRunsQuery,
  useAdminManualTriggersQuery,
  useCreateAdminManualTriggerMutation,
  useDeleteAdminManualTriggerMutation,
  useRunAdminManualTriggerMutation,
  useUpdateAdminManualTriggerMutation,
} from "@cms0/admin-client";
import type {
  ManualTriggerExecutionResponse,
  ManualTriggerInput,
  ManualTriggerMethod,
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerScopeType,
  ManualTriggerTarget,
} from "@cms0/admin-contract";
import {
  Button,
} from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./field";
import { Input } from "./input";
import { RadioGroup, RadioGroupItem } from "./radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Textarea } from "./textarea";
import { useForm } from "@tanstack/react-form";
import { Copy, LoaderCircle, Pencil, Play, Plus, Trash2 } from "lucide-react";

type TriggerFormValue = {
  attempts: string;
  backoffMs: string;
  bodyTemplate: string;
  buttonLabel: string;
  enabled: "true" | "false";
  extraWaitMs: string;
  headersJson: string;
  method: ManualTriggerMethod;
  name: string;
  queryParamsJson: string;
  scopeName: string;
  scopeType: ManualTriggerScopeType;
  successMessage: string;
  target: ManualTriggerTarget;
  timeoutMs: string;
  url: string;
};

type ManualTriggerManagerProps = {
  availableModels: string[];
  availableRoots: string[];
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  access?: {
    canCreate: boolean;
    canDelete: boolean;
    canExecute: boolean;
    canRead: boolean;
    canUpdate: boolean;
  };
  initialRuns: ManualTriggerRunRecord[];
  initialTriggers: ManualTriggerRecord[];
};

const EMPTY_FORM: TriggerFormValue = {
  attempts: "1",
  backoffMs: "0",
  bodyTemplate: "",
  buttonLabel: "",
  enabled: "true",
  extraWaitMs: "0",
  headersJson: "{}",
  method: "POST",
  name: "",
  queryParamsJson: "{}",
  scopeName: "",
  scopeType: "global",
  successMessage: "",
  target: "editor",
  timeoutMs: "15000",
  url: "",
};

const formatFieldErrors = (errors: ReadonlyArray<unknown>) =>
  errors
    .map((error) => {
      if (typeof error === "string") {
        return error;
      }

      if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return error.message;
      }

      return null;
    })
    .filter((value): value is string => Boolean(value));

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "—";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatTriggerAvailability = (target: ManualTriggerTarget) => {
  switch (target) {
    case "canvas":
      return "Canvas publish";
    case "both":
      return "Editor + Canvas";
    default:
      return "Editor actions";
  }
};

const toJsonText = (value: Record<string, string> | null | undefined) => {
  if (!value || Object.keys(value).length === 0) {
    return "{}";
  }

  return JSON.stringify(value, null, 2);
};

const toFormValue = (value?: ManualTriggerRecord | null): TriggerFormValue => {
  if (!value) {
    return { ...EMPTY_FORM };
  }

  return {
    attempts: value.attempts != null ? String(value.attempts) : "",
    backoffMs: value.backoffMs != null ? String(value.backoffMs) : "",
    bodyTemplate: value.bodyTemplate ?? "",
    buttonLabel: value.buttonLabel,
    enabled: value.enabled ? "true" : "false",
    extraWaitMs: value.extraWaitMs != null ? String(value.extraWaitMs) : "",
    headersJson: toJsonText(value.headersJson),
    method: value.method,
    name: value.name,
    queryParamsJson: toJsonText(value.queryParamsJson),
    scopeName: value.scopeName ?? "",
    scopeType: value.scopeType,
    successMessage: value.successMessage ?? "",
    target: value.target,
    timeoutMs: value.timeoutMs != null ? String(value.timeoutMs) : "",
    url: value.url,
  };
};

const parseJsonRecord = (input: string, fieldLabel: string) => {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      throw new Error(`${fieldLabel} must be a JSON object.`);
    }

    const output = Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key]) => key.trim().length > 0)
        .map(([key, value]) => [key.trim(), String(value)]),
    );

    return Object.keys(output).length > 0 ? output : null;
  } catch {
    throw new Error(`${fieldLabel} must be a valid JSON object.`);
  }
};

const buildPayload = (value: TriggerFormValue): ManualTriggerInput => {
  if (value.name.trim().length < 2) {
    throw new Error("Trigger name must be at least 2 characters.");
  }

  if (value.url.trim().length === 0) {
    throw new Error("Trigger URL is required.");
  }

  if (value.scopeType !== "global" && value.scopeName.trim().length === 0) {
    throw new Error("Scope name is required for root and model triggers.");
  }

  return {
    attempts: value.attempts.trim() ? Number(value.attempts.trim()) : null,
    backoffMs: value.backoffMs.trim() ? Number(value.backoffMs.trim()) : null,
    bodyTemplate: value.bodyTemplate.trim() || null,
    buttonLabel: value.buttonLabel.trim() || value.name.trim(),
    enabled: value.enabled === "true",
    extraWaitMs: value.extraWaitMs.trim() ? Number(value.extraWaitMs.trim()) : null,
    headersJson: parseJsonRecord(value.headersJson, "Headers"),
    method: value.method,
    name: value.name.trim(),
    queryParamsJson: parseJsonRecord(value.queryParamsJson, "Query params"),
    scopeName: value.scopeType === "global" ? null : value.scopeName.trim(),
    scopeType: value.scopeType,
    successMessage: value.successMessage.trim() || null,
    target: value.target,
    timeoutMs: value.timeoutMs.trim() ? Number(value.timeoutMs.trim()) : null,
    url: value.url.trim(),
  };
};

export function ManualTriggerManager({
  availableModels,
  availableRoots,
  adminBaseUrl,
  adminRoutePrefix,
  access = {
    canCreate: true,
    canDelete: true,
    canExecute: true,
    canRead: true,
    canUpdate: true,
  },
  initialRuns,
  initialTriggers,
}: Readonly<ManualTriggerManagerProps>) {
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingTrigger, setEditingTrigger] = React.useState<ManualTriggerRecord | null>(
    null,
  );
  const [notice, setNotice] = React.useState<string | null>(null);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);

  const form = useForm({
    defaultValues: { ...EMPTY_FORM },
    onSubmit: async ({ value }) => {
      setSubmissionError(null);
      setNotice(null);

      try {
        const payload = buildPayload(value);
        if (editingTrigger) {
          await updateMutation.mutateAsync({
            body: payload,
            triggerId: editingTrigger.id,
          });
          return;
        }

        await createMutation.mutateAsync(payload);
      } catch (error) {
        setSubmissionError(
          error instanceof Error ? error.message : "Unable to save trigger.",
        );
      }
    },
  });

  const triggersQuery = useAdminManualTriggersQuery({
    adminBaseUrl,
    adminRoutePrefix,
    enabled: access.canRead,
    initialData: initialTriggers,
  });

  const runsQuery = useAdminManualTriggerRunsQuery({
    adminBaseUrl,
    adminRoutePrefix,
    enabled: access.canRead,
    initialData: initialRuns,
    query: { limit: 30 },
    refetchInterval: 5000,
  });

  const createMutation = useCreateAdminManualTriggerMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "Unable to create trigger.");
    },
    onSuccess: async (trigger) => {
      setEditorOpen(false);
      setEditingTrigger(null);
      form.reset({ ...EMPTY_FORM });
      setNotice(`Created trigger ${trigger.name}.`);
    },
  });

  const updateMutation = useUpdateAdminManualTriggerMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "Unable to update trigger.");
    },
    onSuccess: async (trigger) => {
      setEditorOpen(false);
      setEditingTrigger(null);
      form.reset({ ...EMPTY_FORM });
      setNotice(`Updated trigger ${trigger.name}.`);
    },
  });

  const deleteMutation = useDeleteAdminManualTriggerMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "Unable to delete trigger.");
    },
    onSuccess: async () => {
      setNotice("Trigger deleted.");
    },
  });

  const runMutation = useRunAdminManualTriggerMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (error) => {
      setSubmissionError(error instanceof Error ? error.message : "Unable to run trigger.");
    },
    onSuccess: async (execution) => {
      setNotice(
        execution.run.status === "success"
          ? "Trigger executed successfully."
          : "Trigger finished with an error.",
      );
    },
  });

  React.useEffect(() => {
    if (!editorOpen) {
      return;
    }

    form.reset(editingTrigger ? toFormValue(editingTrigger) : { ...EMPTY_FORM });
  }, [editingTrigger, editorOpen, form]);

  const openCreateDialog = () => {
    setEditingTrigger(null);
    setSubmissionError(null);
    form.reset({ ...EMPTY_FORM });
    setEditorOpen(true);
  };

  const openEditDialog = (trigger: ManualTriggerRecord) => {
    setEditingTrigger(trigger);
    setSubmissionError(null);
    form.reset(toFormValue(trigger));
    setEditorOpen(true);
  };

  const triggers = triggersQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const runsByTrigger = new Map<string, ManualTriggerRunRecord>(
    runs.map((run) => [run.triggerId, run]),
  );
  const scopeOptions =
    form.state.values.scopeType === "model"
      ? availableModels
      : form.state.values.scopeType === "root"
        ? availableRoots
        : [];

  if (!access.canRead) {
    return (
      <div className="rounded-lg border px-4 py-3 text-sm text-muted-foreground">
        You do not have permission to view triggers.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Manual triggers</CardTitle>
            <CardDescription>
              Configure outbound HTTP hooks and run them directly from the admin
              surface.
            </CardDescription>
          </div>
          <Button type="button" onClick={openCreateDialog} disabled={!access.canCreate}>
            <Plus className="size-4" />
            Create trigger
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}
          {submissionError ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {submissionError}
            </div>
          ) : null}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Latest run</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {triggers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6}>No triggers yet.</TableCell>
                </TableRow>
              ) : (
                triggers.map((trigger) => {
                  const latestRun = runsByTrigger.get(trigger.id);
                  const isDeleting =
                    deleteMutation.isPending && deleteMutation.variables === trigger.id;
                  const isRunning =
                    runMutation.isPending && runMutation.variables === trigger.id;

                  return (
                    <TableRow key={trigger.id}>
                      <TableCell className="font-medium">
                        <div className="flex flex-col gap-1">
                          <span>{trigger.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {trigger.buttonLabel}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {trigger.scopeType}
                        {trigger.scopeName ? `:${trigger.scopeName}` : ""}
                      </TableCell>
                      <TableCell>{trigger.method}</TableCell>
                      <TableCell>{formatTriggerAvailability(trigger.target)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span>{latestRun ? latestRun.status : "Never run"}</span>
                          <span className="text-xs text-muted-foreground">
                            {latestRun ? formatDate(latestRun.createdAt) : trigger.url}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!access.canUpdate}
                            onClick={() => openEditDialog(trigger)}
                          >
                            <Pencil className="size-4" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!access.canExecute || isRunning}
                            onClick={() => runMutation.mutate(trigger.id)}
                          >
                            {isRunning ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-4" />
                            )}
                            Run
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(trigger.id);
                              setNotice(`Copied trigger id ${trigger.id}.`);
                            }}
                          >
                            <Copy className="size-4" />
                            Copy ID
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!access.canDelete || isDeleting}
                            onClick={() => {
                              if (window.confirm("Delete this trigger?")) {
                                deleteMutation.mutate(trigger.id);
                              }
                            }}
                          >
                            {isDeleting ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Run history</CardTitle>
          <CardDescription>Latest manual trigger executions.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trigger</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Response</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Finished</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>No trigger runs yet.</TableCell>
                </TableRow>
              ) : (
                runs.map((run) => {
                  const trigger = triggers.find((entry) => entry.id === run.triggerId);
                  return (
                    <TableRow key={run.id}>
                      <TableCell>{trigger?.name ?? run.triggerId}</TableCell>
                      <TableCell>{run.status}</TableCell>
                      <TableCell>
                        {run.responseStatus ?? run.errorMessage ?? "—"}
                      </TableCell>
                      <TableCell>{formatDate(run.createdAt)}</TableCell>
                      <TableCell>{formatDate(run.finishedAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingTrigger ? "Edit trigger" : "Create trigger"}
            </DialogTitle>
            <DialogDescription>
              Configure where the trigger appears and how the outbound HTTP request
              should run.
            </DialogDescription>
          </DialogHeader>

          <form
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field
                name="name"
                validators={{
                  onBlur: ({ value }) =>
                    value.trim().length < 2
                      ? "Name must be at least 2 characters."
                      : undefined,
                }}
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="trigger-name">Name</FieldLabel>
                      <Input
                        id="trigger-name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="Publish hook"
                      />
                      {isInvalid ? (
                        <FieldError>
                          {formatFieldErrors(field.state.meta.errors).join(" ")}
                        </FieldError>
                      ) : null}
                    </Field>
                  );
                }}
              />

              <form.Field
                name="buttonLabel"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor="trigger-button-label">
                      Button label
                    </FieldLabel>
                    <Input
                      id="trigger-button-label"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Run publish hook"
                    />
                    <FieldDescription>
                      Defaults to the trigger name when left blank.
                    </FieldDescription>
                  </Field>
                )}
              />

              <form.Field
                name="successMessage"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor="trigger-success-message">
                      Success message
                    </FieldLabel>
                    <Input
                      id="trigger-success-message"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      placeholder="Trigger completed successfully"
                    />
                  </Field>
                )}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <form.Field
                  name="scopeType"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-scope-type">Scope</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as ManualTriggerScopeType)
                        }
                      >
                        <SelectTrigger id="trigger-scope-type" className="w-full">
                          <SelectValue placeholder="Select scope" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="global">Global</SelectItem>
                          <SelectItem value="root">Root</SelectItem>
                          <SelectItem value="model">Model</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />

                <form.Field
                  name="scopeName"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-scope-name">
                        Scope name
                      </FieldLabel>
                      {form.state.values.scopeType === "global" ? (
                        <Input id="trigger-scope-name" value="Applies everywhere" disabled />
                      ) : scopeOptions.length > 0 ? (
                        <Select
                          value={field.state.value}
                          onValueChange={(value) => field.handleChange(value)}
                        >
                          <SelectTrigger id="trigger-scope-name" className="w-full">
                            <SelectValue placeholder="Select a scope target" />
                          </SelectTrigger>
                          <SelectContent>
                            {scopeOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {option}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="trigger-scope-name"
                          value={field.state.value}
                          onBlur={field.handleBlur}
                          onChange={(event) => field.handleChange(event.target.value)}
                          placeholder="posts"
                        />
                      )}
                    </Field>
                  )}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <form.Field
                  name="method"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-method">Method</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as ManualTriggerMethod)
                        }
                      >
                        <SelectTrigger id="trigger-method" className="w-full">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GET">GET</SelectItem>
                          <SelectItem value="POST">POST</SelectItem>
                          <SelectItem value="PUT">PUT</SelectItem>
                          <SelectItem value="PATCH">PATCH</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />

                <form.Field
                  name="enabled"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-enabled">Enabled</FieldLabel>
                      <Select
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as "false" | "true")
                        }
                      >
                        <SelectTrigger id="trigger-enabled" className="w-full">
                          <SelectValue placeholder="Select enabled state" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                />

                <form.Field
                  name="target"
                  children={(field) => (
                    <Field>
                      <FieldLabel>Trigger surface</FieldLabel>
                      <RadioGroup
                        value={field.state.value}
                        onValueChange={(value) =>
                          field.handleChange(value as ManualTriggerTarget)
                        }
                        className="grid gap-3"
                      >
                        {[
                          {
                            description: "Visible in the editor trigger controls only.",
                            label: "Editor",
                            value: "editor",
                          },
                          {
                            description: "Available during Canvas publish flows.",
                            label: "Canvas",
                            value: "canvas",
                          },
                          {
                            description: "Shared between editor actions and Canvas publish.",
                            label: "Editor + Canvas",
                            value: "both",
                          },
                        ].map((option) => (
                          <label
                            key={option.value}
                            className="flex items-start gap-3 rounded-lg border p-3"
                          >
                            <RadioGroupItem value={option.value} />
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{option.label}</div>
                              <p className="text-xs text-muted-foreground">
                                {option.description}
                              </p>
                            </div>
                          </label>
                        ))}
                      </RadioGroup>
                    </Field>
                  )}
                />
              </div>

              <form.Field
                name="url"
                validators={{
                  onBlur: ({ value }) =>
                    value.trim().length === 0 ? "URL is required." : undefined,
                }}
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="trigger-url">Endpoint URL</FieldLabel>
                      <Input
                        id="trigger-url"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        aria-invalid={isInvalid}
                        placeholder="https://example.com/webhook"
                      />
                      {isInvalid ? (
                        <FieldError>
                          {formatFieldErrors(field.state.meta.errors).join(" ")}
                        </FieldError>
                      ) : null}
                    </Field>
                  );
                }}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <form.Field
                  name="headersJson"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-headers">Headers JSON</FieldLabel>
                      <Textarea
                        id="trigger-headers"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        rows={6}
                      />
                    </Field>
                  )}
                />

                <form.Field
                  name="queryParamsJson"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-query-params">
                        Query params JSON
                      </FieldLabel>
                      <Textarea
                        id="trigger-query-params"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        rows={6}
                      />
                    </Field>
                  )}
                />
              </div>

              <form.Field
                name="bodyTemplate"
                children={(field) => (
                  <Field>
                    <FieldLabel htmlFor="trigger-body-template">
                      Body template
                    </FieldLabel>
                    <Textarea
                      id="trigger-body-template"
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) => field.handleChange(event.target.value)}
                      rows={6}
                    />
                    <FieldDescription>
                      Sent for non-GET and non-DELETE requests.
                    </FieldDescription>
                  </Field>
                )}
              />

              <div className="grid gap-4 md:grid-cols-4">
                <form.Field
                  name="timeoutMs"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-timeout">Timeout ms</FieldLabel>
                      <Input
                        id="trigger-timeout"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                  )}
                />

                <form.Field
                  name="extraWaitMs"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-extra-wait">
                        Extra wait ms
                      </FieldLabel>
                      <Input
                        id="trigger-extra-wait"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                  )}
                />

                <form.Field
                  name="attempts"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-attempts">Attempts</FieldLabel>
                      <Input
                        id="trigger-attempts"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                  )}
                />

                <form.Field
                  name="backoffMs"
                  children={(field) => (
                    <Field>
                      <FieldLabel htmlFor="trigger-backoff">Backoff ms</FieldLabel>
                      <Input
                        id="trigger-backoff"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) => field.handleChange(event.target.value)}
                        inputMode="numeric"
                      />
                    </Field>
                  )}
                />
              </div>
            </FieldGroup>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditorOpen(false)}
              >
                Cancel
              </Button>
              <form.Subscribe
                selector={(state) => state.isSubmitting}
                children={(isSubmitting) => (
                  <Button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      void form.handleSubmit();
                    }}
                  >
                    {isSubmitting ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                    {editingTrigger ? "Save changes" : "Create trigger"}
                  </Button>
                )}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
