import pg from "pg";
import type {
  AdminRequestInput,
  AdminResponse,
  AdminUsageSurface,
} from "@cms0/admin-contract";
import type { AdminServerUsageMetrics } from "./admin-server/types";

const DEFAULT_USAGE_MONTH: AdminServerUsageMetrics = {
  apiCalls: 0,
  bytesIn: 0,
  bytesOut: 0,
  contentReads: 0,
  contentWrites: 0,
  lastMutationAt: null,
  lastRequestAt: null,
  readCalls: 0,
  schemaPublishes: 0,
  writeCalls: 0,
};

function getMonthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function measureJsonBytes(value: unknown) {
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return 0;
  }
}

export type UsageTracker = {
  record(
    request: AdminRequestInput,
    response: AdminResponse,
    environmentKey: string,
  ): Promise<void>;
  getMonth(
    environmentKey: string,
    monthKey: string,
  ): Promise<UsageTrackerMonth>;
};

export type UsageTrackerMonth = {
  controlMetrics: AdminServerUsageMetrics;
  metrics: AdminServerUsageMetrics;
  publicMetrics: AdminServerUsageMetrics;
  totalMetrics: AdminServerUsageMetrics;
};

function isReadMethod(method: AdminRequestInput["method"]) {
  return method === "GET";
}

function toUsageMetrics(row: Record<string, unknown> | undefined | null, prefix = "") {
  return {
    apiCalls: Number(row?.[`${prefix}api_calls`] ?? 0),
    bytesIn: Number(row?.[`${prefix}bytes_in`] ?? 0),
    bytesOut: Number(row?.[`${prefix}bytes_out`] ?? 0),
    contentReads: Number(row?.[`${prefix}content_reads`] ?? 0),
    contentWrites: Number(row?.[`${prefix}content_writes`] ?? 0),
    lastMutationAt: (row?.[`${prefix}last_mutation_at`] as string | null) ?? null,
    lastRequestAt: (row?.[`${prefix}last_request_at`] as string | null) ?? null,
    readCalls: Number(row?.[`${prefix}read_calls`] ?? 0),
    schemaPublishes: Number(row?.[`${prefix}schema_publishes`] ?? 0),
    writeCalls: Number(row?.[`${prefix}write_calls`] ?? 0),
  } satisfies AdminServerUsageMetrics;
}

function latestTimestamp(...values: Array<string | null>) {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    if (!latest) return value;
    return value > latest ? value : latest;
  }, null);
}

function combineUsageMetrics(
  publicMetrics: AdminServerUsageMetrics,
  controlMetrics: AdminServerUsageMetrics,
): AdminServerUsageMetrics {
  return {
    apiCalls: publicMetrics.apiCalls + controlMetrics.apiCalls,
    bytesIn: publicMetrics.bytesIn + controlMetrics.bytesIn,
    bytesOut: publicMetrics.bytesOut + controlMetrics.bytesOut,
    contentReads: publicMetrics.contentReads + controlMetrics.contentReads,
    contentWrites: publicMetrics.contentWrites + controlMetrics.contentWrites,
    lastMutationAt: latestTimestamp(
      publicMetrics.lastMutationAt,
      controlMetrics.lastMutationAt,
    ),
    lastRequestAt: latestTimestamp(
      publicMetrics.lastRequestAt,
      controlMetrics.lastRequestAt,
    ),
    readCalls: publicMetrics.readCalls + controlMetrics.readCalls,
    schemaPublishes:
      publicMetrics.schemaPublishes + controlMetrics.schemaPublishes,
    writeCalls: publicMetrics.writeCalls + controlMetrics.writeCalls,
  };
}

function getUsageTableName(surface: AdminUsageSurface) {
  return surface === "control" ? "usage_control_months" : "usage_months";
}

