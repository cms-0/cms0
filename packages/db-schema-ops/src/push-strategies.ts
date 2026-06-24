import { spawn } from "node:child_process";
import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import {
  appendOutput,
  createPushOutputState,
  resolvePrompts,
  PushTimeoutError,
  type AmbiguityEscalationState,
} from "./push-output";

export type PushResult = {
  code: number | null;
  answeredQuestionCount: number;
  lastAnsweredOffset: number;
  output: string;
};

export type PushTimeouts = {
  idleTimeoutMs: number;
  totalTimeoutMs: number;
};

type NodePtyModule = typeof import("node-pty");

const requireFromHere = createRequire(import.meta.url);

const loadNodePty = (): NodePtyModule =>
  requireFromHere("node-pty") as NodePtyModule;

export const resolveDrizzleKitBin = (cwd: string): string | null => {
  let dir = cwd;
  while (true) {
    const candidate = join(dir, "node_modules", "drizzle-kit", "bin.cjs");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
};

export const ensureNodePtyHelperExecutable = (cwd: string): void => {
  let dir = cwd;
  while (true) {
    const helperPath = join(
      dir,
      "node_modules",
      "node-pty",
      "prebuilds",
      `${process.platform}-${process.arch}`,
      "spawn-helper",
    );
    if (existsSync(helperPath)) {
      try {
        const stat = statSync(helperPath);
        if (!(stat.mode & 0o111)) {
          chmodSync(helperPath, 0o755);
        }
      } catch {
        // ignore — spawn will fail and be caught by the caller
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) return;
    dir = parent;
  }
};

const resolveScriptBinary = (): string => {
  const candidates = ["/usr/bin/script", "/bin/script", "script"];
  return candidates.find((c) => (c.includes("/") ? existsSync(c) : true))!;
};

const shellEscape = (value: string): string => {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
};

const buildScriptArgs = (command: string, args: string[]): string[] => {
  if (process.platform === "darwin") {
    return ["-q", "/dev/null", command, ...args];
  }
  const commandLine = [command, ...args].map(shellEscape).join(" ");
  return ["-q", "-c", commandLine, "/dev/null"];
};

export const buildPnpmPushArgs = (
  configPath?: string,
): { command: string; args: string[] } => {
  const pnpmExecPath = process.env.npm_execpath?.trim() || null;
  const pnpmArgs = [
    "exec",
    "drizzle-kit",
    "push",
    ...(configPath ? ["--config", configPath] : []),
    "--verbose",
    "--force",
  ];
  const command = pnpmExecPath ? process.execPath : "pnpm";
  const args = pnpmExecPath ? [pnpmExecPath, ...pnpmArgs] : pnpmArgs;
  return { command, args };
};

export const buildDirectNodeArgs = (
  drizzleBin: string,
  configPath?: string,
): { command: string; args: string[] } => ({
  command: process.execPath,
  args: [
    drizzleBin,
    "push",
    "--verbose",
    "--force",
    ...(configPath ? ["--config", configPath] : []),
  ],
});

const toPushResult = (
  state: ReturnType<typeof createPushOutputState>,
  code: number | null,
): PushResult => ({
  code,
  answeredQuestionCount: state.answeredQuestionCount,
  lastAnsweredOffset: state.lastAnsweredOffset,
  output: state.output,
});

export const runDbPushWithNodePty = async (
  escalationState: AmbiguityEscalationState,
  timeouts: PushTimeouts,
  drizzleBin: string,
  configPath: string | undefined,
  cwd: string,
  envOverrides?: Record<string, string>,
): Promise<PushResult> => {
  ensureNodePtyHelperExecutable(cwd);
  const pty = loadNodePty();
  return new Promise<PushResult>((resolve, reject) => {
    const ptyProcess = pty.spawn(
      process.execPath,
      [
        drizzleBin,
        "push",
        "--verbose",
        "--force",
        ...(configPath ? ["--config", configPath] : []),
      ],
      {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd,
        env: {
          ...process.env,
          ...envOverrides,
          TERM: "xterm-256color",
        },
      },
    );

    const state = createPushOutputState();
    let settled = false;
    let idleTimer: NodeJS.Timeout;

    const clearTimers = (): void => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    };

    const failWithTimeout = (timeoutMs: number): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      ptyProcess.kill();
      reject(new PushTimeoutError({ timeoutMs, output: state.output }));
    };

    const totalTimer = setTimeout(
      () => failWithTimeout(timeouts.totalTimeoutMs),
      timeouts.totalTimeoutMs,
    );
    idleTimer = setTimeout(
      () => failWithTimeout(timeouts.idleTimeoutMs),
      timeouts.idleTimeoutMs,
    );

    ptyProcess.onData((data) => {
      if (settled) return;
      process.stdout.write(data);
      appendOutput(state, data);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => failWithTimeout(timeouts.idleTimeoutMs),
        timeouts.idleTimeoutMs,
      );
      resolvePrompts(state, escalationState, (input) => ptyProcess.write(input));
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(toPushResult(state, exitCode));
    });
  });
};

