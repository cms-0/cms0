import assert from "node:assert/strict";
import { test } from "vitest";
import type { FullDescriptor } from "@cms0/shared";
import { publishDescriptor, isRetryablePublishStatus } from "../../src/libs/cli/publisher.js";

test("isRetryablePublishStatus only retries transient HTTP statuses", () => {
  assert.equal(isRetryablePublishStatus(400), false);
  assert.equal(isRetryablePublishStatus(401), false);
  assert.equal(isRetryablePublishStatus(403), false);
  assert.equal(isRetryablePublishStatus(404), false);
  assert.equal(isRetryablePublishStatus(408), true);
  assert.equal(isRetryablePublishStatus(425), true);
  assert.equal(isRetryablePublishStatus(429), true);
  assert.equal(isRetryablePublishStatus(500), true);
  assert.equal(isRetryablePublishStatus(503), true);
});

test("publishDescriptor does not retry auth failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  let fetchCalls = 0;

  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response("", { status: 401, statusText: "Unauthorized" });
  };
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };

  const descriptor = {
    metadata: {},
    roots: {},
    models: {},
  } as FullDescriptor;

  try {
    await publishDescriptor(
      {
        configPath: "/tmp/cms0.config.ts",
        entryFile: "/tmp/entry.ts",
        apiBaseUrl: "http://cms.local/api/content",
        apiKey: "bad-key",
      },
      descriptor,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }

  assert.equal(fetchCalls, 1);
  assert.ok(
    warnings.some((message) => message.includes("status 401")),
  );
  assert.ok(
    warnings.every((message) => !message.includes("retrying in")),
  );
});

test("publishDescriptor uses the environment runtime schema route", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "http://localhost:3001/api/content/stage/schema") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:3001/api/content/stage/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    return new Response("", { status: 404 });
  };
  console.log = () => {};

  const descriptor = {
    metadata: {},
    roots: {},
    models: {},
  } as FullDescriptor;

  try {
    await publishDescriptor(
      {
        configPath: "/tmp/cms0.config.ts",
        entryFile: "/tmp/entry.ts",
        apiBaseUrl: "http://localhost:3001/api/content/stage",
        apiKey: "valid-key",
      },
      descriptor,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    "http://localhost:3001/api/content/stage/schema",
    "http://localhost:3001/api/content/stage/health",
  ]);
});

test("publishDescriptor uses the provided content runtime schema route", async () => {
  const originalFetch = globalThis.fetch;
  const originalLog = console.log;
  const calls: string[] = [];

  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);

    if (url === "http://localhost:3000/api/content/schema") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    if (url === "http://localhost:3000/api/content/health") {
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    }

    return new Response("", { status: 404 });
  };
  console.log = () => {};

  const descriptor = {
    metadata: {},
    roots: {},
    models: {},
  } as FullDescriptor;

  try {
    await publishDescriptor(
      {
        configPath: "/tmp/cms0.config.ts",
        entryFile: "/tmp/entry.ts",
        apiBaseUrl: "http://localhost:3000/api/content",
        apiKey: "valid-key",
      },
      descriptor,
    );
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
  }

  assert.deepEqual(calls, [
    "http://localhost:3000/api/content/schema",
    "http://localhost:3000/api/content/health",
  ]);
});
