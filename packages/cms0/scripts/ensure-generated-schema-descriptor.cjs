const fs = require("node:fs");
const path = require("node:path");

const outputPath = path.join(
  __dirname,
  "..",
  "src",
  "generated",
  "schema-descriptor.ts",
);

const existed = fs.existsSync(outputPath);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `// Auto-generated fallback schema descriptor
export const schemaDescriptor = {
  models: {},
  roots: {},
  metadata: {
    __cms0Fallback: true,
  },
} as const;
`,
  "utf8",
);

if (!existed) {
  console.warn(`cms0: created fallback descriptor at ${outputPath}`);
}
