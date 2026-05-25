import { BackupsActions, BackupsManager } from "@cms0/ui";
import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";

import { listSelfHostedBackups } from "@/lib/backups";

export default async function Page() {
  const backups = await listSelfHostedBackups();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold">Backups</h1>
          <p className="text-sm text-muted-foreground">
            Automatic backups are created when published schema descriptors or
            data content changes. Only the latest 3 backups are retained.
          </p>
        </div>
        <BackupsActions
          adminBaseUrl={buildSelfHostedAdminBasePath()}
        />
      </div>

      <BackupsManager
        adminBaseUrl={buildSelfHostedAdminBasePath()}
        canDelete
        canRollback
        emptyMessage="Publish a descriptor to create the first restore point."
        initialBackups={backups}
      />
    </div>
  );
}
