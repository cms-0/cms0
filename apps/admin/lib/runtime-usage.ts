import "server-only";

import { headers } from "next/headers";

import type { AdminServerUsageSummary } from "@cms0/admin-server";
import { listOrganizationApiKeys } from "@cms0/auth";

import { getSelfHostedAdminServer } from "./admin-server";
import { auth } from "./auth/auth";

export type SelfHostedUsageView = {
  apiKeyCount: number;
  billingWindowLabel: string;
  content: AdminServerUsageSummary["content"];
  metrics: AdminServerUsageSummary["month"]["metrics"];
  schema: AdminServerUsageSummary["schema"];
  storage: AdminServerUsageSummary["storage"];
};

export const getSelfHostedUsageView = async (): Promise<SelfHostedUsageView> => {
  const runtimeUsage = await getSelfHostedAdminServer().getUsageSummary();
  const apiKeys = await listOrganizationApiKeys(
    auth,
    await headers(),
    "self-hosted",
  );

  return {
    apiKeyCount: apiKeys.length,
    billingWindowLabel: runtimeUsage.month.label,
    content: runtimeUsage.content,
    metrics: runtimeUsage.month.metrics,
    schema: runtimeUsage.schema,
    storage: runtimeUsage.storage,
  };
};
