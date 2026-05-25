"use client";

import * as React from "react";

import {
  useAdminManualTriggersQuery,
  useRunAdminManualTriggerMutation,
} from "@cms0/admin-client";
import type {
  ManualTriggerExecutionResponse,
  ManualTriggerRecord,
  ManualTriggerRunContext,
  ManualTriggerScopeType,
} from "@cms0/admin-contract";
import { LoaderCircle, Zap } from "lucide-react";

import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./dropdown-menu";

type ManualTriggerFabProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  resourceName: string;
  resourceType: Exclude<ManualTriggerScopeType, "global">;
};

type NoticeState =
  | {
      kind: "error" | "success";
      message: string;
    }
  | null;

const buildQueryKey = (
  adminBaseUrl: string,
  resourceType: ManualTriggerFabProps["resourceType"],
  resourceName: string,
) => ["manual-trigger-fab", adminBaseUrl, resourceType, resourceName] as const;

const normalizeResourceName = (value: string) => value.trim().toLowerCase();

const getPendingTriggerId = (
  value:
    | string
    | {
        triggerId: string;
      }
    | undefined,
) => (typeof value === "string" ? value : value?.triggerId);

const matchesScope = (
  trigger: ManualTriggerRecord,
  resourceType: ManualTriggerFabProps["resourceType"],
  resourceName: string,
) => {
  if (!trigger.enabled) {
    return false;
  }

  if (trigger.target !== "editor" && trigger.target !== "both") {
    return false;
  }

  if (trigger.scopeType === "global") {
    return true;
  }

  return (
    trigger.scopeType === resourceType &&
    normalizeResourceName(trigger.scopeName ?? "") === normalizeResourceName(resourceName)
  );
};

export function ManualTriggerFab({
  adminBaseUrl,
  adminRoutePrefix,
  resourceName,
  resourceType,
}: Readonly<ManualTriggerFabProps>) {
  const [notice, setNotice] = React.useState<NoticeState>(null);
  const [open, setOpen] = React.useState(false);
  const normalizedResourceName = normalizeResourceName(resourceName);
  const trimmedResourceName = resourceName.trim();

  React.useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setNotice(null);
    }, 4_000);

    return () => window.clearTimeout(timeout);
  }, [notice]);

  const query = useAdminManualTriggersQuery({
    adminBaseUrl,
    adminRoutePrefix,
    enabled: open && normalizedResourceName.length > 0,
    queryKey: buildQueryKey(adminBaseUrl, resourceType, normalizedResourceName),
  });

  const triggers = React.useMemo(
    () =>
      (query.data ?? []).filter((trigger) =>
        matchesScope(trigger, resourceType, normalizedResourceName),
      ),
    [normalizedResourceName, query.data, resourceType],
  );

  const runMutation = useRunAdminManualTriggerMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (error) => {
      setNotice({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Failed to run trigger.",
      });
    },
    onSuccess: (payload: ManualTriggerExecutionResponse) => {
      const trigger = payload.trigger;
      const message =
        payload.trigger.successMessage ??
        trigger.successMessage ??
        `${trigger.buttonLabel} completed.`;

      setNotice({
        kind: "success",
        message,
      });
    },
  });

  if (normalizedResourceName.length === 0) {
    return null;
  }

  return (
    <>
      <div className="fixed right-6 bottom-6 z-50 flex max-w-sm flex-col gap-2">
        {notice ? (
          <div
            aria-live="polite"
            className={
              notice.kind === "error"
                ? "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive shadow-lg"
                : "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 shadow-lg dark:text-emerald-300"
            }
          >
            {notice.message}
          </div>
        ) : null}
        <DropdownMenu open={open} onOpenChange={setOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              className="justify-start shadow-lg"
              data-testid="floating-trigger-menu"
              type="button"
            >
              <Zap className="h-4 w-4" />
              Triggers
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            {query.isPending ? (
              <DropdownMenuItem disabled>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Loading triggers...
              </DropdownMenuItem>
            ) : query.isError ? (
              <DropdownMenuItem disabled>
                {query.error instanceof Error
                  ? query.error.message
                  : "Failed to load manual triggers."}
              </DropdownMenuItem>
            ) : triggers.length === 0 ? (
              <DropdownMenuItem disabled>No triggers available</DropdownMenuItem>
            ) : (
              triggers.map((trigger) => {
                const pending =
                  runMutation.isPending &&
                  getPendingTriggerId(runMutation.variables) === trigger.id;

                return (
                  <DropdownMenuItem
                    key={trigger.id}
                    data-testid={`floating-trigger-${trigger.id}`}
                    disabled={pending}
                    onSelect={(event) => {
                      event.preventDefault();
                      const pathname =
                        typeof window === "undefined"
                          ? null
                          : window.location.pathname;
                      const context: ManualTriggerRunContext = {
                        pathname,
                        resourceName: trimmedResourceName,
                        resourcePath: `${resourceType}s/${trimmedResourceName}`,
                        resourceType,
                      };
                      runMutation.mutate({
                        context,
                        triggerId: trigger.id,
                      });
                    }}
                  >
                    {pending ? (
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    {trigger.buttonLabel}
                  </DropdownMenuItem>
                );
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
