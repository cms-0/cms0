import "server-only";

import { createEmailService } from "@cms0/transactional";

import { resolveSelfHostedEmailServiceConfig } from "./config";

let cachedConfigKey: string | null = null;
let cachedService: ReturnType<typeof createEmailService> | null = null;

export const getSelfHostedEmailService = () => {
  const config = resolveSelfHostedEmailServiceConfig();
  const configKey = JSON.stringify(config);

  if (!cachedService || cachedConfigKey !== configKey) {
    cachedService = createEmailService(config);
    cachedConfigKey = configKey;
  }

  return cachedService;
};
