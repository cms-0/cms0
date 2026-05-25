import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
  ensureBrowserSchemaDescriptorDevSubscription,
  getActiveSchemaDescriptor,
  invalidateBrowserSchemaDescriptorCache,
  readLocalSchemaDescriptor,
  resolveBrowserSchemaDescriptor,
  schemaDescriptor,
  syncActiveSchemaDescriptorGlobals,
} from "../../src/schema-descriptors.js";

function createTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeLocalDescriptor(
  projectRoot: string,
  descriptor: Record<string, unknown>,
) {
  const outputPath = path.join(
    projectRoot,
    ".cms0/generated/schema-descriptor.json",
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(descriptor, null, 2)}\n`,
    "utf8",
  );
  return outputPath;
}

test("readLocalSchemaDescriptor loads the nearest app-local descriptor", () => {
  const projectRoot = createTempDir("cms0-local-descriptor-");
  const descriptor = {
    models: {},
    roots: {
      Header: {
        type: "object",
        properties: {
          title: {
            kind: "primitive",
            type: "string",
          },
        },
      },
    },
  };

  try {
    writeLocalDescriptor(projectRoot, descriptor);
    assert.deepEqual(readLocalSchemaDescriptor([projectRoot]), descriptor);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("syncActiveSchemaDescriptorGlobals loads the app-local descriptor and writes globals", () => {
  const projectRoot = createTempDir("cms0-active-descriptor-");
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalProjectRoot = process.env.CMS0_PROJECT_ROOT;
  const originalDescriptorPath = process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const descriptor = {
    models: {},
    roots: {
      Footer: {
        type: "object",
        properties: {},
      },
    },
  };

  try {
    const descriptorPath = writeLocalDescriptor(projectRoot, descriptor);
    process.env.CMS0_PROJECT_ROOT = projectRoot;
    process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = descriptorPath;
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;

    assert.deepEqual(syncActiveSchemaDescriptorGlobals(), descriptor);
    assert.deepEqual(globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__, descriptor);
    assert.deepEqual(globals.__CMS0_SCHEMA_DESCRIPTOR__, descriptor);
  } finally {
    if (typeof originalProjectRoot === "string") {
      process.env.CMS0_PROJECT_ROOT = originalProjectRoot;
    } else {
      delete process.env.CMS0_PROJECT_ROOT;
    }

    if (typeof originalDescriptorPath === "string") {
      process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = originalDescriptorPath;
    } else {
      delete process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
    }

    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("getActiveSchemaDescriptor throws in browser runtimes when no descriptor has been injected", () => {
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;

  try {
    globals.window = {};
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;

    assert.throws(
      () => getActiveSchemaDescriptor(),
      /no browser schema descriptor is active/i,
    );
  } finally {
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("getActiveSchemaDescriptor returns the injected browser descriptor", () => {
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const descriptor = {
    models: {},
    roots: {
      AboutUsPage: {
        type: "object",
        properties: {},
      },
    },
  };

  try {
    globals.window = {};
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = descriptor;
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;

    assert.deepEqual(getActiveSchemaDescriptor(), descriptor);
    assert.deepEqual(globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__, descriptor);
  } finally {
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("getActiveSchemaDescriptor throws in node runtimes when no local .cms0 descriptor exists", () => {
  const projectRoot = createTempDir("cms0-missing-local-descriptor-");
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    window?: unknown;
  };
  const originalProjectRoot = process.env.CMS0_PROJECT_ROOT;
  const originalDescriptorPath = process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
  const originalWindow = globals.window;
  const originalBundledDescriptor = JSON.parse(
    JSON.stringify(schemaDescriptor),
  );

  try {
    process.env.CMS0_PROJECT_ROOT = projectRoot;
    process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = path.join(
      projectRoot,
      ".cms0/generated/schema-descriptor.json",
    );
    delete globals.window;
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, {
      models: {},
      roots: {},
      metadata: {
        __cms0Fallback: true,
      },
    });

    assert.throws(
      () => getActiveSchemaDescriptor(),
      /no local schema descriptor was found/i,
    );
  } finally {
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, originalBundledDescriptor);

    if (typeof originalProjectRoot === "string") {
      process.env.CMS0_PROJECT_ROOT = originalProjectRoot;
    } else {
      delete process.env.CMS0_PROJECT_ROOT;
    }

    if (typeof originalDescriptorPath === "string") {
      process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = originalDescriptorPath;
    } else {
      delete process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
    }

    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }

    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("getActiveSchemaDescriptor falls back to the bundled build projection in node runtimes", () => {
  const projectRoot = createTempDir("cms0-bundled-server-descriptor-");
  const globals = globalThis as Omit<typeof globalThis, "window"> & {
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalProjectRoot = process.env.CMS0_PROJECT_ROOT;
  const originalDescriptorPath = process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const originalBundledDescriptor = JSON.parse(
    JSON.stringify(schemaDescriptor),
  );
  const bundledProjection = {
    models: {},
    roots: {
      PricingPage: {
        type: "object",
        properties: {},
      },
    },
    metadata: {
      build: "server",
    },
  };

  try {
    process.env.CMS0_PROJECT_ROOT = projectRoot;
    process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = path.join(
      projectRoot,
      ".cms0/generated/schema-descriptor.json",
    );
    delete globals.window;
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, bundledProjection);

    assert.deepEqual(getActiveSchemaDescriptor(), bundledProjection);
    assert.deepEqual(globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__, bundledProjection);
    assert.deepEqual(globals.__CMS0_SCHEMA_DESCRIPTOR__, bundledProjection);
  } finally {
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, originalBundledDescriptor);

    if (typeof originalProjectRoot === "string") {
      process.env.CMS0_PROJECT_ROOT = originalProjectRoot;
    } else {
      delete process.env.CMS0_PROJECT_ROOT;
    }

    if (typeof originalDescriptorPath === "string") {
      process.env.CMS0_SCHEMA_DESCRIPTOR_PATH = originalDescriptorPath;
    } else {
      delete process.env.CMS0_SCHEMA_DESCRIPTOR_PATH;
    }

    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;

    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("resolveBrowserSchemaDescriptor loads the descriptor from the local sidecar", async () => {
  const globals = globalThis as Omit<typeof globalThis, "fetch"> & {
    fetch?: typeof fetch;
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };
  const originalFetch = globals.fetch;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const descriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        properties: {},
      },
    },
  };

  try {
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    globals.fetch = async () =>
      new Response(JSON.stringify(descriptor), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    assert.deepEqual(
      await resolveBrowserSchemaDescriptor(
        "http://localhost:4002/api",
        "example-key",
      ),
      descriptor,
    );
  } finally {
    if (typeof originalFetch === "function") {
      globals.fetch = originalFetch;
    } else {
      delete globals.fetch;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("resolveBrowserSchemaDescriptor prefers a real bundled build projection before the sidecar", async () => {
  const globals = globalThis as Omit<typeof globalThis, "fetch"> & {
    fetch?: typeof fetch;
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };
  const originalFetch = globals.fetch;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const originalBundledDescriptor = JSON.parse(
    JSON.stringify(schemaDescriptor),
  );
  const bundledProjection = {
    models: {},
    roots: {
      AboutUsPage: {
        type: "object",
        properties: {},
      },
    },
    metadata: {
      build: "preview",
    },
  };
  let fetchCalled = false;

  try {
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    Object.assign(schemaDescriptor, bundledProjection);
    globals.fetch = async () => {
      fetchCalled = true;
      throw new Error("sidecar should not be used for bundled previews");
    };

    assert.deepEqual(
      await resolveBrowserSchemaDescriptor(
        "http://localhost:4002/api",
        "example-key-3",
      ),
      bundledProjection,
    );
    assert.equal(fetchCalled, false);
  } finally {
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, originalBundledDescriptor);

    if (typeof originalFetch === "function") {
      globals.fetch = originalFetch;
    } else {
      delete globals.fetch;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("resolveBrowserSchemaDescriptor throws when sidecar is unavailable and only the fallback bundle exists", async () => {
  const globals = globalThis as Omit<typeof globalThis, "fetch"> & {
    fetch?: typeof fetch;
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
  };
  const originalFetch = globals.fetch;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;

  try {
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    globals.fetch = async () => {
      throw new Error("connect ECONNREFUSED");
    };

    await assert.rejects(
      () =>
        resolveBrowserSchemaDescriptor(
          "http://localhost:4002/api",
          "example-key-2",
        ),
      /failed to load the browser schema descriptor/i,
    );
  } finally {
    if (typeof originalFetch === "function") {
      globals.fetch = originalFetch;
    } else {
      delete globals.fetch;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("SSE sidecar invalidation clears browser descriptor cache so the next resolve refetches", async () => {
  const globals = globalThis as Omit<
    typeof globalThis,
    "EventSource" | "fetch" | "window"
  > & {
    EventSource?: typeof EventSource;
    fetch?: typeof fetch;
    __CMS0_CANVAS_SCHEMA_DESCRIPTOR__?: unknown;
    __CMS0_SCHEMA_DESCRIPTOR__?: unknown;
    window?: unknown;
  };
  const originalEventSource = globals.EventSource;
  const originalFetch = globals.fetch;
  const originalWindow = globals.window;
  const originalCanvasDescriptor = globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
  const originalDescriptor = globals.__CMS0_SCHEMA_DESCRIPTOR__;
  const originalBundledDescriptor = JSON.parse(
    JSON.stringify(schemaDescriptor),
  );
  const descriptorSequence = [
    {
      models: {},
      roots: {
        HomePage: {
          type: "object",
          properties: {},
        },
      },
    },
    {
      models: {},
      roots: {
        AboutUsPage: {
          type: "object",
          properties: {},
        },
      },
    },
  ];
  let fetchCount = 0;

  class MockEventSource {
    static instances: MockEventSource[] = [];
    private listeners = new Map<string, Set<(event: unknown) => void>>();
    onerror: ((event: unknown) => void) | null = null;
    closed = false;

    constructor(_url: string) {
      MockEventSource.instances.push(this);
    }

    addEventListener(type: string, listener: (event: unknown) => void) {
      const existing = this.listeners.get(type) ?? new Set();
      existing.add(listener);
      this.listeners.set(type, existing);
    }

    emit(type: string) {
      for (const listener of this.listeners.get(type) ?? []) {
        listener({ type });
      }
    }

    emitError() {
      this.onerror?.({ type: "error" });
    }

    close() {
      this.closed = true;
    }
  }

  try {
    globals.window = {};
    delete globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__;
    delete globals.__CMS0_SCHEMA_DESCRIPTOR__;
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, {
      models: {},
      roots: {},
      metadata: {
        __cms0Fallback: true,
      },
    });

    globals.EventSource = MockEventSource as unknown as typeof EventSource;
    globals.fetch = async () =>
      new Response(JSON.stringify(descriptorSequence[fetchCount++]!), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    ensureBrowserSchemaDescriptorDevSubscription(
      "http://localhost:4002/api",
      "example-key-4",
    );

    assert.deepEqual(
      await resolveBrowserSchemaDescriptor(
        "http://localhost:4002/api",
        "example-key-4",
      ),
      descriptorSequence[0],
    );
    assert.equal(fetchCount, 1);

    MockEventSource.instances[0]!.emit("schema-version");

    assert.equal(globals.__CMS0_SCHEMA_DESCRIPTOR__, undefined);
    assert.deepEqual(
      await resolveBrowserSchemaDescriptor(
        "http://localhost:4002/api",
        "example-key-4",
      ),
      descriptorSequence[1],
    );
    assert.equal(fetchCount, 2);
  } finally {
    invalidateBrowserSchemaDescriptorCache(
      "http://localhost:4002/api",
      "example-key-4",
    );
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, originalBundledDescriptor);

    if (typeof originalEventSource === "function") {
      globals.EventSource = originalEventSource;
    } else {
      delete globals.EventSource;
    }
    if (typeof originalFetch === "function") {
      globals.fetch = originalFetch;
    } else {
      delete globals.fetch;
    }
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
    globals.__CMS0_CANVAS_SCHEMA_DESCRIPTOR__ = originalCanvasDescriptor;
    globals.__CMS0_SCHEMA_DESCRIPTOR__ = originalDescriptor;
  }
});

test("SSE sidecar subscriptions close on error and re-subscribe on demand", () => {
  const globals = globalThis as Omit<
    typeof globalThis,
    "EventSource" | "window"
  > & {
    EventSource?: typeof EventSource;
    window?: unknown;
  };
  const originalEventSource = globals.EventSource;
  const originalWindow = globals.window;
  const originalBundledDescriptor = JSON.parse(
    JSON.stringify(schemaDescriptor),
  );

  class MockEventSource {
    static instances: MockEventSource[] = [];
    onerror: ((event: unknown) => void) | null = null;
    closed = false;

    constructor(_url: string) {
      MockEventSource.instances.push(this);
    }

    addEventListener() {}

    close() {
      this.closed = true;
    }

    emitError() {
      this.onerror?.({ type: "error" });
    }
  }

  try {
    globals.window = {};
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, {
      models: {},
      roots: {},
      metadata: {
        __cms0Fallback: true,
      },
    });
    globals.EventSource = MockEventSource as unknown as typeof EventSource;

    ensureBrowserSchemaDescriptorDevSubscription(
      "http://localhost:4002/api",
      "example-key-5",
    );
    assert.equal(MockEventSource.instances.length, 1);

    MockEventSource.instances[0]!.emitError();
    assert.equal(MockEventSource.instances[0]!.closed, true);

    ensureBrowserSchemaDescriptorDevSubscription(
      "http://localhost:4002/api",
      "example-key-5",
    );
    assert.equal(MockEventSource.instances.length, 2);
  } finally {
    for (const key of Object.keys(schemaDescriptor)) {
      delete (schemaDescriptor as Record<string, unknown>)[key];
    }
    Object.assign(schemaDescriptor, originalBundledDescriptor);

    if (typeof originalEventSource === "function") {
      globals.EventSource = originalEventSource;
    } else {
      delete globals.EventSource;
    }
    if (typeof originalWindow === "undefined") {
      delete globals.window;
    } else {
      globals.window = originalWindow;
    }
  }
});
