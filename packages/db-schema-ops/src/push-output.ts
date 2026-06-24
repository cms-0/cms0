export type QuestionEscalation = {
  totalOptions: number | null;
  nextIndexToTry: number;
  exhausted: boolean;
};

export type QuestionId = string;

// Persists across every attempt of a single `runDbPushSafe` call (created
// once, outside its retry loop) so that retrying an ambiguous prompt tries
// the next option instead of repeating the same guess.
export type AmbiguityEscalationState = {
  questions: Map<QuestionId, QuestionEscalation>;
};

export const createAmbiguityEscalationState = (): AmbiguityEscalationState => ({
  questions: new Map(),
});

export const findExhaustedQuestion = (
  escalationState: AmbiguityEscalationState,
): { questionId: QuestionId; totalOptions: number } | null => {
  for (const [questionId, escalation] of escalationState.questions) {
    if (escalation.exhausted) {
      return { questionId, totalOptions: escalation.totalOptions ?? 0 };
    }
  }
  return null;
};

// Per-attempt state. Recreated fresh for every `drizzle-kit push` process
// invocation (unlike AmbiguityEscalationState, which spans attempts).
export type PushOutputState = {
  output: string;
  answeredQuestionIds: Set<QuestionId>;
  answeredQuestionCount: number;
  lastAnsweredOffset: number;
};

export const createPushOutputState = (): PushOutputState => ({
  output: "",
  answeredQuestionIds: new Set(),
  answeredQuestionCount: 0,
  lastAnsweredOffset: 0,
});

const DEFAULT_MAX_RETAINED_OUTPUT_BYTES = 1_048_576;

