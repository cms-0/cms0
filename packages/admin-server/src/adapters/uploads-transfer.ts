/**
 * Uploads Transfer Adapter
 *
 * Shared UploadsTransferAdapter implementation for both self-hosted and hosted apps.
 */

import type { UploadsTransferAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import { createUploadsTransferAdapter as createPackageUploadsTransferAdapter } from "../uploads-transfer";

function uploadsTransferNotConfigured(): never {
  throw new Error("Uploads transfer storage is not configured.");
}

/**
 * Create an uploads transfer adapter
 */
export function createUploadsTransferAdapter(
  config: AdapterConfig & {
    storage?: import("../storage-driver").StorageDriverAdapter;
  },
): UploadsTransferAdapter {
  const { storage } = config;

  if (!storage) {
    return {
      async export() {
        uploadsTransferNotConfigured();
      },
      async preflight() {
        uploadsTransferNotConfigured();
      },
      async import() {
        uploadsTransferNotConfigured();
      },
    };
  }

  // Delegate to the package factory
  return createPackageUploadsTransferAdapter(storage);
}
