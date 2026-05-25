/**
 * Admin Server Configuration
 *
 * Global state and configuration management.
 */

import type { AdminServerConfig, AdminServerTarget } from "./types";
import type { AdminUsageSurface } from "@cms0/admin-contract";

type LockState<T = unknown> = {
  tail: Promise<T>;
  token: symbol;
};

const environmentLocks = new Map<string, LockState>();

let config: AdminServerConfig = {
  resolveBinding: async () => {
    throw new Error(
      "Admin server bindings are not configured. Call configureAdminServer first.",
    );
  },
};

export function configureAdminServer(input: Partial<AdminServerConfig>): void {
  config = {
    ...config,
    ...input,
  };
}

export function getAdminServerConfig(): AdminServerConfig {
  return config;
}

export function resolveBinding(target: AdminServerTarget) {
  return config.resolveBinding(target);
}

export async function runEnvironmentOperationExclusive<T>(
  environmentKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  const token = Symbol();
  const previous = environmentLocks.get(environmentKey);

  const tail = (async () => {
    if (previous) {
      try {
        await previous.tail;
      } catch {
        // Ignore previous operation errors
      }
    }
    return operation();
  })();

  environmentLocks.set(environmentKey, { tail, token });

  try {
    const result = await tail;
    const current = environmentLocks.get(environmentKey);
    if (current?.token === token) {
      environmentLocks.delete(environmentKey);
    }
    return result;
  } catch (error) {
    const current = environmentLocks.get(environmentKey);
    if (current?.token === token) {
      environmentLocks.delete(environmentKey);
    }
    throw error;
  }
}

export function normalizeServerTarget(
  input:
    | string
    | {
        descriptorVersion?: string;
        environmentKey: string;
        organizationId?: string;
        surface?: AdminUsageSurface;
      },
): AdminServerTarget {
  return {
    descriptorVersion:
      typeof input === "string" ? undefined : input.descriptorVersion,
    environmentKey: typeof input === "string" ? input : input.environmentKey,
    organizationId: typeof input === "string" ? undefined : input.organizationId,
    surface: typeof input === "string" ? undefined : input.surface,
  };
}
