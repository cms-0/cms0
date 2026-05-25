// Write the generated descriptor to disk, handling permission failures gracefully.
import { FullDescriptor } from "@cms0/shared";
import fs from "fs";
import path from "path";
import { descriptorOutputPaths, resolveLocalDescriptorOutputPaths } from "./paths.js";
import type { ResolvedConfig } from "./types.js";

type BrowserDescriptorTarget = "sidecar" | "bundle";

const FALLBACK_DESCRIPTOR = {
  models: {},
  roots: {},
  metadata: {
    __cms0Fallback: true,
  },
} as const;

const LOCAL_GENERATED_STATE_GITIGNORE = "*\n";

function safeWrite(outputPath: string, output: string) {
  try {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, "utf8");
  } catch (err: any) {
    if (err?.code === "EPERM" || err?.code === "EACCES") {
      console.warn(
        `cms0: skipped writing descriptor (no write permission): ${outputPath}`,
      );
    } else {
      throw err;
    }
  }
}

function createCjsOutput(descriptor: FullDescriptor) {
  return `// Auto-generated schema descriptor\nexports.schemaDescriptor = ${JSON.stringify(
    descriptor,
    null,
    2,
  )};\n`;
}

function createJsonOutput(descriptor: FullDescriptor) {
  return `${JSON.stringify(descriptor, null, 2)}\n`;
}

function createEsmOutput(descriptor: FullDescriptor | typeof FALLBACK_DESCRIPTOR) {
  return `// Auto-generated schema descriptor\nexport const schemaDescriptor = ${JSON.stringify(
    descriptor,
    null,
    2,
  )};\n`;
}

function createLocalSchemaDescriptorTsOutput(descriptor: FullDescriptor) {
  return `// Auto-generated schema descriptor\nexport const schemaDescriptor = ${JSON.stringify(
    descriptor,
    null,
    2,
  )} as const;\n`;
}

function createGeneratedTypesOutput() {
  return `// Auto-generated cms0 type augmentation\nimport type {\n  Cms0InferDescriptorModels,\n  Cms0InferDescriptorRoots,\n} from "@cms0/cms0";\nimport type { schemaDescriptor } from "./schema-descriptor";\n\ntype Cms0GeneratedModels = Cms0InferDescriptorModels<typeof schemaDescriptor.models>;\ntype Cms0GeneratedRoots = Cms0InferDescriptorRoots<\n  typeof schemaDescriptor.roots,\n  Cms0GeneratedModels\n>;\n\ndeclare module "@cms0/cms0" {\n  interface Cms0GeneratedTypes {\n    models: Cms0GeneratedModels;\n    roots: Cms0GeneratedRoots;\n  }\n}\n\nexport {};\n`;
}

function writeBundledDescriptorProjection(
  descriptor: FullDescriptor | typeof FALLBACK_DESCRIPTOR,
) {
  safeWrite(descriptorOutputPaths.esmJs, createEsmOutput(descriptor));
  safeWrite(descriptorOutputPaths.cjsJs, createCjsOutput(descriptor as FullDescriptor));
}

function writeDescriptorFiles(
  resolved: ResolvedConfig,
  descriptor: FullDescriptor,
  browserTarget: BrowserDescriptorTarget = "sidecar",
) {
  const localDescriptorOutputPaths = resolveLocalDescriptorOutputPaths(
    resolved.projectRoot,
  );

  safeWrite(
    localDescriptorOutputPaths.gitignore,
    LOCAL_GENERATED_STATE_GITIGNORE,
  );
  safeWrite(localDescriptorOutputPaths.json, createJsonOutput(descriptor));
  safeWrite(
    localDescriptorOutputPaths.sourceTs,
    createLocalSchemaDescriptorTsOutput(descriptor),
  );
  safeWrite(localDescriptorOutputPaths.cjsJs, createCjsOutput(descriptor));
  safeWrite(localDescriptorOutputPaths.typesDts, createGeneratedTypesOutput());
  writeBundledDescriptorProjection(
    browserTarget === "bundle" ? descriptor : FALLBACK_DESCRIPTOR,
  );
}

export { FALLBACK_DESCRIPTOR, writeDescriptorFiles };
