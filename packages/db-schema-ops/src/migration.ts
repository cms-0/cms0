import {
  AmbiguityExhaustedError,
  UnsafeRetryError,
  PushTimeoutError,
  createAmbiguityEscalationState,
  findExhaustedQuestion,
  hasDdlExecutionStarted,
  hasFatalOutput,
  hasInteractivePrompt,
  hasTtyRequirementFailure,
  type AmbiguityEscalationState,
} from "./push-output";
import {
  buildDirectNodeArgs,
  buildPnpmPushArgs,
  resolveDrizzleKitBin,
  runDbPushWithNodePty,
  runDbPushWithPipes,
  runDbPushWithScriptTty,
  type PushResult,
  type PushTimeouts,
} from "./push-strategies";

export type RunDbPushSafeOptions = {
  attempts?: number;
  retryDelayMs?: number;
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  configPath?: string;
  cwd?: string;
  env?: Record<string, string>;
  /**
   * @internal Exposed for tests only — overrides the real
   * node-pty/script/pipe strategy chain so retry-loop behavior can be
   * exercised without a real TTY, drizzle-kit binary, or database.
   */
  strategyOverride?: (
    escalationState: AmbiguityEscalationState,
    timeouts: PushTimeouts,
    configPath?: string,
    cwd?: string,
    envOverrides?: Record<string, string>,
  ) => Promise<PushResult>;
};

/**
 * Strategy chain (highest to lowest fidelity):
 *
 *  1. node-pty + direct node   — real PTY; drizzle-kit sees isTTY === true from birth.
 *                                Falls through if node-pty native addon is unavailable
 *                                (e.g. Linux servers without prebuilds).
 *
 *  2. script + direct node     — pseudo-TTY via the OS `script` utility; drizzle-kit
 *                                spawned directly so it inherits the PTY.
 *                                Falls through on script error.
 *
 *  3. pipe + direct node       — stdio: "pipe"; prompts auto-resolved by stdin writes.
 *                                Always available when drizzleBin was resolved.
 *
 *  4. pnpm exec (pipe)         — last resort when drizzle-kit/bin.cjs cannot be found
 *                                in the directory tree (e.g. unusual monorepo layouts).
 *                                Uses pipe; prompts auto-resolved.
 *
 * A PushTimeoutError from any strategy is never swallowed into the next
 * fallback — it propagates immediately, since retrying a hung process with
 * a lower-fidelity transport against a possibly half-applied DB is unsafe.
 */
const runDbPush = async (
  escalationState: AmbiguityEscalationState,
  timeouts: PushTimeouts,
  configPath?: string,
  cwd?: string,
  envOverrides?: Record<string, string>,
): Promise<PushResult> => {
  const workingDir = cwd ?? process.cwd();
  const drizzleBin = resolveDrizzleKitBin(workingDir);

  if (drizzleBin) {
    // Strategy 1 — node-pty + direct node
    try {
      return await runDbPushWithNodePty(
        escalationState,
        timeouts,
        drizzleBin,
        configPath,
        workingDir,
        envOverrides,
      );
    } catch (error) {
      if (error instanceof PushTimeoutError) throw error;
      // node-pty native addon unavailable — continue to script fallback
    }

    const { command, args } = buildDirectNodeArgs(drizzleBin, configPath);

    // Strategy 2 — script + direct node
    try {
      const scriptResult = await runDbPushWithScriptTty(
        escalationState,
        timeouts,
        command,
        args,
        workingDir,
        envOverrides,
      );
      if (!hasTtyRequirementFailure(scriptResult.output)) {
        return scriptResult;
      }
    } catch (error) {
      if (error instanceof PushTimeoutError) throw error;
      // script unavailable or failed — continue to pipe fallback
    }

    // Strategy 3 — pipe + direct node
    return runDbPushWithPipes(
      escalationState,
      timeouts,
      command,
      args,
      workingDir,
      envOverrides,
    );
  }

  // Strategy 4 — pnpm exec (pipe) — drizzleBin not found in directory tree
  const { command, args } = buildPnpmPushArgs(configPath);
  return runDbPushWithPipes(
    escalationState,
    timeouts,
    command,
    args,
    workingDir,
    envOverrides,
  );
};

