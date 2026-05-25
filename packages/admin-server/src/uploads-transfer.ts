import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type {
  UploadsTransferExportArchive,
  UploadsTransferImportResponse,
  UploadsTransferPreflightResponse,
} from "@cms0/admin-contract";
import { getAssetLogicalPath, inferAssetKindFromFilename } from "@cms0/shared";
import type { StorageDriverAdapter } from "./storage-driver";

export type UploadsTransferAdapter = {
  export(): Promise<UploadsTransferExportArchive>;
  preflight(archive: Buffer): Promise<UploadsTransferPreflightResponse>;
  import(archive: Buffer): Promise<UploadsTransferImportResponse>;
};

type FileEntry = { path: string; size: number };

function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function getTarBinary(): string {
  return process.env.CMS0_TAR_BIN?.trim() ?? "tar";
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code: number | null) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      if (code === 0) resolve({ stdout, stderr });
      else
        reject(
          new Error(`${command} ${args.join(" ")} failed: ${stderr || stdout}`),
        );
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = path.join(os.tmpdir(), `cms0-uploads-${randomUUID()}`);
  await fs.mkdir(dir, { recursive: true });
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function createTarFromFiles(
  sourceDir: string,
  files: string[],
): Promise<Buffer> {
  const tar = getTarBinary();
  return withTempDir(async (tmp) => {
    const archive = path.join(tmp, "export.tar.gz");
    if (files.length === 0) {
      const empty = path.join(tmp, "empty");
      await fs.mkdir(empty, { recursive: true });
      await runCommand(tar, ["-czf", archive, "-C", empty, "."]);
    } else {
      const listFile = path.join(tmp, "files.txt");
      await fs.writeFile(listFile, files.join("\n") + "\n", "utf8");
      await runCommand(tar, ["-czf", archive, "-C", sourceDir, "-T", listFile]);
    }
    return fs.readFile(archive);
  });
}

async function extractTarToDir(
  archivePath: string,
  destDir: string,
): Promise<void> {
  await runCommand(getTarBinary(), ["-xzf", archivePath, "-C", destDir]);
}

async function collectFiles(dir: string): Promise<FileEntry[]> {
  const results: FileEntry[] = [];
  async function walk(current: string) {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const rel = path.relative(dir, abs).replace(/\\/g, "/");
      if (entry.isDirectory()) await walk(abs);
      else if (entry.isFile()) {
        const stat = await fs.stat(abs);
        results.push({ path: rel, size: stat.size });
      }
    }
  }
  await walk(dir);
  results.sort((a, b) => a.path.localeCompare(b.path));
  return results;
}

function normalizeArchivePath(raw: string): string | null {
  const cleaned = raw.replace(/\\/g, "/").trim();
  if (!cleaned || cleaned.startsWith("/") || cleaned.includes("\0"))
    return null;
  const normalized = path.posix.normalize(cleaned);
  if (!normalized || normalized === "." || normalized.startsWith("../"))
    return null;
  if (normalized.split("/").some((s) => s === "..")) return null;
  if (!normalized.includes("/")) {
    return getAssetLogicalPath(
      inferAssetKindFromFilename(normalized),
      normalized,
    );
  }
  return normalized;
}

