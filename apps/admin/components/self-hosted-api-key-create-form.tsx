"use client";

import { buildSelfHostedAdminBasePath } from "@cms0/admin-client";
import { apiKeyDefaultPermissions } from "@cms0/auth/permissions";
import { ApiKeyCreateForm } from "@cms0/ui";

export function SelfHostedApiKeyCreateForm() {
  return (
    <ApiKeyCreateForm
      adminBaseUrl={`${buildSelfHostedAdminBasePath()}/content`}
      defaultPermissions={apiKeyDefaultPermissions}
    />
  );
}
