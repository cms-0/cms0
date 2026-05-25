/**
 * Data Transfer Request Handler
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
} from "../utils";
import { resolveBinding, runEnvironmentOperationExclusive } from "../config";
import { readArchiveImportInput } from "../parsers";

export async function handleDataTransferRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  if (request.segments.length === 2 && request.segments[1] === "export") {
    if (request.method !== "GET") {
      return methodNotAllowed(route, request.method);
    }

    const archive = await binding.exportDataTransferArchive(target);
    return {
      body: archive.data,
      headers: {
        "content-disposition": `attachment; filename="${archive.fileName.replace(/"/g, "")}"`,
        "content-length": String(archive.sizeBytes),
        "content-type": "application/octet-stream",
        "x-backup-checksum-sha256": archive.checksum,
      },
      status: 200,
    };
  }

  if (
    request.segments.length === 3 &&
    request.segments[1] === "import" &&
    request.segments[2] === "preflight"
  ) {
    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const input = await readArchiveImportInput(request.body);
    if (!input) {
      return invalidRequest(
        route,
        "Import preflight requires multipart/form-data with archive file field.",
      );
    }

    return {
      body: await binding.preflightDataTransferImport(target, {
        archive: input.archive,
        skipMissingTables: input.skipMissingTables,
      }),
      status: 200,
    };
  }

  if (request.segments.length === 2 && request.segments[1] === "import") {
    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const input = await readArchiveImportInput(request.body);
    if (!input) {
      return invalidRequest(
        route,
        "Import requires multipart/form-data with archive file field.",
      );
    }

    return {
      body: await runEnvironmentOperationExclusive(target.environmentKey, () =>
        Promise.resolve(
          binding.importDataTransferArchive(target, {
            archive: input.archive,
            reason: input.reason,
            skipMissingTables: input.skipMissingTables,
          }),
        ),
      ),
      status: 200,
    };
  }

  return notFound(route);
}