export function createUploadsTransferAdapter(
  storage: StorageDriverAdapter,
  options: { maxImportBytes?: number } = {},
): UploadsTransferAdapter {
  const maxImportBytes = options.maxImportBytes ?? 1024 * 1024 * 1024; // 1GB default

  return {
    async export() {
      const files = await storage.list("");
      return withTempDir(async (tmp) => {
        const sourceDir = path.join(tmp, "source");
        await fs.mkdir(sourceDir, { recursive: true });
        for (const file of files) {
          const data = await storage.read(file.path);
          const outPath = path.join(sourceDir, ...file.path.split("/"));
          await fs.mkdir(path.dirname(outPath), { recursive: true });
          await fs.writeFile(outPath, data);
        }
        const relPaths = files.map((f) => f.path);
        const data = await createTarFromFiles(sourceDir, relPaths);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return {
          checksum: computeSha256(data),
          data: new Uint8Array(data),
          fileCount: files.length,
          fileName: `cms0-uploads-export-${stamp}-${randomUUID()}.tar.gz`,
          sizeBytes: data.byteLength,
        };
      });
    },

    async preflight(archiveBuffer) {
      if (!archiveBuffer.byteLength) {
        throw new Error("Uploads archive is empty.");
      }
      if (archiveBuffer.byteLength > maxImportBytes) {
        throw new Error(
          `Uploads archive exceeds maximum size (${archiveBuffer.byteLength} > ${maxImportBytes}).`,
        );
      }

      return withTempDir(async (tmp) => {
        const archivePath = path.join(tmp, "archive.tar.gz");
        await fs.writeFile(archivePath, archiveBuffer);
        const extractDir = path.join(tmp, "extracted");
        await fs.mkdir(extractDir, { recursive: true });
        await extractTarToDir(archivePath, extractDir);
        const extractedFiles = await collectFiles(extractDir);

        const existingFiles = await storage.list("");
        const existingByPath = new Map(
          existingFiles.map((f) => [f.path, f.size]),
        );

        const conflicts: string[] = [];
        const excluded: string[] = [];
        let toCreate = 0;
        let toReplace = 0;

        for (const file of extractedFiles) {
          const normalized = normalizeArchivePath(file.path);
          if (!normalized) {
            conflicts.push(file.path);
            continue;
          }
          const existingSize = existingByPath.get(normalized);
          if (existingSize === undefined) {
            toCreate++;
          } else if (existingSize !== file.size) {
            conflicts.push(normalized);
          } else {
            toReplace++;
          }
        }

        return {
          conflicts,
          excluded,
          fileCount: extractedFiles.length,
          ok: true,
          toCreate,
          toReplace,
          toSkipConflict: conflicts.length,
          toSkipExcluded: excluded.length,
          totalBytes: extractedFiles.reduce((sum, f) => sum + f.size, 0),
        };
      });
    },

    async import(archiveBuffer) {
      return withTempDir(async (tmp) => {
        const archivePath = path.join(tmp, "archive.tar.gz");
        await fs.writeFile(archivePath, archiveBuffer);
        const extractDir = path.join(tmp, "extracted");
        await fs.mkdir(extractDir, { recursive: true });
        await extractTarToDir(archivePath, extractDir);
        const extractedFiles = await collectFiles(extractDir);

        const existingFiles = await storage.list("");
        const existingByPath = new Map(
          existingFiles.map((f) => [f.path, f.size]),
        );

        const created: string[] = [];
        const replaced: string[] = [];
        const skippedConflict: string[] = [];
        const skippedExcluded: string[] = [];

        for (const file of extractedFiles) {
          const normalized = normalizeArchivePath(file.path);
          if (!normalized) {
            skippedConflict.push(file.path);
            continue;
          }
          const existingSize = existingByPath.get(normalized);
          if (existingSize !== undefined && existingSize !== file.size) {
            skippedConflict.push(normalized);
            continue;
          }

          const data = await fs.readFile(path.join(extractDir, file.path));
          await storage.write(normalized, data);
          if (existingSize === undefined) {
            created.push(normalized);
          } else {
            replaced.push(normalized);
          }
        }

        const toCreate = created.length;
        const toReplace = replaced.length;
        const toSkipConflict = skippedConflict.length;
        const toSkipExcluded = skippedExcluded.length;

        return {
          conflicts: skippedConflict,
          created,
          excluded: skippedExcluded,
          fileCount: extractedFiles.length,
          ok: true,
          replaced,
          skippedConflict,
          skippedExcluded,
          toCreate,
          toReplace,
          toSkipConflict,
          toSkipExcluded,
          totalBytes: extractedFiles.reduce((sum, f) => sum + f.size, 0),
        };
      });
    },
  };
}
