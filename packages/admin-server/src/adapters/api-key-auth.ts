/**
 * API Key Auth Adapter
 *
 * Shared ApiKeyAuthAdapter implementation for both self-hosted and hosted apps.
 */

import type { ApiKeyAuthAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import { getAuthInstance } from "./types";
import {
  createOrganizationApiKey,
  listOrganizationApiKeys,
  revokeOrganizationApiKey,
  updateOrganizationApiKey,
} from "@cms0/auth";

/**
 * Create an API key auth adapter
 */
export function createApiKeyAuthAdapter(
  config: AdapterConfig,
): ApiKeyAuthAdapter {
  const { auth } = config;

  return {
    async create(headers, input, environmentKey, context) {
      const authInstance = await getAuthInstance(auth);
      const created = await createOrganizationApiKey(
        authInstance,
        headers,
        input,
        environmentKey,
        context,
      );
      return created;
    },

    async update(headers, keyId, input, environmentKey, context) {
      const authInstance = await getAuthInstance(auth);
      return updateOrganizationApiKey(
        authInstance,
        headers,
        keyId,
        input,
        environmentKey,
        context,
      ) as any;
    },

    async revoke(headers, keyId, environmentKey, context) {
      const authInstance = await getAuthInstance(auth);
      return revokeOrganizationApiKey(
        authInstance,
        headers,
        keyId,
        environmentKey,
        context,
      ) as any;
    },

    async list(headers, environmentKey, context) {
      const authInstance = await getAuthInstance(auth);
      return listOrganizationApiKeys(
        authInstance,
        headers,
        environmentKey,
        context,
      ) as any;
    },
  };
}
