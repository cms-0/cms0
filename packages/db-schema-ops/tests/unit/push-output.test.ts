import { describe, expect, it, vi } from "vitest";

import {
  appendOutput,
  autoResolvePrompts,
  createPushOutputState,
  hasFatalOutput,
  hasInteractivePrompt,
  stripAnsi,
} from "../../src/push-output";

describe("@cms0/db-schema-ops push output helpers", () => {
  it("strips terminal control sequences before inspection", () => {
    expect(stripAnsi("\u001b[31merror: failed\u001b[0m")).toBe(
      "error: failed",
    );
  });

  it("detects fatal output and interactive prompts", () => {
    expect(hasFatalOutput("severity: ERROR")).toBe(true);
    expect(hasInteractivePrompt("Do you want to truncate table posts?")).toBe(
      true,
    );
  });

  it("auto-resolves known drizzle prompts once", () => {
    const state = createPushOutputState();
    const writeInput = vi.fn();

    appendOutput(
      state,
      "Column in posts table created or renamed from another column?\nDo you want to truncate posts?",
    );
    autoResolvePrompts(state, writeInput);
    autoResolvePrompts(state, writeInput);

    expect(writeInput.mock.calls).toEqual([["\r"], ["\r"], ["n\r"]]);
  });
});
