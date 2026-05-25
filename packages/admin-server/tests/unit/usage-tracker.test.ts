import assert from "node:assert/strict";
import { test } from "vitest";

import { createDbUsageTracker } from "../../src/usage-tracker.js";

type UsageRow = {
  api_calls: number;
  bytes_in: number;
  bytes_out: number;
  content_reads: number;
  content_writes: number;
  last_mutation_at: string | null;
  last_request_at: string | null;
  read_calls: number;
  schema_publishes: number;
  write_calls: number;
};

function createEmptyRow(): UsageRow {
  return {
    api_calls: 0,
    bytes_in: 0,
    bytes_out: 0,
    content_reads: 0,
    content_writes: 0,
    last_mutation_at: null,
    last_request_at: null,
    read_calls: 0,
    schema_publishes: 0,
    write_calls: 0,
  };
}

function createMockPool() {
  const publicRows = new Map<string, UsageRow>();
  const controlRows = new Map<string, UsageRow>();

  return {
    query: async (text: string, values: unknown[]) => {
      if (text.includes("INSERT INTO usage_months")) {
        const key = `${values[0]}:${values[1]}`;
        const row = publicRows.get(key) ?? createEmptyRow();
        row.api_calls += 1;
        row.read_calls += Number(values[2] ?? 0);
        row.write_calls += Number(values[3] ?? 0);
        row.content_reads += Number(values[4] ?? 0);
        row.content_writes += Number(values[5] ?? 0);
        row.schema_publishes += Number(values[6] ?? 0);
        row.bytes_in += Number(values[7] ?? 0);
        row.bytes_out += Number(values[8] ?? 0);
        row.last_request_at = (values[9] as string | null) ?? null;
        row.last_mutation_at =
          (values[10] as string | null) ?? row.last_mutation_at;
        publicRows.set(key, row);
        return { rows: [] };
      }

      if (text.includes("INSERT INTO usage_control_months")) {
        const key = `${values[0]}:${values[1]}`;
        const row = controlRows.get(key) ?? createEmptyRow();
        row.api_calls += 1;
        row.read_calls += Number(values[2] ?? 0);
        row.write_calls += Number(values[3] ?? 0);
        row.content_reads += Number(values[4] ?? 0);
        row.content_writes += Number(values[5] ?? 0);
        row.schema_publishes += Number(values[6] ?? 0);
        row.bytes_in += Number(values[7] ?? 0);
        row.bytes_out += Number(values[8] ?? 0);
        row.last_request_at = (values[9] as string | null) ?? null;
        row.last_mutation_at =
          (values[10] as string | null) ?? row.last_mutation_at;
        controlRows.set(key, row);
        return { rows: [] };
      }

      if (text.includes("LEFT JOIN usage_months AS public")) {
        const key = `${values[0]}:${values[1]}`;
        const publicRow = publicRows.get(key);
        const controlRow = controlRows.get(key);

        if (!publicRow && !controlRow) {
          return { rows: [] };
        }

        return {
          rows: [
            {
              public_api_calls: publicRow?.api_calls ?? 0,
              public_bytes_in: publicRow?.bytes_in ?? 0,
              public_bytes_out: publicRow?.bytes_out ?? 0,
              public_content_reads: publicRow?.content_reads ?? 0,
              public_content_writes: publicRow?.content_writes ?? 0,
              public_last_mutation_at: publicRow?.last_mutation_at ?? null,
              public_last_request_at: publicRow?.last_request_at ?? null,
              public_read_calls: publicRow?.read_calls ?? 0,
              public_schema_publishes: publicRow?.schema_publishes ?? 0,
              public_write_calls: publicRow?.write_calls ?? 0,
              control_api_calls: controlRow?.api_calls ?? 0,
              control_bytes_in: controlRow?.bytes_in ?? 0,
              control_bytes_out: controlRow?.bytes_out ?? 0,
              control_content_reads: controlRow?.content_reads ?? 0,
              control_content_writes: controlRow?.content_writes ?? 0,
              control_last_mutation_at: controlRow?.last_mutation_at ?? null,
              control_last_request_at: controlRow?.last_request_at ?? null,
              control_read_calls: controlRow?.read_calls ?? 0,
              control_schema_publishes: controlRow?.schema_publishes ?? 0,
              control_write_calls: controlRow?.write_calls ?? 0,
            },
          ],
        };
      }

      throw new Error(`Unexpected query: ${text}`);
    },
  };
}

test("public usage stays in billable counters only", async () => {
  const pool = createMockPool();
  const tracker = createDbUsageTracker(pool as never, { surface: "public" });

  await tracker.record(
    {
      body: { hello: "world" },
      headers: new Headers(),
      method: "GET",
      searchParams: new URLSearchParams(),
      segments: ["content", "posts"],
    },
    {
      body: { items: [{ id: "1" }] },
      status: 200,
    },
    "env_123",
  );

  const usage = await tracker.getMonth("env_123", new Date().toISOString().slice(0, 7));

  assert.equal(usage.publicMetrics.apiCalls, 1);
  assert.equal(usage.publicMetrics.readCalls, 1);
  assert.equal(usage.publicMetrics.contentReads, 1);
  assert.equal(usage.controlMetrics.apiCalls, 0);
  assert.equal(usage.totalMetrics.apiCalls, 1);
});

test("control usage stays in operational counters only", async () => {
  const pool = createMockPool();
  const publicTracker = createDbUsageTracker(pool as never, { surface: "public" });
  const controlTracker = createDbUsageTracker(pool as never, { surface: "control" });
  const monthKey = new Date().toISOString().slice(0, 7);

  await publicTracker.record(
    {
      body: { title: "publish" },
      headers: new Headers(),
      method: "POST",
      searchParams: new URLSearchParams(),
      segments: ["schema"],
    },
    {
      body: { ok: true },
      status: 200,
    },
    "env_456",
  );

  await controlTracker.record(
    {
      headers: new Headers(),
      method: "GET",
      searchParams: new URLSearchParams(),
      segments: ["content", "posts"],
    },
    {
      body: { items: [{ id: "2" }, { id: "3" }] },
      status: 200,
    },
    "env_456",
  );

  const usage = await publicTracker.getMonth("env_456", monthKey);

  assert.equal(usage.publicMetrics.apiCalls, 1);
  assert.equal(usage.publicMetrics.schemaPublishes, 1);
  assert.equal(usage.controlMetrics.apiCalls, 1);
  assert.equal(usage.controlMetrics.readCalls, 1);
  assert.equal(usage.controlMetrics.contentReads, 1);
  assert.equal(usage.totalMetrics.apiCalls, 2);
  assert.equal(
    usage.totalMetrics.bytesIn,
    usage.publicMetrics.bytesIn + usage.controlMetrics.bytesIn,
  );
  assert.equal(
    usage.totalMetrics.bytesOut,
    usage.publicMetrics.bytesOut + usage.controlMetrics.bytesOut,
  );
});
