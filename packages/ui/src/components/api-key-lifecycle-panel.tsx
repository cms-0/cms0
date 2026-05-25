"use client";

import * as React from "react";
import type { AdminApiKeyPermissionMap, AdminApiKeyRecord } from "@cms0/admin-contract";
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { HelpCircle, LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "./button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./card";
import { Checkbox } from "./checkbox";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip";

type ApiKeyLifecyclePanelProps = {
  adminBaseUrl: string;
  apiKey: AdminApiKeyRecord;
  canDelete?: boolean;
  canUpdate?: boolean;
  defaultPermissions: Record<string, readonly string[]>;
  onSuccess?: () => void;
};

type PermissionState = Record<string, Record<string, boolean>>;

type ApiKeyFormValues = {
  enabled: boolean;
  expiresInDays: string;
  name: string;
  setExpiration: boolean;
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

const formatRemainingDays = (expiresAt: string | null) => {
  if (!expiresAt) {
    return "";
  }

  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) {
    return "";
  }

  const days = Math.ceil((expiry - Date.now()) / (24 * 60 * 60 * 1000));
  return days > 0 ? String(days) : "1";
};

function LabelWithTip({
  htmlFor,
  label,
  tip,
}: {
  htmlFor?: string;
  label: string;
  tip: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
          >
            <HelpCircle className="h-4 w-4" />
            <span className="sr-only">{label} help</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {tip}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

const areFormValuesEqual = (a: ApiKeyFormValues, b: ApiKeyFormValues) =>
  a.name === b.name &&
  a.expiresInDays === b.expiresInDays &&
  a.enabled === b.enabled &&
  a.setExpiration === b.setExpiration;

const arePermissionStatesEqual = (a: PermissionState, b: PermissionState) => {
  const resources = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const resource of resources) {
    const actions = new Set([
      ...Object.keys(a[resource] ?? {}),
      ...Object.keys(b[resource] ?? {}),
    ]);
    for (const action of actions) {
      if ((a[resource]?.[action] ?? false) !== (b[resource]?.[action] ?? false)) {
        return false;
      }
    }
  }
  return true;
};

export function ApiKeyLifecyclePanel({
  adminBaseUrl,
  apiKey,
  canDelete = true,
  canUpdate = true,
  defaultPermissions,
  onSuccess,
}: Readonly<ApiKeyLifecyclePanelProps>) {
  const isRevoked = apiKey.status === "revoked";
  const permissionActions = React.useMemo(
    () => getAllActions(defaultPermissions),
    [defaultPermissions],
  );
  const initialPermissionState = React.useMemo(
    () => buildPermissionState(defaultPermissions, apiKey.permissionsByResource),
    [apiKey.permissionsByResource, defaultPermissions],
  );
  const initialValues = React.useMemo<ApiKeyFormValues>(
    () => ({
      enabled: apiKey.enabled,
      expiresInDays: formatRemainingDays(apiKey.expiresAt),
      name: apiKey.name,
      setExpiration: Boolean(apiKey.expiresAt),
    }),
    [apiKey.enabled, apiKey.expiresAt, apiKey.name],
  );
  const [permissionState, setPermissionState] = React.useState<PermissionState>(
    initialPermissionState,
  );
  const [enabledValue, setEnabledValue] = React.useState(initialValues.enabled);
  const [expirationEnabled, setExpirationEnabled] = React.useState(
    initialValues.setExpiration,
  );
  const [isClientReady, setIsClientReady] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setIsClientReady(true);
  }, []);

  React.useEffect(() => {
    setPermissionState(initialPermissionState);
  }, [initialPermissionState]);

  React.useEffect(() => {
    setEnabledValue(initialValues.enabled);
    setExpirationEnabled(initialValues.setExpiration);
  }, [initialValues.enabled, initialValues.setExpiration]);

  const updateMutation = useMutation({
    mutationFn: async (value: ApiKeyFormValues) => {
      const payload = {
        enabled: enabledValue,
        expiresInDays: expirationEnabled ? value.expiresInDays.trim() : "",
        name: value.name.trim(),
        permissions: buildPermissionsPayload(permissionState),
      };

      const response = await fetch(`${adminBaseUrl}/api-keys/${apiKey.id}`, {
        body: JSON.stringify(payload),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      });
      const responsePayload = (await response.json()) as
        | { error?: string }
        | { key: AdminApiKeyRecord };

      if (!response.ok || !("key" in responsePayload)) {
        const responseError =
          "error" in responsePayload ? responsePayload.error : undefined;
        throw new Error(responseError ?? "Unable to update API key.");
      }

      return responsePayload.key;
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(mutationError.message);
    },
    onSuccess: () => {
      setError(null);
      setMessage("API key updated.");
      onSuccess?.();
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${adminBaseUrl}/api-keys/${apiKey.id}`, {
        method: "DELETE",
      });
      const responsePayload = (await response.json()) as
        | { error?: string }
        | { key: AdminApiKeyRecord };

      if (!response.ok || !("key" in responsePayload)) {
        const responseError =
          "error" in responsePayload ? responsePayload.error : undefined;
        throw new Error(responseError ?? "Unable to revoke API key.");
      }

      return responsePayload.key;
    },
    onError: (mutationError) => {
      setMessage(null);
      setError(mutationError.message);
    },
    onSuccess: () => {
      setError(null);
      setMessage("API key revoked.");
      onSuccess?.();
    },
  });

  const form = useForm({
    defaultValues: initialValues,
    onSubmit: async ({ value }) => {
      await updateMutation.mutateAsync(value);
    },
  });

  return (
    <div
      className="space-y-4"
      data-ready={isClientReady ? "true" : "false"}
      data-testid="api-key-lifecycle-panel"
    >
      <Card>
        <CardHeader>
          <CardTitle>Edit API key</CardTitle>
          <CardDescription>
            Update the display name, active state, expiration, and granted
            permissions.
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
                    <Field data-disabled={isRevoked} data-invalid={isInvalid}>
                      <FieldLabel htmlFor="api-key-edit-name">Name</FieldLabel>
                      <Input
                        id="api-key-edit-name"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                        aria-invalid={isInvalid}
                        disabled={isRevoked || !canUpdate}
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
                name="enabled"
                children={(field) => (
                  <Field orientation="horizontal">
                    <input
                      id="api-key-edit-enabled"
                      type="checkbox"
                      className="size-4 shrink-0 rounded border border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      checked={enabledValue}
                      disabled={isRevoked || !canUpdate}
                      onChange={(event) => {
                        const nextValue = event.target.checked;
                        setEnabledValue(nextValue);
                        field.handleChange(nextValue);
                      }}
                    />
                    <div className="grid gap-1.5">
                      <LabelWithTip
                        htmlFor="api-key-edit-enabled"
                        label="Enabled"
                        tip="Disable a key without revoking it permanently."
                      />
                      <FieldDescription>
                        Disabled keys remain listed but cannot be used.
                      </FieldDescription>
                    </div>
                  </Field>
                )}
              />

              <form.Field
                name="setExpiration"
                children={(field) => (
                  <Field orientation="horizontal">
                    <input
                      id="api-key-edit-set-expiration"
                      type="checkbox"
                      className="size-4 shrink-0 rounded border border-input accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                      data-testid="api-key-edit-set-expiration"
                      checked={expirationEnabled}
                      disabled={isRevoked || !canUpdate}
                      onChange={(event) => {
                        const nextValue = event.target.checked;
                        setExpirationEnabled(nextValue);
                        field.handleChange(nextValue);
                      }}
                    />
                    <div className="grid gap-1.5">
                      <LabelWithTip
                        htmlFor="api-key-edit-set-expiration"
                        label="Set expiration"
                        tip="Control whether this key should expire after a specified number of days."
                      />
                      <FieldDescription>
                        Leave this unchecked to make the key non-expiring.
                      </FieldDescription>
                    </div>
                  </Field>
                )}
              />

              <form.Subscribe selector={(state) => state.values}>
                {(currentValues) => {
                  const comparableValues = {
                    ...currentValues,
                    enabled: enabledValue,
                    setExpiration: expirationEnabled,
                  };
                  const isDirty =
                    !areFormValuesEqual(comparableValues, initialValues) ||
                    !arePermissionStatesEqual(
                      permissionState,
                      initialPermissionState,
                    );

                  return (
                    <>
                      {expirationEnabled ? (
                        <form.Field
                          name="expiresInDays"
                          validators={{
                            onBlur: ({ value }) =>
                              !Number.isFinite(Number(value)) ||
                              Number(value) <= 0
                                ? "Enter a valid number of days."
                                : undefined,
                          }}
                          children={(field) => {
                            const isInvalid =
                              field.state.meta.isTouched &&
                              !field.state.meta.isValid;

                            return (
                              <Field
                                data-disabled={isRevoked}
                                data-invalid={isInvalid}
                              >
                                <FieldLabel htmlFor="api-key-edit-expiry">
                                  Expires in (days)
                                </FieldLabel>
                                <Input
                                  id="api-key-edit-expiry"
                                  value={field.state.value}
                                  onBlur={field.handleBlur}
                                  onChange={(event) =>
                                    field.handleChange(event.target.value)
                                  }
                                  aria-invalid={isInvalid}
                                  disabled={isRevoked || !canUpdate}
                                  inputMode="numeric"
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
                      ) : null}

                      <div className="space-y-3">
                        <div>
                          <div className="text-sm font-medium">Permissions</div>
                          <p className="text-sm text-muted-foreground">
                            Adjust the granted actions for each resource.
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
                                  <TableCell className="font-medium">
                                    {resource}
                                  </TableCell>
                                  {permissionActions.map((action) => (
                                    <TableCell key={`${resource}:${action}`}>
                                      <Checkbox
                                        checked={
                                          permissionState[resource]?.[action] ??
                                          false
                                        }
                                        disabled={isRevoked || !canUpdate}
                                        onCheckedChange={(checked) => {
                                          setPermissionState((current) => ({
                                            ...current,
                                            [resource]: {
                                              ...current[resource],
                                              [action]: checked === true,
                                            },
                                          }));
                                        }}
                                      />
                                    </TableCell>
                                  ))}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {message ? (
                        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary">
                          {message}
                        </div>
                      ) : null}

                      {error ? (
                        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                          {error}
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={!isDirty || isRevoked || !canUpdate}
                          onClick={() => {
                            form.reset(initialValues, {
                              keepDefaultValues: true,
                            });
                            setPermissionState(initialPermissionState);
                            setEnabledValue(initialValues.enabled);
                            setExpirationEnabled(initialValues.setExpiration);
                            setMessage(null);
                            setError(null);
                          }}
                        >
                          Reset
                        </Button>
                        <Button
                          type="submit"
                          disabled={
                            !isDirty ||
                            isRevoked ||
                            !canUpdate ||
                            updateMutation.isPending
                          }
                        >
                          {updateMutation.isPending ? "Saving..." : "Save changes"}
                        </Button>
                      </div>
                    </>
                  );
                }}
              </form.Subscribe>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revoke key</CardTitle>
          <CardDescription>
            Revocation permanently disables the credential while keeping its
            audit metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Once revoked, the secret cannot be used again. Create a new key if
            you need replacement credentials.
          </p>
          {canDelete ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="destructive"
                disabled={isRevoked || revokeMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm("Revoke this API key? This cannot be undone.")
                  ) {
                    revokeMutation.mutate();
                  }
                }}
              >
                {revokeMutation.isPending ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 />
                )}
                Revoke key
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