export const resolveMaxRetainedOutputBytes = (override?: number): number => {
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  const parsed = Number.parseInt(
    process.env.CMS0_DB_PUSH_MAX_OUTPUT_BYTES ?? "",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_MAX_RETAINED_OUTPUT_BYTES;
};

export const stripAnsi = (output: string): string =>
  output
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");

export const hasFatalOutput = (output: string): boolean => {
  const patterns = [
    /^\s*error:\s+/gim,
    /\bseverity:\s*['"]?ERROR['"]?/gi,
    /\bPostgresError\b/gi,
  ];
  return patterns.some((pattern) => pattern.test(output));
};

const DDL_STATEMENT_PATTERN =
  /^\s*(CREATE|ALTER|DROP)\s+(TABLE|INDEX|SCHEMA|TYPE|SEQUENCE)\b/gim;

/**
 * Best-effort detection of "did real DDL execution start" for a failed
 * attempt, distinct from "failed purely while answering a prompt."
 *
 * Deliberately keyed off the DDL-statement echo only, not a generic
 * hasFatalOutput(tail) fallback: a fatal pattern is *already* what makes
 * runDbPushSafeOnce treat this attempt as failed in the first place, so a
 * fallback that just re-checks "is there fatal output after the last
 * answered prompt" would fire on almost every retryable failure and make
 * escalation across attempts effectively unreachable, defeating the whole
 * feature. The statement-echo signal is a meaningfully more specific
 * indicator that execution (not just prompt resolution) was reached.
 *
 * This signal (drizzle-kit's --verbose statement echo) was not confirmed
 * against a live drizzle-kit run during this change and should be
 * validated empirically.
 */
export const hasDdlExecutionStarted = (
  output: string,
  lastAnsweredOffset: number,
): boolean => DDL_STATEMENT_PATTERN.test(output.slice(lastAnsweredOffset));

export const hasInteractivePrompt = (output: string): boolean => {
  const prompts = [
    /created or renamed from another \w+\?/i,
    /column in .* table created or renamed from another column\?/i,
    /Do you want to truncate/i,
    /requires? a TTY terminal/i,
    /Enter /i,
  ];
  return prompts.some((pattern) => pattern.test(output));
};

export const hasTtyRequirementFailure = (output: string): boolean =>
  /requires? a TTY terminal|tcgetattr\/ioctl/i.test(output);

export const appendOutput = (
  state: PushOutputState,
  chunk: string,
  maxRetainedBytes: number = resolveMaxRetainedOutputBytes(),
): void => {
  state.output += stripAnsi(chunk);
  if (state.output.length > maxRetainedBytes) {
    const cutAt = state.output.length - maxRetainedBytes;
    const lineBoundary = state.output.indexOf("\n", cutAt);
    const trimAt = lineBoundary === -1 ? cutAt : lineBoundary + 1;
    state.output = state.output.slice(trimAt);
  }
};

export class AmbiguityExhaustedError extends Error {
  readonly questionId: string;
  readonly totalOptions: number;
  readonly output: string;

  constructor(input: { questionId: string; totalOptions: number; output: string }) {
    super(
      `drizzle-kit push could not resolve ambiguity for "${input.questionId}" automatically after trying all ${input.totalOptions} option(s). Manual schema review required.`,
    );
    this.name = "AmbiguityExhaustedError";
    this.questionId = input.questionId;
    this.totalOptions = input.totalOptions;
    this.output = input.output;
  }
}

export class UnsafeRetryError extends Error {
  readonly output: string;

  constructor(input: { output: string }) {
    super(
      "drizzle-kit push failed after DDL execution may have already started; partial schema changes may have been applied. Manual intervention required — refusing to retry automatically.",
    );
    this.name = "UnsafeRetryError";
    this.output = input.output;
  }
}

export class PushTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly output: string;

  constructor(input: { timeoutMs: number; output: string }) {
    super(
      `drizzle-kit push timed out after ${input.timeoutMs}ms with no output/exit.`,
    );
    this.name = "PushTimeoutError";
    this.timeoutMs = input.timeoutMs;
    this.output = input.output;
  }
}

const TABLE_OR_SCHEMA_QUESTION =
  /Is (\S+) (table|schema) created or renamed from another \2\?/g;
const COLUMN_QUESTION =
  /Is (\S+) column in (\S+) table created or renamed from another column\?/g;
const TRUNCATE_QUESTION = /Do you want to truncate (\S+) table\?/gi;

// Matches a rendered option line: a cursor marker ("❯ " or two spaces) then
// "+ <name> create <kind>" or "~ <from> › <to> rename <kind>". Deliberately
// lenient about exact padding/spacing since the precise byte layout wasn't
// verified against a live drizzle-kit run.
const OPTION_LINE = /^\s*❯?\s*[+~]\s/;

type QuestionOccurrence = {
  id: QuestionId;
  matchEnd: number;
  // Truncate prompts are a fixed 2-option select ("No"=0, "Yes, truncate"=1)
  // with no candidate-dependent option block to parse — the count is known
  // upfront, unlike rename/create prompts where it must be parsed from the
  // rendered "+"/"~" lines.
  fixedTotalOptions?: number;
};

const findQuestionOccurrences = (output: string): QuestionOccurrence[] => {
  const occurrences: QuestionOccurrence[] = [];

  for (const match of output.matchAll(TABLE_OR_SCHEMA_QUESTION)) {
    occurrences.push({
      id: `${match[2]}:${match[1]}`,
      matchEnd: (match.index ?? 0) + match[0].length,
    });
  }

  for (const match of output.matchAll(COLUMN_QUESTION)) {
    occurrences.push({
      id: `column:${match[2]}.${match[1]}`,
      matchEnd: (match.index ?? 0) + match[0].length,
    });
  }

  for (const match of output.matchAll(TRUNCATE_QUESTION)) {
    occurrences.push({
      id: `truncate:${match[1]}`,
      matchEnd: (match.index ?? 0) + match[0].length,
      fixedTotalOptions: 2,
    });
  }

  occurrences.sort((a, b) => a.matchEnd - b.matchEnd);
  return occurrences;
};

// Parses the option block (the "+"/"~" lines) immediately after a question
// line, starting at `startOffset`. Only counts complete (newline-terminated)
// lines, so a block that's still streaming in (chunk arrived mid-line)
// returns null rather than an undercount — the caller will see the rest on
// the next chunk and re-parse.
const parseOptionBlock = (
  output: string,
  startOffset: number,
): { totalOptions: number } | null => {
  const rest = output.slice(startOffset);
  const splitLines = rest.split("\n");
  // Drop the last element unconditionally: if `rest` ends with "\n" it's the
  // empty artifact of that trailing newline; otherwise it's a line that
  // hasn't fully arrived yet. Either way it's not a confirmed complete line.
  const completeLines = splitLines.slice(0, -1);

  let count = 0;
  for (const line of completeLines) {
    if (OPTION_LINE.test(line)) {
      count += 1;
    } else if (count === 0 && line.trim() === "") {
      continue;
    } else {
      break;
    }
  }

  return count > 0 ? { totalOptions: count } : null;
};

const ARROW_DOWN = "\x1b[B";

/**
 * Replaces the old blind "always accept the default" prompt answering.
 * For each distinct ambiguous question (identified by its target entity
 * name), tries the next untried option on each call within an attempt, and
 * across attempts via the shared `escalationState`. This includes truncate
 * prompts — cms0's RootSchema is meant to be freely editable (rename/create
 * tables and fields at any time), so a constraint addition that requires
 * truncating a table to apply is a normal, expected outcome of a schema
 * edit the user asked for, not a special case to refuse forever. "No" is
 * still tried first (least destructive, matches the common case where no
 * conflicting data exists), but if that fails, the next attempt escalates
 * to "Yes, truncate" before exhausting like any other ambiguous prompt.
 */
export const resolvePrompts = (
  state: PushOutputState,
  escalationState: AmbiguityEscalationState,
  writeInput: (input: string) => void,
): void => {
  const occurrences = findQuestionOccurrences(state.output);

  for (const { id, matchEnd, fixedTotalOptions } of occurrences) {
    if (state.answeredQuestionIds.has(id)) continue;

    let escalation = escalationState.questions.get(id);
    if (!escalation) {
      escalation = { totalOptions: null, nextIndexToTry: 0, exhausted: false };
      escalationState.questions.set(id, escalation);
    }

    // Already fully exhausted in a prior attempt — nothing valid left to
    // send. Leave it unanswered; the idle/total timeout guardrail will stop
    // a process that hangs waiting on it, and runDbPushSafeOnce checks
    // findExhaustedQuestion() after the attempt to surface a clear error.
    if (escalation.exhausted) continue;

    if (escalation.totalOptions === null) {
      if (fixedTotalOptions !== undefined) {
        escalation.totalOptions = fixedTotalOptions;
      } else {
        const parsed = parseOptionBlock(state.output, matchEnd);
        if (!parsed) continue; // option block hasn't fully arrived yet
        escalation.totalOptions = parsed.totalOptions;
      }
    }

    const indexToTry = escalation.nextIndexToTry;
    writeInput(ARROW_DOWN.repeat(indexToTry) + "\r");

    state.answeredQuestionIds.add(id);
    state.answeredQuestionCount += 1;
    state.lastAnsweredOffset = state.output.length;

    escalation.nextIndexToTry += 1;
    if (escalation.nextIndexToTry >= escalation.totalOptions) {
      escalation.exhausted = true;
    }
  }
};
