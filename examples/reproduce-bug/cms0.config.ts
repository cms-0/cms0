import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@cms0/cms0/config";

const configDir = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(configDir, ".env") });
dotenv.config({ path: path.join(configDir, ".env.local"), override: true });

export default defineConfig({
  entry: "./src/data/cms0.ts",
  api: {
    baseUrl:
      process.env.VITE_CMS0_API_BASEURL ?? "http://localhost:4002/api/content",
    key: process.env.VITE_CMS0_API_KEY ?? "cms0_example_key",
  },
});
