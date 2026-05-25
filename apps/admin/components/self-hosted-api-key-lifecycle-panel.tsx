"use client";

import { useRouter } from "next/navigation";
import type { AdminApiKeyRecord } from "@cms0/admin-contract";
import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";
import { ApiKeyLifecyclePanel } from "@cms0/ui";

export function SelfHostedApiKeyLifecyclePanel({
  apiKey,
  canDelete,
  canUpdate,
  defaultPermissions,
}: Readonly<{
  apiKey: AdminApiKeyRecord;
  canDelete?: boolean;
  canUpdate?: boolean;
  defaultPermissions: Record<string, readonly string[]>;
}>) {
  const router = useRouter();

  return (
    <ApiKeyLifecyclePanel
      adminBaseUrl={`${buildSelfHostedAdminBasePath()}/content`}
      apiKey={apiKey}
      canDelete={canDelete}
      canUpdate={canUpdate}
      defaultPermissions={defaultPermissions}
      onSuccess={() => router.refresh()}
    />
  );
}
