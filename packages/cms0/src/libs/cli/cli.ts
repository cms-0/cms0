// CLI entry point: parse arguments, load config, and trigger build/watch modes.
import { pathToFileURL } from "url";
import { buildOnce } from "./build.js";
import { startBrowserDescriptorSidecar } from "./browser-sidecar.js";
import { loadUserConfig, resolvePaths } from "./config-loader.js";
import { startWatcher } from "./watcher.js";

async function runFromCli() {
  const args = process.argv.slice(2);
  let mode: "build" | "watch" | "dev" = "build";
  let configArg: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "watch" || arg === "build" || arg === "dev") {
      mode = arg;
    } else if (arg === "--config") {
      configArg = args[i + 1];
      i++;
    } else if (arg && arg.startsWith("--config=")) {
      configArg = arg.split("=")[1];
    }
  }

  const loaded = await loadUserConfig(configArg);
  if (!loaded) return;
  const resolved = resolvePaths(loaded.path, loaded.config);

  console.log("resolved: ", resolved);

  if (mode === "watch") {
    const descriptor = buildOnce(resolved, "sidecar");
    const sidecar = await startBrowserDescriptorSidecar(resolved, descriptor);
    startWatcher(
      resolved,
      (nextDescriptor) => sidecar.updateDescriptor(nextDescriptor),
      "sidecar",
      false,
    );
    return;
  }

  if (mode === "dev") {
    const descriptor = buildOnce(resolved, "sidecar");
    const sidecar = await startBrowserDescriptorSidecar(resolved, descriptor);
    startWatcher(
      resolved,
      (nextDescriptor) => sidecar.updateDescriptor(nextDescriptor),
      "sidecar",
      false,
    );
    return;
  }

  buildOnce(resolved, "bundle");
}

// ESM/CJS-safe main check without import.meta syntax in the source so CJS builds succeed.
const isDirectRun = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;

  if (typeof module !== "undefined" && typeof require !== "undefined") {
    if (require.main === module) return true;
  }

  // Use Function to access import.meta.url only when supported to avoid CJS parse errors.
  const metaUrl = (() => {
    try {
      // eslint-disable-next-line no-new-func
      return Function("return import.meta.url")();
    } catch {
      return undefined;
    }
  })();

  return metaUrl ? metaUrl === pathToFileURL(argv1).href : false;
})();

if (isDirectRun) {
  runFromCli();
}

export { runFromCli };
