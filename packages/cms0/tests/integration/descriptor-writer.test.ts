import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { writeDescriptorFiles } from "../../src/libs/cli/descriptor-writer.js";
import { descriptorOutputPaths } from "../../src/libs/cli/paths.js";
import type { ResolvedConfig } from "../../src/libs/cli/types.js";
import type { FullDescriptor } from "@cms0/shared";

function createTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function statSnapshot(targetPath: string) {
  if (!fs.existsSync(targetPath)) {
    return null;
  }

  const stat = fs.statSync(targetPath);
  return {
    mtimeMs: stat.mtimeMs,
    contents: fs.readFileSync(targetPath, "utf8"),
  };
}

function restoreSnapshot(
  targetPath: string,
  snapshot: { contents: string } | null,
) {
  if (!snapshot) {
    fs.rmSync(targetPath, { force: true });
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, snapshot.contents, "utf8");
}

test("writeDescriptorFiles writes local outputs and resets bundled browser descriptors in sidecar mode", () => {
  const projectRoot = createTempDir("cms0-descriptor-writer-");
  const descriptor: FullDescriptor = {
    models: {},
    roots: {
      HomePage: {
        type: "object",
        optional: false,
        nullable: false,
        properties: {
          headline: {
            kind: "primitive",
            type: "string",
            optional: false,
            nullable: false,
          },
        },
      },
    },
  };
  const resolved: ResolvedConfig = {
    configPath: path.join(projectRoot, "cms0.config.ts"),
    entryFile: path.join(projectRoot, "src/data/cms0.ts"),
    projectRoot,
  };
  const packageOutputBefore = {
    sourceTs: statSnapshot(descriptorOutputPaths.sourceTs),
    esmJs: statSnapshot(descriptorOutputPaths.esmJs),
    cjsJs: statSnapshot(descriptorOutputPaths.cjsJs),
  };

  try {
    writeDescriptorFiles(resolved, descriptor);

    const localJsonPath = path.join(
      projectRoot,
      ".cms0/generated/schema-descriptor.json",
    );
    const localCjsPath = path.join(
      projectRoot,
      ".cms0/generated/schema-descriptor.cjs",
    );
    const localTsPath = path.join(
      projectRoot,
      ".cms0/generated/schema-descriptor.ts",
    );
    const localTypesPath = path.join(projectRoot, ".cms0/generated/types.d.ts");
    const localGitignorePath = path.join(projectRoot, ".cms0/.gitignore");

    assert.equal(fs.existsSync(localGitignorePath), true);
    assert.equal(fs.existsSync(localJsonPath), true);
    assert.equal(fs.existsSync(localCjsPath), true);
    assert.equal(fs.existsSync(localTsPath), true);
    assert.equal(fs.existsSync(localTypesPath), true);
    assert.equal(fs.readFileSync(localGitignorePath, "utf8"), "*\n");
    assert.deepEqual(
      JSON.parse(fs.readFileSync(localJsonPath, "utf8")),
      descriptor,
    );
    assert.match(
      fs.readFileSync(localCjsPath, "utf8"),
      /exports\.schemaDescriptor =/,
    );
    assert.match(
      fs.readFileSync(localTsPath, "utf8"),
      /export const schemaDescriptor =/,
    );
    assert.match(fs.readFileSync(localTsPath, "utf8"), / as const;/);
    assert.match(
      fs.readFileSync(localTypesPath, "utf8"),
      /declare module "@cms0\/cms0"/,
    );
    assert.match(
      fs.readFileSync(localTypesPath, "utf8"),
      /interface Cms0GeneratedTypes/,
    );

    const esmProjection = fs.readFileSync(descriptorOutputPaths.esmJs, "utf8");
    const cjsProjection = fs.readFileSync(descriptorOutputPaths.cjsJs, "utf8");
    assert.match(esmProjection, /"__cms0Fallback": true/);
    assert.match(cjsProjection, /"__cms0Fallback": true/);
  } finally {
    restoreSnapshot(descriptorOutputPaths.sourceTs, packageOutputBefore.sourceTs);
    restoreSnapshot(descriptorOutputPaths.esmJs, packageOutputBefore.esmJs);
    restoreSnapshot(descriptorOutputPaths.cjsJs, packageOutputBefore.cjsJs);
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("writeDescriptorFiles writes bundled browser projection in build mode", () => {
  const projectRoot = createTempDir("cms0-descriptor-bundle-writer-");
  const descriptor: FullDescriptor = {
    models: {},
    roots: {
      AboutUsPage: {
        type: "object",
        optional: false,
        nullable: false,
        properties: {
          headline: {
            kind: "primitive",
            type: "string",
            optional: false,
            nullable: false,
          },
        },
      },
    },
  };
  const resolved: ResolvedConfig = {
    configPath: path.join(projectRoot, "cms0.config.ts"),
    entryFile: path.join(projectRoot, "src/data/cms0.ts"),
    projectRoot,
  };
  const packageOutputBefore = {
    sourceTs: statSnapshot(descriptorOutputPaths.sourceTs),
    esmJs: statSnapshot(descriptorOutputPaths.esmJs),
    cjsJs: statSnapshot(descriptorOutputPaths.cjsJs),
  };

  try {
    writeDescriptorFiles(resolved, descriptor, "bundle");

    const esmProjection = fs.readFileSync(descriptorOutputPaths.esmJs, "utf8");
    const cjsProjection = fs.readFileSync(descriptorOutputPaths.cjsJs, "utf8");
    assert.match(esmProjection, /AboutUsPage/);
    assert.match(cjsProjection, /AboutUsPage/);
    assert.doesNotMatch(esmProjection, /"__cms0Fallback": true/);
    assert.doesNotMatch(cjsProjection, /"__cms0Fallback": true/);
  } finally {
    restoreSnapshot(descriptorOutputPaths.sourceTs, packageOutputBefore.sourceTs);
    restoreSnapshot(descriptorOutputPaths.esmJs, packageOutputBefore.esmJs);
    restoreSnapshot(descriptorOutputPaths.cjsJs, packageOutputBefore.cjsJs);
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});
