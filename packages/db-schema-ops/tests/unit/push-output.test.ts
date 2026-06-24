import { describe, expect, it, vi } from "vitest";

import {
  appendOutput,
  createAmbiguityEscalationState,
  createPushOutputState,
  findExhaustedQuestion,
  hasDdlExecutionStarted,
  hasFatalOutput,
  hasInteractivePrompt,
  resolvePrompts,
  stripAnsi,
} from "../../src/push-output";

const TABLE_RENAME_PROMPT = [
  "",
  "Is posts table created or renamed from another table?",
  "❯ + posts                              create table",
  "  ~ old_posts › posts                  rename table",
  "  ~ legacy_posts › posts                rename table",
  "",
].join("\n");

const COLUMN_RENAME_PROMPT = [
  "",
  "Is title column in posts table created or renamed from another column?",
  "❯ + title                              create column",
  "  ~ heading › title                    rename column",
  "",
].join("\n");

const TRUNCATE_PROMPT = [
  "· You're about to add a unique constraint to the table, which contains 4 items. Do you want to truncate posts table?",
  "❯ No, add the constraint without truncating the table",
  "  Yes, truncate the table",
  "",
].join("\n");

describe("@cms0/db-schema-ops push output helpers", () => {
  it("strips terminal control sequences before inspection", () => {
    expect(stripAnsi("[31merror: failed[0m")).toBe(
      "error: failed",
    );
  });

  it("detects fatal output and interactive prompts", () => {
    expect(hasFatalOutput("severity: ERROR")).toBe(true);
    expect(hasInteractivePrompt("Do you want to truncate table posts?")).toBe(
      true,
    );
  });

  it("caps retained output and trims at a line boundary", () => {
    const state = createPushOutputState();
    const line = `${"x".repeat(50)}\n`;
    for (let i = 0; i < 50; i += 1) {
      appendOutput(state, line, 200);
    }
    expect(state.output.length).toBeLessThanOrEqual(200);
    expect(state.output.startsWith("x")).toBe(true);
  });

  it("parses the exact option count for a multi-option rename prompt and selects index 0 first", () => {
    const state = createPushOutputState();
    const escalationState = createAmbiguityEscalationState();
    const writeInput = vi.fn();

    appendOutput(state, TABLE_RENAME_PROMPT);
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput.mock.calls).toEqual([["\r"]]);
    expect(escalationState.questions.get("table:posts")).toEqual({
      totalOptions: 3,
      nextIndexToTry: 1,
      exhausted: false,
    });
  });

  it("does not re-answer the same question on a redraw within one attempt", () => {
    const state = createPushOutputState();
    const escalationState = createAmbiguityEscalationState();
    const writeInput = vi.fn();

    appendOutput(state, TABLE_RENAME_PROMPT);
    resolvePrompts(state, escalationState, writeInput);
    // Simulate a redraw: the identical frame reappears (e.g. cursor moved).
    appendOutput(state, TABLE_RENAME_PROMPT);
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput).toHaveBeenCalledTimes(1);
  });

  it("escalates to the next option index across separate attempts via shared escalation state", () => {
    const escalationState = createAmbiguityEscalationState();

    const attempt1 = createPushOutputState();
    const write1 = vi.fn();
    appendOutput(attempt1, TABLE_RENAME_PROMPT);
    resolvePrompts(attempt1, escalationState, write1);
    expect(write1.mock.calls).toEqual([["\r"]]);

    // New attempt, new PushOutputState — but the same escalationState, as
    // runDbPushSafe threads it across attempts.
    const attempt2 = createPushOutputState();
    const write2 = vi.fn();
    appendOutput(attempt2, TABLE_RENAME_PROMPT);
    resolvePrompts(attempt2, escalationState, write2);
    expect(write2.mock.calls).toEqual([["\x1b[B\r"]]);

    const attempt3 = createPushOutputState();
    const write3 = vi.fn();
    appendOutput(attempt3, TABLE_RENAME_PROMPT);
    resolvePrompts(attempt3, escalationState, write3);
    expect(write3.mock.calls).toEqual([["\x1b[B\x1b[B\r"]]);
    expect(findExhaustedQuestion(escalationState)).toEqual({
      questionId: "table:posts",
      totalOptions: 3,
    });
  });

  it("once exhausted, skips the question instead of sending a keystroke", () => {
    const escalationState = createAmbiguityEscalationState();
    escalationState.questions.set("table:posts", {
      totalOptions: 3,
      nextIndexToTry: 3,
      exhausted: true,
    });

    const state = createPushOutputState();
    const writeInput = vi.fn();
    appendOutput(state, TABLE_RENAME_PROMPT);
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput).not.toHaveBeenCalled();
  });

  it("tracks independent escalation per distinct question, including column prompts", () => {
    const state = createPushOutputState();
    const escalationState = createAmbiguityEscalationState();
    const writeInput = vi.fn();

    appendOutput(state, TABLE_RENAME_PROMPT);
    appendOutput(state, COLUMN_RENAME_PROMPT);
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput.mock.calls).toEqual([["\r"], ["\r"]]);
    expect(escalationState.questions.size).toBe(2);
    expect(escalationState.questions.get("table:posts")?.totalOptions).toBe(3);
    expect(
      escalationState.questions.get("column:posts.title")?.totalOptions,
    ).toBe(2);
  });

  it("answers a truncate prompt through the same escalation mechanism, trying 'No' first and deduping redraws", () => {
    const state = createPushOutputState();
    const escalationState = createAmbiguityEscalationState();
    const writeInput = vi.fn();

    appendOutput(state, TRUNCATE_PROMPT);
    resolvePrompts(state, escalationState, writeInput);
    // Redraw of the same instance — must not be answered twice.
    appendOutput(state, TRUNCATE_PROMPT);
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput.mock.calls).toEqual([["\r"]]);
    expect(escalationState.questions.get("truncate:posts")).toEqual({
      totalOptions: 2,
      nextIndexToTry: 1,
      exhausted: false,
    });
  });

  it("escalates a truncate prompt to 'Yes, truncate' on retry, and exhausts after both options", () => {
    const escalationState = createAmbiguityEscalationState();

    const attempt1 = createPushOutputState();
    const write1 = vi.fn();
    appendOutput(attempt1, TRUNCATE_PROMPT);
    resolvePrompts(attempt1, escalationState, write1);
    expect(write1.mock.calls).toEqual([["\r"]]);

    const attempt2 = createPushOutputState();
    const write2 = vi.fn();
    appendOutput(attempt2, TRUNCATE_PROMPT);
    resolvePrompts(attempt2, escalationState, write2);
    expect(write2.mock.calls).toEqual([["\x1b[B\r"]]);
    expect(findExhaustedQuestion(escalationState)).toEqual({
      questionId: "truncate:posts",
      totalOptions: 2,
    });
  });

  it("waits for more output if the option block hasn't fully arrived yet", () => {
    const state = createPushOutputState();
    const escalationState = createAmbiguityEscalationState();
    const writeInput = vi.fn();

    appendOutput(
      state,
      "\nIs posts table created or renamed from another table?\n❯ + posts",
    );
    resolvePrompts(state, escalationState, writeInput);

    expect(writeInput).not.toHaveBeenCalled();
    expect(escalationState.questions.get("table:posts")?.totalOptions).toBe(
      null,
    );
  });

  describe("hasDdlExecutionStarted", () => {
    it("detects a SQL statement echo after the last answered prompt offset", () => {
      const output = `${TABLE_RENAME_PROMPT}\nALTER TABLE posts ADD COLUMN title text;\nerror: constraint "x" does not exist`;
      const offset = output.indexOf("ALTER TABLE");
      expect(hasDdlExecutionStarted(output, offset - 1)).toBe(true);
    });

    it("is false when fatal output only appears before any prompt was answered", () => {
      const output = "error: something failed\nIs posts table created or renamed from another table?";
      const lastAnsweredOffset = output.length; // nothing answered yet
      expect(hasDdlExecutionStarted(output, lastAnsweredOffset)).toBe(false);
    });

    it("is false for a fatal error with no DDL statement echo after the answered offset (safe to escalate)", () => {
      const output = `${TABLE_RENAME_PROMPT}\nseverity: ERROR`;
      const offset = output.indexOf("severity") - 1;
      expect(hasDdlExecutionStarted(output, offset)).toBe(false);
    });
  });
});
