"use client";

import * as React from "react";
import { Download, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

import {
  createAdminClient,
  useCreateAdminBackupMutation,
} from "@cms0/admin-client";

import { ApplyUploadsDialog } from "./apply-uploads-dialog";
import { Button } from "./button";
import { RestoreBackupDialog } from "./restore-backup-dialog";

type BackupsActionsProps = {
  adminBaseUrl: string;
  adminRoutePrefix?: string;
  canCreateBackup?: boolean;
  canManage?: boolean;
};

export function BackupsActions({
  adminBaseUrl,
  adminRoutePrefix,
  canCreateBackup = true,
  canManage = true,
}: Readonly<BackupsActionsProps>) {
  const client = React.useMemo(
    () =>
      createAdminClient({
        baseUrl: adminBaseUrl,
        routePrefix: adminRoutePrefix,
      }),
    [adminBaseUrl, adminRoutePrefix],
  );

  const manualBackupMutation = useCreateAdminBackupMutation({
    adminBaseUrl,
    adminRoutePrefix,
    onSuccess: async (backup) => {
      toast.success(`Created backup ${backup.id}.`);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Manual backup failed.",
      );
    },
  });

  const isBusy = manualBackupMutation.isPending;
  const canRunBackupNow = canManage && canCreateBackup && !isBusy;

  if (!canManage) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <ApplyUploadsDialog
        adminBaseUrl={adminBaseUrl}
        adminRoutePrefix={adminRoutePrefix}
        disabled={isBusy}
        triggerLabel="Apply uploads"
        triggerSize="sm"
      />
      <Button
        type="button"
        variant="outline"
        disabled={isBusy}
        onClick={() => {
          globalThis.location.assign(client.uploads.exportUrl());
        }}
      >
        <Download className="h-4 w-4" />
        Download uploads
      </Button>
      <RestoreBackupDialog
        adminBaseUrl={adminBaseUrl}
        adminRoutePrefix={adminRoutePrefix}
        disabled={isBusy}
        triggerSize="sm"
      />
      <Button
        type="button"
        variant="outline"
        disabled={!canRunBackupNow}
        title={
          canCreateBackup
            ? undefined
            : "Publish a schema snapshot before creating a backup."
        }
        onClick={() => manualBackupMutation.mutate({ reason: "manual" })}
      >
        {manualBackupMutation.isPending ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : null}
        Backup now
      </Button>
    </div>
  );
}
