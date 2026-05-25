import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const rootDir = process.cwd();
const changesetConfigPath = path.join(rootDir, ".changeset", "config.json");
const changesetConfig = JSON.parse(fs.readFileSync(changesetConfigPath, "utf8"));
const ignoredPackages = new Set(changesetConfig.ignore ?? []);
const expectedPublishablePackages = new Set(["@cms0/cms0", "@cms0/shared"]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function collectPublishablePackages() {
  const workspacePackages = ["packages"]
    .flatMap((baseDir) => {
      const fullBaseDir = path.join(rootDir, baseDir);
      if (!fs.existsSync(fullBaseDir)) return [];
      return fs
        .readdirSync(fullBaseDir)
        .map((entry) => path.join(fullBaseDir, entry))
        .filter((entry) => fs.existsSync(path.join(entry, "package.json")));
    })
    .map((dir) => ({
      dir,
      packageJson: readJson(path.join(dir, "package.json")),
    }));

  for (const { packageJson } of workspacePackages) {
    if (
      packageJson.private !== true &&
      !expectedPublishablePackages.has(packageJson.name)
    ) {
      throw new Error(
        `${packageJson.name}: only @cms0/cms0 and @cms0/shared may be public npm packages`,
      );
    }
  }

  return workspacePackages
    .filter(({ packageJson }) => packageJson.private !== true)
    .filter(({ packageJson }) => expectedPublishablePackages.has(packageJson.name))
    .filter(({ packageJson }) => !ignoredPackages.has(packageJson.name))
    .sort((a, b) => a.packageJson.name.localeCompare(b.packageJson.name));
}

function normalizeRelativePath(value) {
  if (typeof value !== "string") return null;
  if (value.includes("*")) return null;
  if (value.startsWith("./")) return value.slice(2);
  if (value.startsWith("../") || path.isAbsolute(value)) return null;
  return value;
}

function collectExportTargets(value, acc) {
  if (typeof value === "string") {
    const normalized = normalizeRelativePath(value);
    if (normalized) acc.add(normalized);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const nested of Object.values(value)) {
    collectExportTargets(nested, acc);
  }
}

function collectDeclaredArtifactPaths(packageJson) {
  const targets = new Set();
  for (const field of ["main", "module", "types"]) {
    const normalized = normalizeRelativePath(packageJson[field]);
    if (normalized) targets.add(normalized);
  }

  if (typeof packageJson.bin === "string") {
    const normalized = normalizeRelativePath(packageJson.bin);
    if (normalized) targets.add(normalized);
  } else if (packageJson.bin && typeof packageJson.bin === "object") {
    for (const value of Object.values(packageJson.bin)) {
      const normalized = normalizeRelativePath(value);
      if (normalized) targets.add(normalized);
    }
  }

  if (packageJson.exports) collectExportTargets(packageJson.exports, targets);
  return [...targets].sort();
}

function verifyNoWorkspaceProtocols(packageJson, packageName) {
  for (const section of [
    "dependencies",
    "peerDependencies",
    "optionalDependencies",
    "devDependencies",
  ]) {
    const deps = packageJson[section];
    if (!deps || typeof deps !== "object") continue;
    for (const [depName, version] of Object.entries(deps)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        throw new Error(
          `${packageName}: packed package.json still contains workspace protocol in ${section}.${depName}`,
        );
      }
    }
  }
}

function verifyNoRuntimeSourceTypes(packageJson, packageName) {
  const sourceTypePattern = /^\.\/src\/.*\.(c|m)?tsx?$/;

  const checkRuntimeTarget = (value, fieldPath) => {
    if (typeof value !== "string") return;
    if (!sourceTypePattern.test(value)) return;

    throw new Error(
      `${packageName}: packed package.json exposes runtime source TypeScript at ${fieldPath}: ${value}`,
    );
  };

  for (const field of ["main", "module"]) {
    checkRuntimeTarget(packageJson[field], field);
  }

  if (typeof packageJson.bin === "string") {
    checkRuntimeTarget(packageJson.bin, "bin");
  } else if (packageJson.bin && typeof packageJson.bin === "object") {
    for (const [binName, value] of Object.entries(packageJson.bin)) {
      checkRuntimeTarget(value, `bin.${binName}`);
    }
  }

  const visitExport = (value, fieldPath, condition = null) => {
    if (typeof value === "string") {
      if (condition !== "types" && condition !== "style") {
        checkRuntimeTarget(value, fieldPath);
      }
      return;
    }

    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      visitExport(nested, `${fieldPath}.${key}`, key);
    }
  };

  if (packageJson.exports) {
    visitExport(packageJson.exports, "exports");
  }
}

function collectPackedFiles(dir, baseDir = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectPackedFiles(fullPath, baseDir);
    return [path.relative(baseDir, fullPath)];
  });
}

function verifyNoHostedOnlyArtifacts(packedRoot, packageName) {
  for (const relativePath of collectPackedFiles(packedRoot)) {
    if (relativePath.toLowerCase().includes("saas")) {
      throw new Error(
        `${packageName}: packed tarball contains hosted-only artifact ${relativePath}`,
      );
    }
  }
}

function verifyPackedLicenseFile(packedRoot, packageName) {
  const licensePath = path.join(packedRoot, "LICENSE");
  if (!fs.existsSync(licensePath)) {
    throw new Error(`${packageName}: packed tarball is missing LICENSE`);
  }
}

function verifyPublicAccess(packageJson, packageName) {
  if (packageJson.publishConfig?.access !== "public") {
    throw new Error(
      `${packageName}: publishConfig.access must be public for npm publishing`,
    );
  }
}

function verifyPackageTarball({ dir, packageJson }) {
  const packageName = packageJson.name;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cms0-pack-"));
  const extractDir = path.join(tempDir, "extract");

  try {
    fs.mkdirSync(extractDir, { recursive: true });

    execFileSync(
      "pnpm",
      [
        "pack",
        "--json",
        "--config.ignore-scripts=true",
        "--pack-destination",
        tempDir,
      ],
      {
        cwd: dir,
        stdio: "pipe",
        encoding: "utf8",
      },
    );

    const tarballName = fs
      .readdirSync(tempDir)
      .find((entry) => entry.endsWith(".tgz"));
    if (!tarballName) {
      throw new Error(`${packageName}: pack did not produce a tarball`);
    }

    const tarballPath = path.join(tempDir, tarballName);
    execFileSync("tar", ["-xzf", tarballPath, "-C", extractDir], {
      stdio: "pipe",
      encoding: "utf8",
    });

    const packedRoot = path.join(extractDir, "package");
    const packedPackageJson = readJson(path.join(packedRoot, "package.json"));
    verifyPublicAccess(packedPackageJson, packageName);
    verifyNoWorkspaceProtocols(packedPackageJson, packageName);
    verifyNoRuntimeSourceTypes(packedPackageJson, packageName);
    verifyNoHostedOnlyArtifacts(packedRoot, packageName);
    verifyPackedLicenseFile(packedRoot, packageName);

    for (const target of collectDeclaredArtifactPaths(packedPackageJson)) {
      const filePath = path.join(packedRoot, target);
      if (!fs.existsSync(filePath)) {
        throw new Error(
          `${packageName}: packed tarball is missing declared artifact ${target}`,
        );
      }
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log(`verified ${packageName}`);
}

const packages = collectPublishablePackages();
if (!packages.length) {
  console.log("No publishable packages found.");
  process.exit(0);
}

for (const pkg of packages) {
  verifyPackageTarball(pkg);
}

console.log(`Verified ${packages.length} publishable packages.`);
