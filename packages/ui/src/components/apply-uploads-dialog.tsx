"use client";

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  buildAdminBackupsQueryKey,
  createAdminClient,
} from "@cms0/admin-client";

import { Button } from "./button";
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

type ApplyUploadsDialogProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  disabled?: boolean;
  onApplied?: () => Promise<void> | void;
  triggerClassName?: string;
  triggerLabel?: string;
  triggerSize?: React.ComponentProps<typeof Button>["size"];
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

const summarizePaths = (paths: string[], limit = 8) => {
  if (!paths.length) return "";
  const preview = paths.slice(0, limit).join(", ");
  const suffix = paths.length > limit ? ` (+${paths.length - limit} more)` : "";
  return `${preview}${suffix}`;
};

export function ApplyUploadsDialog({
  adminBaseUrl,
  adminRoutePrefix,
  disabled = false,
  onApplied,
  triggerClassName,
  triggerLabel = "Apply uploads",
  triggerSize = "default",
  triggerVariant = "outline",
}: Readonly<ApplyUploadsDialogProps>) {
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
  const [preflight, setPreflight] = React.useState<import("@cms0/admin-contract").UploadsTransferPreflightResponse | null>(
    null,
  );

  const resetForm = React.useCallback(() => {
    setArchiveFile(null);
    setPreflight(null);
  }, []);

  const preflightMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("archive", file);
      return client.uploads.importPreflight(form);
    },
    onSuccess: (result) => {
      setPreflight(result);
      if (result.toSkipConflict > 0) {
        toast.warning(
          `Some files will be skipped due to name/size conflict: ${summarizePaths(
            result.conflicts,
          )}`,
        );
      }
    },
    onError: (error) => {
      setPreflight(null);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to analyze uploads archive.",
      );
    },
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      if (!archiveFile) {
        throw new Error("Please select an uploads archive.");
      }
      const form = new FormData();
      form.append("archive", archiveFile);
      return client.uploads.applyArchive(form);
    },
    onSuccess: async (result) => {
      if (result.toSkipConflict > 0) {
        toast.warning(
          `Uploads applied with conflicts. Created ${result.toCreate}, replaced ${result.toReplace}, conflicts ${result.toSkipConflict}.`,
        );
      } else {
        toast.success(
          `Uploads applied. Created ${result.toCreate}, replaced ${result.toReplace}.`,
        );
      }
      await queryClient.invalidateQueries({
        queryKey: buildAdminBackupsQueryKey(adminBaseUrl),
      });
      await onApplied?.();
      setOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to apply uploads package.",
      );
    },
  });

  const canSubmit =
    Boolean(archiveFile) &&
    Boolean(preflight) &&
    !preflightMutation.isPending &&
    !applyMutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen && !applyMutation.isPending) {
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
          <DialogTitle>Apply uploads</DialogTitle>
          <DialogDescription>
            Upload a previously downloaded uploads package to restore files into
            storage.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="apply-uploads-archive-file">Archive file</Label>
            <Input
              id="apply-uploads-archive-file"
              type="file"
              accept=".tar.gz,.tgz,.gz,application/octet-stream"
              onChange={(event) => {
                const selected = event.currentTarget.files?.[0] ?? null;
                setArchiveFile(selected);
                setPreflight(null);
                if (selected) {
                  preflightMutation.mutate(selected);
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Expected format: uploads package downloaded from this page.
            </p>
          </div>

          {preflightMutation.isPending ? (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Checking uploads package...
              </span>
            </div>
          ) : null}

          {preflight ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <div className="font-medium">Preflight summary</div>
              <div className="text-muted-foreground">
                Files: {preflight.fileCount} | Size:{" "}
                {formatBytes(preflight.totalBytes)}
              </div>
              <div>Create: {preflight.toCreate}</div>
              <div>Replace: {preflight.toReplace}</div>
              <div>Conflict skip: {preflight.toSkipConflict}</div>
              <div>Excluded skip: {preflight.toSkipExcluded}</div>
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
            disabled={applyMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => applyMutation.mutate()}
          >
            {applyMutation.isPending ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : null}
            Apply uploads
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
