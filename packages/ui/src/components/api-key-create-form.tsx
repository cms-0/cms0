"use client";

import * as React from "react";
import type {
  AdminApiKeyCreateResponse,
  AdminApiKeyPermissionMap,
} from "@cms0/admin-contract";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";

import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./collapsible";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "./field";
import { Input } from "./input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

type ApiKeyCreateFormProps = {
  adminBaseUrl: string;
  buildDetailHref?: (keyId: string, payload: AdminApiKeyCreateResponse) => string;
  defaultPermissions: Record<string, readonly string[]>;
};

type PermissionState = Record<string, Record<string, boolean>>;

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

const getAllActions = (catalog: Record<string, readonly string[]>) =>
  Array.from(
    Object.values(catalog).reduce((actions, resourceActions) => {
      for (const action of resourceActions) {
        actions.add(action);
      }
      return actions;
    }, new Set<string>()),
  );

const buildPermissionState = (
  catalog: Record<string, readonly string[]>,
  overrides?: AdminApiKeyPermissionMap | null,
): PermissionState => {
  const actions = getAllActions(catalog);

  return Object.fromEntries(
    Object.entries(catalog).map(([resource, defaults]) => {
      const selected = new Set(overrides?.[resource] ?? defaults);
      return [
        resource,
        Object.fromEntries(actions.map((action) => [action, selected.has(action)])),
      ];
    }),
  );
};

const buildPermissionsPayload = (state: PermissionState): AdminApiKeyPermissionMap =>
  Object.fromEntries(
    Object.entries(state).map(([resource, actions]) => [
      resource,
      Object.entries(actions)
        .filter(([, enabled]) => enabled)
        .map(([action]) => action),
    ]),
  );

