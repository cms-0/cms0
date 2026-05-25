"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

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
  disabled?: boolean;
  onImported?: () => Promise<void> | void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
};

const parseResponsePayload = async (response: Response): Promise<unknown> => {
  const raw = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return raw;
  }
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return raw;
  }
};

const extractErrorMessage = (payload: unknown, fallback: string): string => {
  if (!payload) return fallback;
  if (typeof payload === "string") return payload || fallback;
  if (typeof payload === "object" && payload !== null) {
    const source = payload as Record<string, unknown>;
    const nestedMessage =
      (typeof source.message === "string" && source.message) ||
      (typeof source.error === "string" && source.error) ||
      (typeof source.code === "string" && source.code);
    if (nestedMessage) return nestedMessage;
  }
  return fallback;
};

const summarizeTableList = (tableNames: string[], limit = 10): string => {
  if (!tableNames.length) return "";
  const preview = tableNames.slice(0, limit).join(", ");
  const suffix = tableNames.length > limit ? ` (+${tableNames.length - limit} more)` : "";
  return `${preview}${suffix}`;
};

export function ImportDataDialog({
  disabled = false,
  onImported,
  triggerClassName,
  triggerLabel = "Import data",
  triggerSize = "default",
  triggerVariant = "outline",
}: Readonly<ImportDataDialogProps>) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [archiveFile, setArchiveFile] = useState<File | null>(null);
  const [reason, setReason] = useState("");
  const [preflight, setPreflight] = useState<ImportPreflightResult | null>(null);
  const [skipMissingTables, setSkipMissingTables] = useState(false);

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
      const response = await fetch("/api/content/data-transfer/import/preflight", {
        method: "POST",
        body: form,
      });
      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(extractErrorMessage(payload, "Failed to analyze archive."));
      }
      return (payload ?? null) as ImportPreflightResult | null;
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
      const message =
        error instanceof Error ? error.message : "Failed to analyze archive.";
      toast.error(message);
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

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3 * 60 * 1000);
      let response: Response;
      try {
        response = await fetch("/api/content/data-transfer/import", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });
      } catch (error) {
        if ((error as { name?: string })?.name === "AbortError") {
          throw new Error("Import timed out. Please retry with a smaller archive.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeoutId);
      }

      const payload = await parseResponsePayload(response);
      if (!response.ok) {
        throw new Error(
          extractErrorMessage(payload, "Failed to import data archive."),
        );
      }
      return (payload ?? null) as ImportDataResult | null;
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
        queryClient.invalidateQueries({
          queryKey: ["admin-model-reference-options"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-schema-latest-snapshot"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-schema-latest-typescript"],
        }),
      ]);
      await onImported?.();
      setOpen(false);
      resetState();
      router.refresh();
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : "Failed to import data archive.";
      toast.error(message);
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import data archive</DialogTitle>
          <DialogDescription>
            Upload a full backup archive. This restores database state and creates a
            safety backup first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="data-archive-file">Archive file</Label>
            <Input
              accept=".json.gz,.gz,.json,.dump,.backup,application/octet-stream"
              id="data-archive-file"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setArchiveFile(selected);
                setPreflight(null);
                setSkipMissingTables(false);
                if (selected) {
                  preflightMutation.mutate(selected);
                }
              }}
              type="file"
            />
            <p className="text-xs text-muted-foreground">
              Expected format: archive downloaded from backups/data export.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="data-archive-reason">Reason (optional)</Label>
            <Input
              id="data-archive-reason"
              onChange={(event) => setReason(event.currentTarget.value)}
              placeholder="manual data import"
              value={reason}
            />
          </div>

          {preflightMutation.isPending ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Checking archive compatibility...
              </span>
            </div>
          ) : null}

          {preflight ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="font-medium">Archive preflight</div>
              <div className="text-muted-foreground">
                Type: {preflight.archiveType} | Tables: {preflight.tableCount}
              </div>
              {preflight.compatibilityWarnings.length ? (
                <div className="text-destructive">
                  {preflight.compatibilityWarnings.join(" ")}
                </div>
              ) : null}
              {preflight.missingTables.length ? (
                <div className="text-destructive">
                  Missing target tables: {summarizeTableList(preflight.missingTables)}
                </div>
              ) : null}
            </div>
          ) : null}

          {preflight?.missingTables.length && preflight.canImportBestEffort ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={skipMissingTables}
                onCheckedChange={(checked) => setSkipMissingTables(checked === true)}
              />
              <span>
                Best effort import: skip archive tables not present on this instance.
              </span>
            </label>
          ) : null}

          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
            <div className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4" />
              <span>
                Importing an archive will replace current database state from the
                uploaded archive.
              </span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={importMutation.isPending}
            onClick={() => {
              setOpen(false);
              resetState();
            }}
            type="button"
            variant="outline"
          >
            Cancel
          </Button>
          <Button
            disabled={!canSubmit}
            onClick={() => importMutation.mutate()}
            type="button"
            variant="destructive"
          >
            {importMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
