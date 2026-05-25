import { notFound } from "next/navigation";
import { headers } from "next/headers";

import { getOrganizationApiKey, getOrganizationApiKeyAccess } from "@cms0/auth";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cms0/ui";
import { apiKeyDefaultPermissions } from "@cms0/auth/permissions";

import { auth } from "@/lib/auth/auth";
import { SelfHostedApiKeyLifecyclePanel } from "@/components/self-hosted-api-key-lifecycle-panel";

type PageProps = {
  params: Promise<{
    keyId: string;
  }>;
};

const formatDate = (value: string | Date | null | undefined) => {
  if (!value) return "Never";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
};

export default async function Page({ params }: PageProps) {
  const { keyId } = await params;
  const requestHeaders = await headers();
  const access = await getOrganizationApiKeyAccess(auth, requestHeaders);
  if (!access.canRead) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          You do not have permission to view API key details.
        </div>
      </div>
    );
  }
  const key = await getOrganizationApiKey(
    auth,
    requestHeaders,
    keyId,
    "self-hosted",
  );

  if (!key) {
    notFound();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Edit API key</h1>
          <p className="text-sm text-muted-foreground">
            Update name, expiration, and status.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/settings/api-keys">Back to keys</a>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Key details</CardTitle>
          <CardDescription>Reference information for this key.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground">
          <div>
            <span className="text-foreground font-medium">Expires:</span>{" "}
            {formatDate(key.expiresAt)}
          </div>
        </CardContent>
      </Card>

      <SelfHostedApiKeyLifecyclePanel
        apiKey={key}
        canDelete={access.canDelete}
        canUpdate={access.canUpdate}
        defaultPermissions={apiKeyDefaultPermissions}
      />
    </div>
  );
}
