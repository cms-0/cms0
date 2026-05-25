"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";
import { createAdminClient } from "@cms0/admin-client";

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from "@cms0/ui";

type ImportDataResult = {
  importedBackupId?: string;
  ok: boolean;
  restoredTables?: string[];
  safetyBackupId?: string | null;
  skippedMissingTables?: boolean;
  skippedTables?: string[];
};

type ImportPreflightResult = {
  archiveType: "json-snapshot" | "pg-dump";
  canImportBestEffort: boolean;
  canImportStrict: boolean;
  compatibilityWarnings: string[];
  missingTables: string[];
  ok: boolean;
  tableCount: number;
};

type ImportDataDialogProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  disabled?: boolean;
  onImported?: () => Promise<void> | void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
};

const extractErrorMessage = (error: unknown, fallback: string) => {
  if (!error) return fallback;
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error || fallback;
  if (typeof error === "object" && error !== null) {
    const source = error as Record<string, unknown>;
    const message =
      (typeof source.message === "string" && source.message) ||
      (typeof source.error === "string" && source.error) ||
      (typeof source.code === "string" && source.code);
    if (message) return message;
  }
  return fallback;
};

const summarizeTableList = (tableNames: string[], limit = 10) => {
  if (!tableNames.length) return "";
  const preview = tableNames.slice(0, limit).join(", ");
  const suffix =
    tableNames.length > limit ? ` (+${tableNames.length - limit} more)` : "";
  return `${preview}${suffix}`;
};

export function ImportDataDialog({
  adminBaseUrl,
  adminRoutePrefix,
  disabled = false,
  onImported,
  triggerClassName,
  triggerLabel = "Import data",
  triggerSize = "default",
  triggerVariant = "outline",
}: Readonly<ImportDataDialogProps>) {
  const queryClient = useQueryClient();
  const router = useRouter();
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
  const [preflight, setPreflight] = React.useState<ImportPreflightResult | null>(
    null,
  );
  const [skipMissingTables, setSkipMissingTables] = React.useState(false);

  const resetState = () => {
    setArchiveFile(null);
    setReason("");
    setPreflight(null);
    setSkipMissingTables(false);
  };

  const preflightMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("archive", file);
      return (await client.dataTransfer.importPreflight(form)) as ImportPreflightResult;
    },
    onSuccess: (result) => {
      setPreflight(result);
      if (!result) return;
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
      toast.error(extractErrorMessage(error, "Failed to analyze archive."));
    },
  });

  const importMutation = useMutation({
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

      return (await client.dataTransfer.importArchive(form)) as ImportDataResult;
    },
    onSuccess: async (result) => {
      const restoredCount = result?.restoredTables?.length ?? 0;
      const skippedCount = result?.skippedTables?.length ?? 0;
      if (skippedCount > 0) {
        toast.warning(`Data import completed with ${skippedCount} skipped tables.`);
      } else {
        toast.success(`Data imported successfully. Restored ${restoredCount} tables.`);
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["schema-backups"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-backups"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-content"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-model-reference-options"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-schema-latest-snapshot"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-schema-latest-typescript"] }),
      ]);
      await onImported?.();
      setOpen(false);
      resetState();
      router.refresh();
    },
    onError: (error) => {
      toast.error(extractErrorMessage(error, "Failed to import data archive."));
    },
  });

  const canImportStrict = preflight?.canImportStrict ?? false;
  const canImportBestEffort = preflight?.canImportBestEffort ?? false;
  const canSubmit =
    Boolean(archiveFile) &&
    !preflightMutation.isPending &&
    !importMutation.isPending &&
    Boolean(preflight) &&
    (canImportStrict || (canImportBestEffort && skipMissingTables));

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !importMutation.isPending) {
          resetState();
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button
          className={triggerClassName}
          disabled={disabled}
          size={triggerSize}
          type="button"
          variant={triggerVariant}
        >
          <Upload className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import data archive</DialogTitle>
          <DialogDescription>
            Upload a backup archive previously exported from a cms0 content runtime.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="import-data-file">Archive file</Label>
            <Input
              id="import-data-file"
              accept=".json,.zip,.tar,.gz,.sql,.dump"
              disabled={preflightMutation.isPending || importMutation.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setArchiveFile(file);
                setPreflight(null);
                setSkipMissingTables(false);
                if (file) {
                  preflightMutation.mutate(file);
                }
              }}
              type="file"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="import-data-reason">Reason</Label>
            <Input
              id="import-data-reason"
              disabled={importMutation.isPending}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Manual import"
              value={reason}
            />
          </div>

          {preflight ? (
            <div className="rounded-lg border p-4 text-sm">
              <div className="font-medium">Archive analysis</div>
              <div className="mt-2 space-y-1 text-muted-foreground">
                <p>Type: {preflight.archiveType}</p>
                <p>Tables: {preflight.tableCount}</p>
                <p>
                  Strict import: {preflight.canImportStrict ? "Available" : "Unavailable"}
                </p>
                <p>
                  Best-effort import:{" "}
                  {preflight.canImportBestEffort ? "Available" : "Unavailable"}
                </p>
              </div>
              {preflight.compatibilityWarnings.length ? (
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700">
                  <div className="mb-1 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Compatibility warnings
                  </div>
                  <ul className="list-disc pl-5">
                    {preflight.compatibilityWarnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {preflight.missingTables.length ? (
                <div className="mt-3 space-y-3 rounded-lg border p-3">
                  <div>
                    <div className="font-medium">Missing tables on this runtime</div>
                    <p className="text-muted-foreground">
                      {summarizeTableList(preflight.missingTables, 12)}
                    </p>
                  </div>
                  {preflight.canImportBestEffort ? (
                    <label className="flex items-start gap-3">
                      <Checkbox
                        checked={skipMissingTables}
                        onCheckedChange={(checked) => setSkipMissingTables(Boolean(checked))}
                      />
                      <span className="text-sm text-muted-foreground">
                        Continue with a best-effort import and skip tables that do not exist on
                        this runtime.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            disabled={importMutation.isPending}
            onClick={() => setOpen(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => importMutation.mutate()}
            type="button"
          >
            {importMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            Import archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
