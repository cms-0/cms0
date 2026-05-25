import { headers } from "next/headers";
import { getOrganizationApiKeyAccess } from "@cms0/auth";
import { Button } from "@cms0/ui";

import { SelfHostedApiKeyCreateForm } from "@/components/self-hosted-api-key-create-form";
import { auth } from "@/lib/auth/auth";

export default async function Page() {
  const access = await getOrganizationApiKeyAccess(auth, await headers());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Create API key</h1>
          <p className="text-sm text-muted-foreground">
            Generate a key for API access. You will only see the full key once.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/settings/api-keys">Back to keys</a>
        </Button>
      </div>

      {access.canCreate ? (
        <SelfHostedApiKeyCreateForm />
      ) : (
        <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
          You don&apos;t have permission to create API keys.
        </div>
      )}
    </div>
  );
}
