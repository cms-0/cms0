import path from "node:path";

import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@\/lib\/utils$/,
        replacement: path.resolve(__dirname, "../../packages/ui/src/lib/utils.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "."),
      },
    ],
  },
  test: {
    clearMocks: true,
    environment: "node",
    exclude: [...configDefaults.exclude, "e2e/**"],
    restoreMocks: true,
  },
});
