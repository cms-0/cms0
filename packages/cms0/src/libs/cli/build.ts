// Single-shot build that compiles the descriptor, writes it, and publishes it.
import { buildDescriptorAlt as buildDescriptor } from "./descriptor-builder-alt.js";
import { publishDescriptor } from "./publisher.js";
import { writeDescriptorFiles } from "./descriptor-writer.js";
import { ResolvedConfig } from "./types.js";
import { FullDescriptor } from "@cms0/shared";

type BuildMode = "sidecar" | "bundle";

function buildOnce(
  resolved: ResolvedConfig,
  browserTarget: BuildMode = "sidecar",
): FullDescriptor {
  const descriptor = buildDescriptor(resolved);
  writeDescriptorFiles(resolved, descriptor, browserTarget);
  publishDescriptor(resolved, descriptor);
  return descriptor;
}

export { buildOnce };
