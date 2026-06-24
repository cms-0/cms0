import { describe, expect, it, vi } from "vitest";

import { runDbPushSafe } from "../../src/migration";
import {
  AmbiguityExhaustedError,
  UnsafeRetryError,
  appendOutput,
  createPushOutputState,
  resolvePrompts,
  type AmbiguityEscalationState,
} from "../../src/push-output";
import type { PushResult, PushTimeouts } from "../../src/push-strategies";

const TABLE_RENAME_PROMPT = [
  "",
  "Is posts table created or renamed from another table?",
  "❯ + posts                              create table",
  "  ~ old_posts › posts                  rename table",
  "",
].join("\n");

// Reuses the real prompt-parsing/escalation bookkeeping (push-output.ts) so
// these tests exercise the same logic the real strategies do, while faking
// only the "spawn a real process" part. `chunks` are appended and resolved
// one at a time — matching how the real strategies call appendOutput +
// resolvePrompts per stdout "data" event — so `lastAnsweredOffset` lands at
// the right place relative to chunks that arrive *after* a prompt is
// answered (e.g. a later DDL-statement echo), instead of being skewed by
// collapsing everything into a single appendOutput call.
const scriptedStrategy = (
  scripts: Array<{ chunks: string[]; code: number | null }>,
) => {
  let callCount = 0;
  const strategy = async (
    escalationState: AmbiguityEscalationState,
    _timeouts: PushTimeouts,
  ): Promise<PushResult> => {
    const script = scripts[Math.min(callCount, scripts.length - 1)];
    callCount += 1;
    const state = createPushOutputState();
    for (const chunk of script.chunks) {
      appendOutput(state, chunk);
      resolvePrompts(state, escalationState, () => {});
    }
    return {
      code: script.code,
      answeredQuestionCount: state.answeredQuestionCount,
      lastAnsweredOffset: state.lastAnsweredOffset,
      output: state.output,
    };
  };
  return { strategy, getCallCount: () => callCount };
};

describe("runDbPushSafe retry-loop escalation", () => {
  it("succeeds on the first attempt for the unambiguous common case (no regression)", async () => {
    const { strategy, getCallCount } = scriptedStrategy([
      { chunks: ["No schema changes detected"], code: 0 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0 }),
    ).resolves.toBeUndefined();
    expect(getCallCount()).toBe(1);
  });

  it("escalates to the next option index on retry after a non-DDL failure, and succeeds", async () => {
    const { strategy, getCallCount } = scriptedStrategy([
      {
        chunks: [TABLE_RENAME_PROMPT, '\nerror: relation "old_posts" already exists'],
        code: 1,
      },
      { chunks: [TABLE_RENAME_PROMPT], code: 0 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
    expect(getCallCount()).toBe(2);
  });

  it("throws AmbiguityExhaustedError once a question's options are exhausted, without consuming the full attempts budget", async () => {
    const failingChunks = [
      TABLE_RENAME_PROMPT,
      '\nerror: relation "old_posts" already exists',
    ];
    const { strategy, getCallCount } = scriptedStrategy([
      { chunks: failingChunks, code: 1 },
      { chunks: failingChunks, code: 1 },
    ]);

    // TABLE_RENAME_PROMPT has 2 options (1 create + 1 rename candidate), so
    // it should exhaust after 2 attempts even though attempts budget is 5.
    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 5 }),
    ).rejects.toThrow(AmbiguityExhaustedError);
    expect(getCallCount()).toBe(2);
  });

  it("throws UnsafeRetryError immediately when DDL execution appears to have started, without retrying", async () => {
    const { strategy, getCallCount } = scriptedStrategy([
      {
        // The prompt arrives in its own chunk and gets answered before the
        // DDL-statement echo / error arrive in a later chunk — matching how
        // the real strategies process stdout incrementally, so
        // lastAnsweredOffset lands right after the prompt, not at the end
        // of the whole buffer.
        chunks: [
          TABLE_RENAME_PROMPT,
          '\nALTER TABLE posts ADD COLUMN title text;\nerror: constraint "x" does not exist',
        ],
        code: 1,
      },
      { chunks: [TABLE_RENAME_PROMPT], code: 0 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 5 }),
    ).rejects.toThrow(UnsafeRetryError);
    expect(getCallCount()).toBe(1);
  });

  it("tries 'No' first for a truncate prompt, then escalates to 'Yes, truncate' on retry and succeeds", async () => {
    // cms0's RootSchema is meant to be freely editable — a constraint
    // addition that requires truncating a table to apply is a normal,
    // expected outcome of a schema edit the user asked for, so this goes
    // through the same escalation mechanism as any other ambiguous prompt
    // rather than being refused forever.
    const truncatePrompt = [
      "Do you want to truncate posts table?",
      "❯ No, add the constraint without truncating the table",
      "  Yes, truncate the table",
      "",
    ].join("\n");
    const { strategy, getCallCount } = scriptedStrategy([
      {
        chunks: [truncatePrompt, "\nerror: constraint violation"],
        code: 1,
      },
      { chunks: [truncatePrompt], code: 0 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
    expect(getCallCount()).toBe(2);
  });

  it("exhausts a truncate prompt's two options (No, then Yes) and throws AmbiguityExhaustedError if both fail", async () => {
    const truncatePrompt = [
      "Do you want to truncate posts table?",
      "❯ No, add the constraint without truncating the table",
      "  Yes, truncate the table",
      "",
    ].join("\n");
    const failingChunks = [truncatePrompt, "\nerror: constraint violation"];
    const { strategy, getCallCount } = scriptedStrategy([
      { chunks: failingChunks, code: 1 },
      { chunks: failingChunks, code: 1 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 5 }),
    ).rejects.toThrow(AmbiguityExhaustedError);
    expect(getCallCount()).toBe(2);
  });

  it("retries the normal way (consuming the attempts budget) for failures unrelated to any prompt", async () => {
    const { strategy, getCallCount } = scriptedStrategy([
      { chunks: ["severity: ERROR"], code: 1 },
      { chunks: ["severity: ERROR"], code: 1 },
      { chunks: ["ok"], code: 0 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 3 }),
    ).resolves.toBeUndefined();
    expect(getCallCount()).toBe(3);
  });
});

describe("runDbPushSafe non-prompt-related options", () => {
  it("still respects the configured attempts budget for generic failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { strategy, getCallCount } = scriptedStrategy([
      { chunks: ["severity: ERROR"], code: 1 },
      { chunks: ["severity: ERROR"], code: 1 },
    ]);

    await expect(
      runDbPushSafe({ strategyOverride: strategy, retryDelayMs: 0, attempts: 2 }),
    ).rejects.toThrow(/drizzle-kit push failed/);
    expect(getCallCount()).toBe(2);
    warn.mockRestore();
  });
});
