"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  buildAdminBackupsQueryKey,
  createAdminClient,
} from "@cms0/admin-client";

import { Button } from "./button";
import { Checkbox } from "./checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";
import { Input } from "./input";
import { Label } from "./label";

type RestoreBackupDialogProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  disabled?: boolean;
  onRestored?: () => Promise<void> | void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
};

const summarizeTableList = (tableNames: string[], limit = 10): string => {
  if (!tableNames.length) return "";
  const preview = tableNames.slice(0, limit).join(", ");
  const suffix =
    tableNames.length > limit ? ` (+${tableNames.length - limit} more)` : "";
  return `${preview}${suffix}`;
};

export function RestoreBackupDialog({
  adminBaseUrl,
  adminRoutePrefix,
  disabled = false,
  onRestored,
  triggerClassName,
  triggerLabel = "Restore from backup",
  triggerSize = "default",
  triggerVariant = "outline",
}: Readonly<RestoreBackupDialogProps>) {
  const queryClient = useQueryClient();
  const client = React.useMemo(
    () =>
      createAdminClient({
        baseUrl: adminBaseUrl,
        routePrefix: adminRoutePrefix,
      }),
    [adminBaseUrl, adminRoutePrefix],
  );
  const [open, setOpen] = React.useState(false);
  const [archiveFile, setArchiveFile] = React.useState<File | null>(null);
  const [reason, setReason] = React.useState("");
  const [skipMissingTables, setSkipMissingTables] = React.useState(false);
  const [preflight, setPreflight] = React.useState<import("@cms0/admin-contract").DataTransferPreflightResponse | null>(
    null,
  );

  const resetForm = React.useCallback(() => {
    setArchiveFile(null);
    setReason("");
    setSkipMissingTables(false);
    setPreflight(null);
  }, []);

  const preflightMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("archive", file);
      return client.dataTransfer.importPreflight(form);
    },
    onSuccess: (result) => {
      setPreflight(result);
      if (!result.canImportStrict && result.canImportBestEffort && result.missingTables.length) {
        toast.warning(
          `Archive contains tables unavailable on this instance: ${summarizeTableList(
            result.missingTables,
          )}.`,
        );
      }
      if (result.compatibilityWarnings.length) {
        toast.warning(result.compatibilityWarnings.join(" "));
      }
    },
    onError: (error) => {
      setPreflight(null);
      toast.error(
        error instanceof Error ? error.message : "Failed to analyze archive.",
      );
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      if (!archiveFile) {
        throw new Error("Please select a backup archive file.");
      }

      const form = new FormData();
      form.append("archive", archiveFile);
      if (reason.trim()) {
        form.append("reason", reason.trim());
      }
      if (skipMissingTables) {
        form.append("skipMissingTables", "true");
      }

      return client.dataTransfer.importArchive(form);
    },
    onSuccess: async (result) => {
      const restoredCount = result.restoredTables.length;
      const skippedCount = result.skippedTables.length;
      if (skippedCount > 0) {
        toast.warning(`Restore completed with ${skippedCount} skipped tables.`);
      } else {
        toast.success(`Restore started. Restored ${restoredCount} tables.`);
      }

      await queryClient.invalidateQueries({
        queryKey: buildAdminBackupsQueryKey(adminBaseUrl),
      });
      await onRestored?.();
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to restore from backup archive.",
      );
    },
  });

  const canImportStrict = preflight?.canImportStrict ?? false;
  const canImportBestEffort = preflight?.canImportBestEffort ?? false;
  const canSubmit =
    Boolean(archiveFile) &&
    Boolean(preflight) &&
    !preflightMutation.isPending &&
    !restoreMutation.isPending &&
    (canImportStrict || (canImportBestEffort && skipMissingTables));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !restoreMutation.isPending) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant={triggerVariant}
          size={triggerSize}
          className={triggerClassName}
          disabled={disabled}
        >
          <Upload className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Restore from backup archive</DialogTitle>
          <DialogDescription>
            Upload a previously downloaded backup archive to restore database
            content. A safety backup is created first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="restore-backup-archive-file">Archive file</Label>
            <Input
              id="restore-backup-archive-file"
              type="file"
              accept=".json.gz,.gz,.json,.dump,.backup,application/octet-stream"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setArchiveFile(selected);
                setPreflight(null);
                setSkipMissingTables(false);
                if (selected) {
                  preflightMutation.mutate(selected);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Upload an archive previously downloaded from this backups page.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="restore-backup-reason">Reason</Label>
            <Input
              id="restore-backup-reason"
              placeholder="Optional reason for the restore"
              value={reason}
              onChange={(event) => setReason(event.currentTarget.value)}
            />
          </div>

          {preflightMutation.isPending ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Analyzing backup archive...
              </span>
            </div>
          ) : null}

          {preflight ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <div className="font-medium">Preflight summary</div>
              <div className="text-muted-foreground">
                Archive type: {preflight.archiveType} | Tables:{" "}
                {preflight.tableCount}
              </div>

              {preflight.missingTables.length ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="space-y-2">
                      <div className="font-medium">Missing tables detected</div>
                      <p>
                        {summarizeTableList(preflight.missingTables)}.
                      </p>
                      {preflight.canImportBestEffort ? (
                        <label className="flex items-start gap-2">
                          <Checkbox
                            checked={skipMissingTables}
                            onCheckedChange={(checked) =>
                              setSkipMissingTables(Boolean(checked))
                            }
                          />
                          <span className="text-sm">
                            Skip missing tables and import the rest.
                          </span>
                        </label>
                      ) : (
                        <p>This archive cannot be imported on this runtime.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              {preflight.compatibilityWarnings.length ? (
                <div className="space-y-1 text-muted-foreground">
                  {preflight.compatibilityWarnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setOpen(false);
              resetForm();
            }}
            disabled={restoreMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => restoreMutation.mutate()}
          >
            {restoreMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            Restore archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
