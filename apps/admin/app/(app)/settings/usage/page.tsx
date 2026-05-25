import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@cms0/ui";

import { formatBytes } from "@/lib/schema-view";
import { getSelfHostedUsageView } from "@/lib/runtime-usage";

const formatNumber = (value: number) =>
  new Intl.NumberFormat("en-US").format(value);

function SummaryCard({
  subtitle,
  title,
  value,
}: Readonly<{ subtitle: string; title: string; value: string }>) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </CardContent>
    </Card>
  );
}

export default async function Page() {
  const usage = await getSelfHostedUsageView();
  const bandwidthBytes = usage.metrics.bytesIn + usage.metrics.bytesOut;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold">Runtime usage</h1>
        <p className="text-sm text-muted-foreground">
          Monthly traffic with current self-hosted runtime storage.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          title="API calls"
          value={formatNumber(usage.metrics.apiCalls)}
          subtitle="Runtime requests this month"
        />
        <SummaryCard
          title="Bandwidth"
          value={formatBytes(bandwidthBytes)}
          subtitle="Inbound + outbound payloads"
        />
        <SummaryCard
          title="Storage"
          value={formatBytes(usage.storage.totalBytes)}
          subtitle="Current runtime storage"
        />
        <SummaryCard
          title="Content entries"
          value={formatNumber(usage.content.collectionEntryCount)}
          subtitle="Persisted collection rows"
        />
      </div>
    </div>
  );
}
