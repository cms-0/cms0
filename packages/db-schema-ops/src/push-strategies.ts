import { spawn } from "node:child_process";
import { chmodSync, existsSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import {
  appendOutput,
  autoResolvePrompts,
  createPushOutputState,
} from "./push-output";

export type PushResult = {
  code: number | null;
  handledColumnPrompts: number;
  handledRenamePrompts: number;
  handledTruncatePrompts: number;
  output: string;
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

export const runDbPushWithNodePty = async (
  drizzleBin: string,
  configPath: string | undefined,
  cwd: string,
  envOverrides?: Record<string, string>,
): Promise<PushResult> => {
  ensureNodePtyHelperExecutable(cwd);
  const pty = loadNodePty();
  return new Promise<PushResult>((resolve) => {
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

    ptyProcess.onData((data) => {
      process.stdout.write(data);
      appendOutput(state, data);
      autoResolvePrompts(state, (input) => ptyProcess.write(input));
    });

    ptyProcess.onExit(({ exitCode }) => {
      resolve({
        code: exitCode,
        handledColumnPrompts: state.handledColumnPrompts,
        handledRenamePrompts: state.handledRenamePrompts,
        handledTruncatePrompts: state.handledTruncatePrompts,
        output: state.output,
      });
    });
  });
};

export const runDbPushWithScriptTty = (
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

    child.stdout.on("data", (data: unknown) => {
      const chunk = String(data);
      process.stdout.write(chunk);
      appendOutput(state, chunk);
      autoResolvePrompts(state, (input) => child.stdin.write(input));
    });

    child.stderr.on("data", (data: unknown) => {
      const chunk = String(data);
      process.stderr.write(chunk);
      appendOutput(state, chunk);
      autoResolvePrompts(state, (input) => child.stdin.write(input));
    });

    child.on("error", (error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code: number | null) => {
      resolve({
        code,
        handledColumnPrompts: state.handledColumnPrompts,
        handledRenamePrompts: state.handledRenamePrompts,
        handledTruncatePrompts: state.handledTruncatePrompts,
        output: state.output,
      });
    });
  });
};

export const runDbPushWithPipes = (
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

    child.stdout.on("data", (data: unknown) => {
      const chunk = String(data);
      process.stdout.write(chunk);
      appendOutput(state, chunk);
      autoResolvePrompts(state, (input) => child.stdin.write(input));
    });

    child.stderr.on("data", (data: unknown) => {
      const chunk = String(data);
      process.stderr.write(chunk);
      appendOutput(state, chunk);
      autoResolvePrompts(state, (input) => child.stdin.write(input));
    });

    child.on("error", (error: unknown) => {
      reject(error instanceof Error ? error : new Error(String(error)));
    });

    child.on("exit", (code: number | null) => {
      resolve({
        code,
        handledColumnPrompts: state.handledColumnPrompts,
        handledRenamePrompts: state.handledRenamePrompts,
        handledTruncatePrompts: state.handledTruncatePrompts,
        output: state.output,
      });
    });
  });
