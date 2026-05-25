import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDescriptorAlt } from "../../src/libs/cli/descriptor-builder-alt.js";

function writeFile(filePath: string, contents: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

test("promotes exported shared schema models outside the entry directory", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cms0-descriptor-shared-models-"),
  );

  const sharedSchemaPath = path.join(tempDir, "packages/example-site/schema.ts");
  const unrelatedSchemaPath = path.join(
    tempDir,
    "packages/unrelated/schema.ts",
  );
  const entryPath = path.join(tempDir, "examples/client/src/data/cms0.ts");

  writeFile(
    sharedSchemaPath,
    `
export type SecurityFeature = {
  title: string;
  description: string;
};

export type RootSchema = {
  HomePage: {
    securitySection: {
      features: SecurityFeature[];
    };
  };
};
`,
  );

  writeFile(
    unrelatedSchemaPath,
    `
export type SecurityFeature = {
  unexpected: boolean;
};
`,
  );

  writeFile(
    entryPath,
    `
declare function cms0<T>(options: unknown): unknown;
import type { RootSchema } from "../../../../packages/example-site/schema";

export const data = cms0<RootSchema>({
  locales: ["en"],
  defaultLocale: "en",
});
`,
  );

  const descriptor = buildDescriptorAlt({
    configPath: path.join(tempDir, "examples/client/cms0.config.ts"),
    entryFile: entryPath,
  });

  const features = (descriptor.roots.HomePage as any).properties.securitySection
    .properties.features;

  assert.deepEqual(features, {
    type: "array",
    items: {
      kind: "modelRef",
      model: "SecurityFeature",
      optional: false,
      nullable: false,
    },
    optional: false,
    nullable: false,
  });

  assert.ok(descriptor.models.SecurityFeature);
  assert.deepEqual(
    Object.keys((descriptor.models.SecurityFeature as any).properties),
    ["title", "description"],
  );
  assert.equal(
    (descriptor.models.SecurityFeature as any).properties.unexpected,
    undefined,
  );
});