export function createDbUsageTracker(
  pool: pg.Pool,
  options: {
    surface?: AdminUsageSurface;
  } = {},
) {
  const surface = options.surface ?? "public";
  const tableName = getUsageTableName(surface);

  return {
    async record(
      request: AdminRequestInput,
      response: AdminResponse,
      environmentKey: string,
    ): Promise<void> {
      const now = new Date();
      const monthKey = getMonthKey(now);
      const routeRoot = request.segments[0] ?? "";
      const isContentRoute = routeRoot === "content";
      const isSchemaPublishRoute =
        routeRoot === "schema" &&
        request.method === "POST" &&
        request.segments.length === 1;

      const bytesIn = measureJsonBytes(request.body);
      const bytesOut = measureJsonBytes(response.body);

      const readCalls = isReadMethod(request.method) ? 1 : 0;
      const writeCalls = isReadMethod(request.method) ? 0 : 1;
      const contentReads =
        isReadMethod(request.method) && isContentRoute ? 1 : 0;
      const contentWrites =
        !isReadMethod(request.method) && isContentRoute ? 1 : 0;
      const schemaPublishes =
        isSchemaPublishRoute && response.status < 500 ? 1 : 0;
      const lastRequestAt = now.toISOString();
      const lastMutationAt =
        !isReadMethod(request.method) && response.status < 500
          ? lastRequestAt
          : null;

      await pool.query(
        `
        INSERT INTO ${tableName} (
          environment_key, month_key, api_calls, read_calls, write_calls,
          content_reads, content_writes, schema_publishes, bytes_in, bytes_out,
          last_request_at, last_mutation_at
        ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (environment_key, month_key) DO UPDATE SET
          api_calls = ${tableName}.api_calls + 1,
          read_calls = ${tableName}.read_calls + $3,
          write_calls = ${tableName}.write_calls + $4,
          content_reads = ${tableName}.content_reads + $5,
          content_writes = ${tableName}.content_writes + $6,
          schema_publishes = ${tableName}.schema_publishes + $7,
          bytes_in = ${tableName}.bytes_in + $8,
          bytes_out = ${tableName}.bytes_out + $9,
          last_request_at = $10,
          last_mutation_at = COALESCE($11, ${tableName}.last_mutation_at)
        `,
        [
          environmentKey,
          monthKey,
          readCalls,
          writeCalls,
          contentReads,
          contentWrites,
          schemaPublishes,
          bytesIn,
          bytesOut,
          lastRequestAt,
          lastMutationAt,
        ],
      );
    },

    async getMonth(
      environmentKey: string,
      monthKey: string,
    ): Promise<UsageTrackerMonth> {
      const result = await pool.query(
        `
        SELECT
          public.api_calls AS public_api_calls,
          public.read_calls AS public_read_calls,
          public.write_calls AS public_write_calls,
          public.content_reads AS public_content_reads,
          public.content_writes AS public_content_writes,
          public.schema_publishes AS public_schema_publishes,
          public.bytes_in AS public_bytes_in,
          public.bytes_out AS public_bytes_out,
          public.last_request_at AS public_last_request_at,
          public.last_mutation_at AS public_last_mutation_at,
          control.api_calls AS control_api_calls,
          control.read_calls AS control_read_calls,
          control.write_calls AS control_write_calls,
          control.content_reads AS control_content_reads,
          control.content_writes AS control_content_writes,
          control.schema_publishes AS control_schema_publishes,
          control.bytes_in AS control_bytes_in,
          control.bytes_out AS control_bytes_out,
          control.last_request_at AS control_last_request_at,
          control.last_mutation_at AS control_last_mutation_at
        FROM (SELECT 1) AS singleton
        LEFT JOIN usage_months AS public
          ON public.environment_key = $1 AND public.month_key = $2
        LEFT JOIN usage_control_months AS control
          ON control.environment_key = $1 AND control.month_key = $2
        `,
        [environmentKey, monthKey],
      );
      const row = result.rows[0];
      const publicMetrics = row
        ? toUsageMetrics(row, "public_")
        : { ...DEFAULT_USAGE_MONTH };
      const controlMetrics = row
        ? toUsageMetrics(row, "control_")
        : { ...DEFAULT_USAGE_MONTH };
      const totalMetrics = combineUsageMetrics(publicMetrics, controlMetrics);

      return {
        controlMetrics,
        metrics: publicMetrics,
        publicMetrics,
        totalMetrics,
      };
    },
  };
}