export const runDbPushWithScriptTty = (
  escalationState: AmbiguityEscalationState,
  timeouts: PushTimeouts,
  command: string,
  args: string[],
  cwd: string,
  envOverrides?: Record<string, string>,
): Promise<PushResult> => {
  const scriptBinary = resolveScriptBinary();
  return new Promise<PushResult>((resolve, reject) => {
    const child = spawn(scriptBinary, buildScriptArgs(command, args), {
      cwd,
      env: {
        ...process.env,
        ...envOverrides,
        TERM: process.env.TERM || "xterm-256color",
      },
      stdio: "pipe",
    });

    const state = createPushOutputState();
    let settled = false;
    let idleTimer: NodeJS.Timeout;

    const clearTimers = (): void => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    };

    const failWithTimeout = (timeoutMs: number): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      child.kill();
      reject(new PushTimeoutError({ timeoutMs, output: state.output }));
    };

    const totalTimer = setTimeout(
      () => failWithTimeout(timeouts.totalTimeoutMs),
      timeouts.totalTimeoutMs,
    );
    idleTimer = setTimeout(
      () => failWithTimeout(timeouts.idleTimeoutMs),
      timeouts.idleTimeoutMs,
    );

    const onChunk = (data: unknown): void => {
      if (settled) return;
      const chunk = String(data);
      process.stdout.write(chunk);
      appendOutput(state, chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => failWithTimeout(timeouts.idleTimeoutMs),
        timeouts.idleTimeoutMs,
      );
      resolvePrompts(state, escalationState, (input) => child.stdin.write(input));
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    child.on("error", (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(toPushResult(state, code));
    });
  });
};

export const runDbPushWithPipes = (
  escalationState: AmbiguityEscalationState,
  timeouts: PushTimeouts,
  command: string,
  args: string[],
  cwd: string,
  envOverrides?: Record<string, string>,
): Promise<PushResult> =>
  new Promise<PushResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: envOverrides ? { ...process.env, ...envOverrides } : process.env,
      stdio: "pipe",
    });

    const state = createPushOutputState();
    let settled = false;
    let idleTimer: NodeJS.Timeout;

    const clearTimers = (): void => {
      clearTimeout(idleTimer);
      clearTimeout(totalTimer);
    };

    const failWithTimeout = (timeoutMs: number): void => {
      if (settled) return;
      settled = true;
      clearTimers();
      child.kill();
      reject(new PushTimeoutError({ timeoutMs, output: state.output }));
    };

    const totalTimer = setTimeout(
      () => failWithTimeout(timeouts.totalTimeoutMs),
      timeouts.totalTimeoutMs,
    );
    idleTimer = setTimeout(
      () => failWithTimeout(timeouts.idleTimeoutMs),
      timeouts.idleTimeoutMs,
    );

    const onChunk = (data: unknown): void => {
      if (settled) return;
      const chunk = String(data);
      process.stdout.write(chunk);
      appendOutput(state, chunk);
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () => failWithTimeout(timeouts.idleTimeoutMs),
        timeouts.idleTimeoutMs,
      );
      resolvePrompts(state, escalationState, (input) => child.stdin.write(input));
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    child.on("error", (error: unknown) => {
      if (settled) return;
      settled = true;
      clearTimers();
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimers();
      resolve(toPushResult(state, code));
    });
  });
