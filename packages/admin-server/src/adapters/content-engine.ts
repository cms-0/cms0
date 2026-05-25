/**
 * Content Engine Adapter
 *
 * Unified ContentEngineFactory using buildContentEngineHandlers for all environments.
 */

import type {
  ContentEngineFactory,
  ContentEngine,
} from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import { buildContentEngineHandlers } from "../content-engine-builder";
import type { FullDescriptor } from "@cms0/shared";

/**
 * Create a content engine factory
 */
export function createContentEngineFactory(
  config: AdapterConfig,
): ContentEngineFactory {
  const { pool, assetStore } = config;

  return {
    buildEmpty(): ContentEngine {
      return {
        checksum: null,
        collectionHandlers: new Map(),
        singletonHandlers: new Map(),
        resourceMap: new Map(),
        snapshot: null,
      };
    },

    async buildFromSnapshot(snapshot): Promise<ContentEngine> {
      const { collectionHandlers, singletonHandlers, resourceMap } =
        buildContentEngineHandlers(
          pool,
          snapshot.descriptor as FullDescriptor,
          assetStore,
        );
      return {
        checksum: snapshot.checksum,
        collectionHandlers,
        singletonHandlers,
        resourceMap,
        snapshot,
      };
    },
  };
}
