// File watcher that rebuilds descriptors on entry changes.
import chokidar from "chokidar";
import { buildOnce } from "./build.js";
import { ResolvedConfig } from "./types.js";
import { FullDescriptor } from "@cms0/shared";

type WatcherBrowserTarget = "sidecar" | "bundle";

function startWatcher(
  resolved: ResolvedConfig,
  afterBuild?: (descriptor: FullDescriptor) => Promise<void> | void,
  browserTarget: WatcherBrowserTarget = "sidecar",
  runInitialBuild = true,
) {
  const watcher = chokidar.watch([resolved.entryFile], {
    ignoreInitial: false,
  });

  const run = (
    after?: (descriptor: FullDescriptor) => Promise<void> | void
  ) => {
    try {
      const descriptor = buildOnce(resolved, browserTarget);
      if (after) {
        Promise.resolve(after(descriptor)).catch((err) => {
          console.error("cms0: post-build hook failed", err);
        });
      }
    } catch (err) {
      console.error("cms0: generation failed", err);
    }
  };

  // Trigger a build on startup and whenever the entry file changes.
  if (runInitialBuild) {
    watcher.on("ready", () => run(afterBuild));
  }
  watcher.on("change", () => run(afterBuild));
  watcher.on("error", (error) => {
    console.error("cms0: watcher error", error);
  });

  return watcher;
}

export { startWatcher };
