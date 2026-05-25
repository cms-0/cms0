/**
 * Self-Hosted Auth Factory Preset
 *
 * Configuration preset for self-hosted CMS installations.
 * Simplified cookie settings, no cross-subdomain support.
 */

import { createAuthFactory, type Cms0Auth } from "./core";
import type { SelfHostedAuthOptions, BetterAuthDatabase } from "./types";

/**
 * Create auth instance for self-hosted environment
 */
export function createSelfHostedAuth(
  database: BetterAuthDatabase,
  options: SelfHostedAuthOptions,
): Cms0Auth {
  const { baseUrl } = options;

  // Self-hosted uses simple HTTPS check for cookie security
  const isSecure = baseUrl?.startsWith("https://") ?? false;

  return createAuthFactory(database, {
    ...options,
    // Self-hosted defaults
    enableCrossSubdomainCookies: false,
    session: {
      cookieCache: {
        enabled: false,
      },
    },
    cookieConfig: {
      secure: isSecure,
      httpOnly: true,
      sameSite: isSecure ? "none" : "lax",
    },
  });
}