export function ApiKeyCreateForm({
  adminBaseUrl,
  buildDetailHref,
  defaultPermissions,
}: Readonly<ApiKeyCreateFormProps>) {
  const [createdPayload, setCreatedPayload] =
    React.useState<AdminApiKeyCreateResponse | null>(null);
  const [permissionState, setPermissionState] = React.useState<PermissionState>(() =>
    buildPermissionState(defaultPermissions),
  );
  const [submissionError, setSubmissionError] = React.useState<string | null>(
    null,
  );
  const [showAdvanced, setShowAdvanced] = React.useState(false);
  const [isClientReady, setIsClientReady] = React.useState(false);
  const [rateLimitEnabled, setRateLimitEnabled] = React.useState(false);

  React.useEffect(() => {
    setIsClientReady(true);
  }, []);

  const permissionActions = React.useMemo(
    () => getAllActions(defaultPermissions),
    [defaultPermissions],
  );

  const createKeyMutation = useMutation({
    mutationFn: async (value: {
      enableRateLimit: boolean;
      expiresInDays: string;
      name: string;
      rateLimitMax: string;
      rateLimitWindowMs: string;
    }) => {
      const payload = {
        expiresInDays: value.expiresInDays.trim() || undefined,
        name: value.name.trim(),
        permissions: buildPermissionsPayload(permissionState),
        prefix: "cms0_",
        rateLimitEnabled: value.enableRateLimit,
        rateLimitMax: value.enableRateLimit
          ? Number(value.rateLimitMax.trim())
          : undefined,
        rateLimitTimeWindow: value.enableRateLimit
          ? Number(value.rateLimitWindowMs.trim())
          : undefined,
      };

      const response = await fetch(`${adminBaseUrl}/api-keys`, {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      });
      const rawResponseText = await response.text();
      let responsePayload = {} as
        | { error?: string }
        | AdminApiKeyCreateResponse;
      if (rawResponseText) {
        try {
          responsePayload = JSON.parse(rawResponseText) as
            | { error?: string }
            | AdminApiKeyCreateResponse;
        } catch {
          if (!response.ok) {
            throw new Error("Unable to create API key.");
          }
        }
      }

      if (!response.ok || !("key" in responsePayload)) {
        const message =
          "error" in responsePayload ? responsePayload.error : undefined;
        throw new Error(message ?? "Unable to create API key.");
      }

      return responsePayload;
    },
    onError: (error) => {
      setSubmissionError(error.message);
    },
    onSuccess: (payload) => {
      setCreatedPayload(payload);
      setSubmissionError(null);
    },
  });

  const form = useForm({
    defaultValues: {
      enableRateLimit: false,
      expiresInDays: "",
      name: "",
      rateLimitMax: "",
      rateLimitWindowMs: "",
    },
    onSubmit: async ({ value }) => {
      await createKeyMutation.mutateAsync(value);
    },
  });

  const secretValue = createdPayload?.secret ?? null;
  const detailHref = createdPayload
    ? buildDetailHref?.(createdPayload.key.id, createdPayload) ??
      createdPayload.viewPath
    : null;

  return (
    <>
      {secretValue ? (
        <Card>
          <CardHeader>
            <CardTitle>API key created</CardTitle>
            <CardDescription>
              Copy this key now. It won&apos;t be shown again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm"
              data-testid="self-hosted-api-key-secret"
            >
              {secretValue}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(secretValue);
                }}
              >
                Copy key
              </Button>
              {detailHref ? (
                <Button asChild variant="outline">
                  <a href={detailHref}>Open key details</a>
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Key details</CardTitle>
          <CardDescription>
            Generate a credential for API access. The full secret is shown only
            once after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
                      <FieldLabel htmlFor="api-key-name">Name</FieldLabel>
                      <Input
                        id="api-key-name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={isInvalid}
                        placeholder="Project API key"
                      />
                      <FieldDescription>
                        Optional label shown in the key list.
                      </FieldDescription>
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
                name="expiresInDays"
                validators={{
                  onBlur: ({ value }) =>
                    value.trim().length > 0 &&
                    (!Number.isFinite(Number(value)) || Number(value) <= 0)
                      ? "Expiry must be a positive number of days."
                      : undefined,
                }}
                children={(field) => {
                  const isInvalid =
                    field.state.meta.isTouched && !field.state.meta.isValid;

                  return (
                    <Field data-invalid={isInvalid}>
                      <FieldLabel htmlFor="api-key-expiry">
                        Expires in (days)
                      </FieldLabel>
                      <Input
                        id="api-key-expiry"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={isInvalid}
                        inputMode="numeric"
                        placeholder="Leave blank for no expiry"
                      />
                      <FieldDescription>
                        Leave empty to create a non-expiring key.
                      </FieldDescription>
                      {isInvalid ? (
                        <FieldError>
                          {formatFieldErrors(field.state.meta.errors).join(" ")}
                        </FieldError>
                      ) : null}
                    </Field>
                  );
                }}
              />
            </FieldGroup>

            <div className="space-y-3">
              <div>
                <div className="text-sm font-medium">Permissions</div>
                <p className="text-sm text-muted-foreground">
                  Select exactly which capabilities this key should grant.
                </p>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Resource</TableHead>
                      {permissionActions.map((action) => (
                        <TableHead key={action} className="capitalize">
                          {action}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.keys(defaultPermissions).map((resource) => (
                      <TableRow key={resource}>
                        <TableCell className="font-medium">{resource}</TableCell>
                        {permissionActions.map((action) => {
                          const checked = permissionState[resource]?.[action] ?? false;
                          return (
                            <TableCell key={`${resource}:${action}`}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(nextValue) => {
                                  setPermissionState((current) => ({
                                    ...current,
                                    [resource]: {
                                      ...current[resource],
                                      [action]: nextValue === true,
                                    },
                                  }));
                                }}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <div className="rounded-md border">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium"
                  >
                    Advanced options
                    <span className="text-muted-foreground">
                      {showAdvanced ? "Hide" : "Show"}
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="border-t px-4 py-4">
                  <FieldGroup>
                    <form.Field
                      name="enableRateLimit"
                      children={(field) => (
                        <Field orientation="horizontal">
                          <Checkbox
                            checked={field.state.value}
                            onCheckedChange={(checked) => {
                              const nextValue = checked === true;
                              field.handleChange(nextValue);
                              setRateLimitEnabled(nextValue);
                            }}
                          />
                          <div className="grid gap-1.5">
                            <FieldLabel>Enable rate limiting</FieldLabel>
                            <FieldDescription>
                              Limit how frequently this key can be used.
                            </FieldDescription>
                          </div>
                        </Field>
                      )}
                    />

                    {rateLimitEnabled ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <form.Field
                          name="rateLimitMax"
                          validators={{
                            onBlur: ({ value }) =>
                              rateLimitEnabled &&
                              (!Number.isInteger(Number(value)) || Number(value) <= 0)
                                ? "Enter a valid positive integer."
                                : undefined,
                          }}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid;

                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel htmlFor="api-key-rate-limit-max">
                                  Max requests
                                </FieldLabel>
                                <Input
                                  id="api-key-rate-limit-max"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  aria-invalid={isInvalid}
                                  inputMode="numeric"
                                  placeholder="100"
                                />
                                {isInvalid ? (
                                  <FieldError>
                                    {formatFieldErrors(
                                      field.state.meta.errors,
                                    ).join(" ")}
                                  </FieldError>
                                ) : null}
                              </Field>
                            );
                          }}
                        />

                        <form.Field
                          name="rateLimitWindowMs"
                          validators={{
                            onBlur: ({ value }) =>
                              rateLimitEnabled &&
                              (!Number.isInteger(Number(value)) || Number(value) <= 0)
                                ? "Enter a valid positive integer."
                                : undefined,
                          }}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid;

                            return (
                              <Field data-invalid={isInvalid}>
                                <FieldLabel htmlFor="api-key-rate-limit-window">
                                  Time window (ms)
                                </FieldLabel>
                                <Input
                                  id="api-key-rate-limit-window"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  aria-invalid={isInvalid}
                                  inputMode="numeric"
                                  placeholder="1000"
                                />
                                {isInvalid ? (
                                  <FieldError>
                                    {formatFieldErrors(
                                      field.state.meta.errors,
                                    ).join(" ")}
                                  </FieldError>
                                ) : null}
                              </Field>
                            );
                          }}
                        />
                      </div>
                    ) : null}
                  </FieldGroup>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {submissionError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {submissionError}
              </div>
            ) : null}

            <div className="flex justify-end">
              <Button
                type="button"
                disabled={!isClientReady || createKeyMutation.isPending}
                onClick={() => {
                  void form.handleSubmit();
                }}
              >
                {createKeyMutation.isPending ? "Creating..." : "Create API key"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
