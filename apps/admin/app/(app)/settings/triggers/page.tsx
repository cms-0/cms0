import { ManualTriggerManager } from "@cms0/ui";
import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";

import { getSelfHostedSchemaSnapshot } from "@/lib/admin-server";
import { readSchemaCollectionEntries } from "@/lib/schema-view";
import {
  listSelfHostedManualTriggerRuns,
  listSelfHostedManualTriggers,
} from "@/lib/manual-triggers";

export default async function Page() {
  const snapshot = await getSelfHostedSchemaSnapshot();
  const [triggers, runs] = await Promise.all([
    listSelfHostedManualTriggers(),
    listSelfHostedManualTriggerRuns({ limit: 30 }),
  ]);
  const roots = readSchemaCollectionEntries(snapshot, "roots").map(
    (entry) => entry.name,
  );
  const models = readSchemaCollectionEntries(snapshot, "models").map(
    (entry) => entry.name,
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Triggers</h1>
        <p className="text-sm text-muted-foreground">
          Create manual triggers, run them on demand, and inspect execution
          history.
        </p>
      </div>

      <ManualTriggerManager
        adminBaseUrl={buildSelfHostedAdminBasePath()}
        availableModels={models}
        availableRoots={roots}
        initialRuns={runs}
        initialTriggers={triggers}
      />
    </div>
  );
}
