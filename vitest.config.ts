import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

const fromRoot = (...segments: string[]) => path.resolve(repoRoot, ...segments);

const workspaceAliases = [
  { find: /^@cms0\/cms0$/, replacement: fromRoot("packages/cms0/src/index.ts") },
  { find: /^@cms0\/cms0\/config$/, replacement: fromRoot("packages/cms0/src/config.ts") },
  { find: /^@cms0\/cms0\/provenance$/, replacement: fromRoot("packages/cms0/src/provenance.ts") },
  {
    find: /^@cms0\/cms0\/generated\/schema-descriptor$/,
    replacement: fromRoot("packages/cms0/src/generated/schema-descriptor.ts"),
  },
  {
    find: /^@cms0\/cms0\/schema-descriptors$/,
    replacement: fromRoot("packages/cms0/src/schema-descriptors.ts"),
  },
  {
    find: /^@cms0\/cms0\/custom-types$/,
    replacement: fromRoot("packages/cms0/src/custom-types/index.ts"),
  },
  {
    find: /^@cms0\/cms0\/libs\/cli$/,
    replacement: fromRoot("packages/cms0/src/libs/cli/index.ts"),
  },
  { find: /^@cms0\/admin-client$/, replacement: fromRoot("packages/admin-client/src/index.ts") },
  { find: /^@cms0\/admin-contract$/, replacement: fromRoot("packages/admin-contract/src/index.ts") },
  { find: /^@cms0\/admin-server$/, replacement: fromRoot("packages/admin-server/src/index.ts") },
  { find: /^@cms0\/api-docs$/, replacement: fromRoot("packages/api-docs/src/index.ts") },
  { find: /^@cms0\/auth$/, replacement: fromRoot("packages/auth/src/index.ts") },
  { find: /^@cms0\/auth\/client$/, replacement: fromRoot("packages/auth/src/client.ts") },
  { find: /^@cms0\/auth\/permissions$/, replacement: fromRoot("packages/auth/src/permissions.ts") },
  { find: /^@cms0\/db-schema-ops$/, replacement: fromRoot("packages/db-schema-ops/src/index.ts") },
  { find: /^@cms0\/shared$/, replacement: fromRoot("packages/shared/src/index.ts") },
  { find: /^@cms0\/transactional$/, replacement: fromRoot("packages/transactional/src/index.ts") },
  { find: /^@cms0\/ui$/, replacement: fromRoot("packages/ui/src/index.ts") },
] as const;

const baseTest = {
  clearMocks: true,
  exclude: [...configDefaults.exclude, "e2e/**", "node_modules/**"],
  restoreMocks: true,
};

function nodeProject(
  name: string,
  projectRoot: string,
  include: string[],
  aliases: ReadonlyArray<{ find: string | RegExp; replacement: string }> = [],
) {
  return {
    root: fromRoot(projectRoot),
    resolve: {
      alias: [...aliases, ...workspaceAliases],
    },
    test: {
      ...baseTest,
      environment: "node",
      include,
      name,
    },
  };
}

function reactProject(
  name: string,
  projectRoot: string,
  include: string[],
  aliases: ReadonlyArray<{ find: string | RegExp; replacement: string }> = [],
) {
  return {
    root: fromRoot(projectRoot),
    resolve: {
      alias: [...aliases, ...workspaceAliases],
    },
    test: {
      ...baseTest,
      environment: "jsdom",
      include,
      name,
    },
  };
}

const adminAliases = [
  {
    find: /^@\/lib\/utils$/,
    replacement: fromRoot("packages/ui/src/lib/utils.ts"),
  },
  { find: "@", replacement: fromRoot("apps/admin") },
];

const docsAliases = [{ find: "@", replacement: fromRoot("apps/docs") }];
const uiAliases = [{ find: "@", replacement: fromRoot("packages/ui/src") }];

export default defineConfig({
  test: {
    projects: [
      nodeProject("admin-unit", "apps/admin", ["tests/unit/**/*.test.{ts,tsx}"], adminAliases),
      nodeProject("admin-integration", "apps/admin", ["tests/integration/**/*.test.{ts,tsx}"], adminAliases),
      reactProject("docs-unit", "apps/docs", ["tests/unit/**/*.test.{ts,tsx}"], docsAliases),
      nodeProject("docs-integration", "apps/docs", ["tests/integration/**/*.test.{ts,tsx}"], docsAliases),
      nodeProject("admin-client-unit", "packages/admin-client", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("admin-contract-unit", "packages/admin-contract", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("admin-server-unit", "packages/admin-server", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("admin-server-integration", "packages/admin-server", ["tests/integration/**/*.test.{ts,tsx}"]),
      nodeProject("api-docs-unit", "packages/api-docs", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("auth-unit", "packages/auth", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("cms0-unit", "packages/cms0", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("cms0-integration", "packages/cms0", ["tests/integration/**/*.test.{ts,tsx}"]),
      nodeProject("db-schema-ops-unit", "packages/db-schema-ops", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("shared-unit", "packages/shared", ["tests/unit/**/*.test.{ts,tsx}"]),
      nodeProject("transactional-unit", "packages/transactional", ["tests/unit/**/*.test.{ts,tsx}"]),
      reactProject("ui-unit", "packages/ui", ["tests/unit/**/*.test.{ts,tsx}"], uiAliases),
    ],
  },
});
