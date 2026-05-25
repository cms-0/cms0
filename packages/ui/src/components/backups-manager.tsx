"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  createAdminClient,
  useAdminBackupsQuery,
  useDeleteAdminBackupMutation,
  useRestoreAdminBackupMutation,
} from "@cms0/admin-client";
import type { RuntimeBackupRecord } from "@cms0/admin-contract";
import { Button } from "./button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import {
  Download,
  FileCode2,
  FileJson,
  LoaderCircle,
  RotateCcw,
  Trash2,
} from "lucide-react";

type BackupsManagerProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  canDelete?: boolean;
  canRollback?: boolean;
  emptyMessage: string;
  initialBackups: RuntimeBackupRecord[];
};

const formatBytes = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 ** 2) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 ** 2).toFixed(1)} MB`;
};

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

export function BackupsManager({
  adminBaseUrl,
  adminRoutePrefix,
  canDelete = true,
  canRollback = true,
  emptyMessage,
  initialBackups,
}: Readonly<BackupsManagerProps>) {
  const client = React.useMemo(
    () =>
      createAdminClient({
        baseUrl: adminBaseUrl,
        routePrefix: adminRoutePrefix,
      }),
    [adminBaseUrl, adminRoutePrefix],
  );

  const backupsQuery = useAdminBackupsQuery({
    adminBaseUrl,
    adminRoutePrefix,
    initialData: initialBackups,
  });

  const restoreMutation = useRestoreAdminBackupMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Rollback failed.",
      );
    },
    onSuccess: (backup) => {
      toast.success(`Rollback started for backup ${backup.id}.`);
      globalThis.location.reload();
    },
  });

  const deleteMutation = useDeleteAdminBackupMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Delete failed.",
      );
    },
    onSuccess: async () => {
      toast.success("Backup deleted.");
    },
  });

  const backups = backupsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema &amp; Data Backups</CardTitle>
        <CardDescription>
          Rollback restores both descriptor and content data for the selected
          backup.
        </CardDescription>
      </CardHeader>
      <CardContent className="w-full overflow-x-auto">
        <Table data-testid="backups-table">
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tables</TableHead>
              <TableHead>Size</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {backupsQuery.status === "pending" ? (
              <TableRow>
                <TableCell colSpan={6}>Loading backups...</TableCell>
              </TableRow>
            ) : backups.length ? (
              backups.map((backup) => {
                const isRestoring =
                  restoreMutation.isPending &&
                  restoreMutation.variables === backup.id;
                const isDeleting =
                  deleteMutation.isPending &&
                  deleteMutation.variables === backup.id;

                return (
                  <TableRow key={backup.id}>
                    <TableCell>{formatDate(backup.createdAt)}</TableCell>
                    <TableCell>{backup.reason}</TableCell>
                    <TableCell>{backup.status}</TableCell>
                    <TableCell>{backup.tableCount}</TableCell>
                    <TableCell>{formatBytes(backup.sizeBytes)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            globalThis.location.assign(
                              client.backups.descriptorUrl(backup.id),
                            )
                          }
                        >
                          <FileJson className="size-4" />
                          Descriptor
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            globalThis.location.assign(
                              client.backups.archiveUrl(backup.id),
                            )
                          }
                        >
                          <Download className="size-4" />
                          Archive
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            globalThis.location.assign(
                              client.backups.typescriptUrl(backup.id),
                            )
                          }
                        >
                          <FileCode2 className="size-4" />
                          TS
                        </Button>
                        {canRollback ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={
                              restoreMutation.isPending ||
                              deleteMutation.isPending
                            }
                            onClick={() => {
                              const confirmed = globalThis.confirm(
                                "Rollback this backup? A safety backup of current state will be created before restore.",
                              );
                              if (!confirmed) return;
                              restoreMutation.mutate(backup.id);
                            }}
                          >
                            {isRestoring ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                            Rollback
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={
                              restoreMutation.isPending ||
                              deleteMutation.isPending
                            }
                            onClick={() => {
                              const confirmed = globalThis.confirm(
                                "Delete this backup permanently?",
                              );
                              if (!confirmed) return;
                              deleteMutation.mutate(backup.id);
                            }}
                          >
                            {isDeleting ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : (
                              <Trash2 className="size-4" />
                            )}
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={6}>{emptyMessage}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