const resolveAttemptCount = (attempts: number | undefined): number => {
  if (
    typeof attempts === "number" &&
    Number.isInteger(attempts) &&
    attempts > 0
  ) {
    return attempts;
  }
  const parsed = Number.parseInt(process.env.CMS0_DB_PUSH_ATTEMPTS ?? "3", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 3;
};

const resolveRetryDelayMs = (retryDelayMs: number | undefined): number => {
  if (
    typeof retryDelayMs === "number" &&
    Number.isFinite(retryDelayMs) &&
    retryDelayMs >= 0
  ) {
    return retryDelayMs;
  }
  const parsed = Number.parseInt(
    process.env.CMS0_DB_PUSH_RETRY_DELAY_MS ?? "200",
    10,
  );
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 200;
};

const resolveIdleTimeoutMs = (idleTimeoutMs: number | undefined): number => {
  if (
    typeof idleTimeoutMs === "number" &&
    Number.isFinite(idleTimeoutMs) &&
    idleTimeoutMs > 0
  ) {
    return idleTimeoutMs;
  }
  const parsed = Number.parseInt(
    process.env.CMS0_DB_PUSH_IDLE_TIMEOUT_MS ?? "30000",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 30_000;
};

const resolveTotalTimeoutMs = (totalTimeoutMs: number | undefined): number => {
  if (
    typeof totalTimeoutMs === "number" &&
    Number.isFinite(totalTimeoutMs) &&
    totalTimeoutMs > 0
  ) {
    return totalTimeoutMs;
  }
  const parsed = Number.parseInt(
    process.env.CMS0_DB_PUSH_TOTAL_TIMEOUT_MS ?? "300000",
    10,
  );
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300_000;
};

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const runDbPushSafeOnce = async (
  escalationState: AmbiguityEscalationState,
  timeouts: PushTimeouts,
  strategy: (
    escalationState: AmbiguityEscalationState,
    timeouts: PushTimeouts,
    configPath?: string,
    cwd?: string,
    envOverrides?: Record<string, string>,
  ) => Promise<PushResult>,
  configPath?: string,
  cwd?: string,
  envOverrides?: Record<string, string>,
): Promise<void> => {
  const result = await strategy(
    escalationState,
    timeouts,
    configPath,
    cwd,
    envOverrides,
  );

  if (hasTtyRequirementFailure(result.output)) {
    const error = new Error(
      "drizzle-kit push produced an interactive prompt/TTY flow. Run schema apply in a non-interactive deterministic path.",
    ) as Error & { output?: string };
    error.output = result.output;
    throw error;
  }

  if (hasInteractivePrompt(result.output) && result.answeredQuestionCount === 0) {
    const error = new Error(
      "drizzle-kit push showed interactive prompts that were not auto-resolved.",
    ) as Error & { output?: string };
    error.output = result.output;
    throw error;
  }

  if (result.code !== 0 || hasFatalOutput(result.output)) {
    const exhausted = findExhaustedQuestion(escalationState);
    if (exhausted) {
      throw new AmbiguityExhaustedError({
        questionId: exhausted.questionId,
        totalOptions: exhausted.totalOptions,
        output: result.output,
      });
    }

    if (
      result.answeredQuestionCount > 0 &&
      hasDdlExecutionStarted(result.output, result.lastAnsweredOffset)
    ) {
      throw new UnsafeRetryError({ output: result.output });
    }

    const error = new Error(
      `drizzle-kit push failed (code ${result.code ?? "null"}).`,
    ) as Error & { output?: string };
    error.output = result.output;
    throw error;
  }
};

export async function runDbPushSafe(
  options: RunDbPushSafeOptions = {},
): Promise<void> {
  const attempts = resolveAttemptCount(options.attempts);
  const retryDelayMs = resolveRetryDelayMs(options.retryDelayMs);
  const timeouts: PushTimeouts = {
    idleTimeoutMs: resolveIdleTimeoutMs(options.idleTimeoutMs),
    totalTimeoutMs: resolveTotalTimeoutMs(options.totalTimeoutMs),
  };
  // Created once, outside the loop: lets a retried attempt escalate to the
  // next option for a question already seen, instead of repeating the same
  // guess every time.
  const escalationState = createAmbiguityEscalationState();
  const strategy = options.strategyOverride ?? runDbPush;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await runDbPushSafeOnce(
        escalationState,
        timeouts,
        strategy,
        options.configPath,
        options.cwd,
        options.env,
      );
      return;
    } catch (error) {
      // Both are terminal: exhausting a question's options, or detecting
      // that DDL may have already partially applied, means retrying with a
      // different guess is either impossible or unsafe. Stop immediately
      // rather than consuming the rest of the attempts budget.
      if (
        error instanceof AmbiguityExhaustedError ||
        error instanceof UnsafeRetryError
      ) {
        throw error;
      }
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt >= attempts) break;
      console.warn(
        `drizzle-kit push attempt ${attempt}/${attempts} failed; retrying in ${retryDelayMs}ms.`,
      );
      await sleep(retryDelayMs);
    }
  }

  throw (
    lastError ?? new Error("drizzle-kit push failed for an unknown reason.")
  );
}
