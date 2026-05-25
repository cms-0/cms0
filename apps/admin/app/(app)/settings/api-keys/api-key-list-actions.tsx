"use client";

import { useRouter } from "next/navigation";
import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";
import { ApiKeyListActions as SharedApiKeyListActions } from "@cms0/ui";

export function ApiKeyListActions({
  canDelete,
  canUpdate,
  keyId,
}: Readonly<{
  canDelete?: boolean;
  canUpdate?: boolean;
  keyId: string;
}>) {
  const router = useRouter();

  return (
    <SharedApiKeyListActions
      adminBaseUrl={`${buildSelfHostedAdminBasePath()}/content`}
      canDelete={canDelete}
      canUpdate={canUpdate}
      detailHref={`/settings/api-keys/${keyId}`}
      keyId={keyId}
      onRevokedSuccess={() => router.refresh()}
    />
  );
}
