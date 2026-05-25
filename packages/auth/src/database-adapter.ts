/**
 * Auth Database Adapter Factory
 *
 * Shared Drizzle adapter factory for better-auth database connections.
 * Supports both connection string and existing pool configurations.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { BetterAuthOptions } from "better-auth";
import type { DBAdapter } from "better-auth/adapters";
import { Pool } from "pg";

/**
 * Configuration for creating auth database adapter
 */
export type AuthDatabaseConfig =
  | {
      /** PostgreSQL connection string */
      connectionString: string;
      /** Optional pool configuration */
      poolConfig?: Omit<ConstructorParameters<typeof Pool>[0], "connectionString">;
    }
  | {
      /** Existing pg.Pool instance */
      pool: Pool;
    };

/**
 * Create a Drizzle database adapter for better-auth
 *
 * @param config - Database connection configuration
 * @param schema - Drizzle schema object containing auth tables
 * @returns BetterAuth database adapter
 *
 * @example
 * ```typescript
 * import * as authSchema from "./auth-schema";
 *
 * const adapter = createAuthDatabaseAdapter(
 *   { connectionString: process.env.DATABASE_URL! },
 *   authSchema
 * );
 * ```
 */
export function createAuthDatabaseAdapter(
  config: AuthDatabaseConfig,
  schema: Record<string, unknown>,
): (options: BetterAuthOptions) => DBAdapter<BetterAuthOptions> {
  return drizzleAdapter(getAuthDatabase(config), {
    provider: "pg",
    schema,
  });
}

/**
 * Get or create Drizzle database instance
 * Uses singleton pattern to reuse pool across requests
 */
function getAuthDatabase(
  config: AuthDatabaseConfig,
): ReturnType<typeof drizzle> {
  // For pool-based config, create drizzle directly
  if ("pool" in config) {
    return drizzle(config.pool);
  }

  // For connection string config, manage pool internally
  const { connectionString, poolConfig } = config;

  // Use module-level singleton for pool
  const db = drizzleSingleton(connectionString, poolConfig);
  return db;
}

// Module-level singletons for connection-string based configs
const poolCache = new Map<string, Pool>();
const dbCache = new Map<string, ReturnType<typeof drizzle>>();

function drizzleSingleton(
  connectionString: string,
  poolConfig?: Omit<ConstructorParameters<typeof Pool>[0], "connectionString">,
): ReturnType<typeof drizzle> {
  const cacheKey = connectionString;

  // Return cached instance if exists
  const cached = dbCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Get or create pool
  let pool = poolCache.get(cacheKey);
  if (!pool) {
    pool = new Pool({
      connectionString,
      ...poolConfig,
    });
    poolCache.set(cacheKey, pool);
  }

  // Create drizzle instance
  const db = drizzle(pool);
  dbCache.set(cacheKey, db);

  return db;
}

/**
 * Clear database cache (useful for testing)
 */
export function clearAuthDatabaseCache(): void {
  for (const pool of poolCache.values()) {
    pool.end();
  }
  poolCache.clear();
  dbCache.clear();
}
