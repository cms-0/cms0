import dotenv from "dotenv";

import { defineConfig } from "@cms0/cms0/config";

dotenv.config({ path: ".env.local" });

export default defineConfig({
  entry: "./data/cms0.ts",
  tsconfig: "./tsconfig.json",
  api: {
    baseUrl: process.env.CMS0_API_BASE_URL,
    key: process.env.CMS0_API_KEY,
  },
});
