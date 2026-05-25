import "server-only";

import type { StorageProviderConfig } from "@cms0/shared";
import { getSelfHostedStorageProviderConfig } from "@/lib/env";

export const resolveSelfHostedStorageProviderConfig = (): StorageProviderConfig => {
  return getSelfHostedStorageProviderConfig();
};
