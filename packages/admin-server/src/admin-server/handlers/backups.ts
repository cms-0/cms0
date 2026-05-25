/**
 * Backups Request Handler
 */

import type {
  AdminRequestInput,
  AdminResponse,
  AdminMutationSuccessResponse,
} from "@cms0/admin-contract";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
  createErrorResponse,
  sanitizeDownloadBasename,
} from "../utils";
import { resolveBinding, runEnvironmentOperationExclusive } from "../config";
import { readBackupCreateInput } from "../parsers";

export async function handleBackupsRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  if (request.segments.length === 1) {
    if (request.method === "GET") {
      return {
        body: await binding.listBackups(target),
        status: 200,
      };
    }

    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const backup = await binding.createBackup(
      target,
      readBackupCreateInput(request.body),
    );

    if (!backup) {
      return invalidRequest(
        route,
        "No published descriptor is available to back up yet.",
      );
    }

    return {
      body: backup,
      status: 201,
    };
  }

  if (request.segments.length === 2) {
    if (request.method !== "DELETE") {
      return methodNotAllowed(route, request.method);
    }

    await binding.deleteBackup(target, request.segments[1]!);

    return {
      body: {
        ok: true,
      } satisfies AdminMutationSuccessResponse,
      status: 200,
    };
  }

  if (request.segments.length !== 3) {
    return notFound(route);
  }

  const backupId = request.segments[1]!;
  const action = request.segments[2]!;
  const environmentLabel = sanitizeDownloadBasename(target.environmentKey);
  const backupLabel = sanitizeDownloadBasename(backupId);

  if (action === "restore") {
    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const restored = await runEnvironmentOperationExclusive(
      target.environmentKey,
      () => Promise.resolve(binding.restoreBackup(target, backupId)),
    );

    if (!restored) {
      return createErrorResponse("not_found", route, "Backup not found.", 404);
    }

    return {
      body: restored,
      status: 200,
    };
  }

  if (request.method !== "GET") {
    return methodNotAllowed(route, request.method);
  }

  if (action === "descriptor") {
    const descriptor = await binding.getBackupDescriptor(target, backupId);

    if (!descriptor) {
      return createErrorResponse(
        "not_found",
        route,
        "Backup descriptor not found.",
        404,
      );
    }

    return {
      body: descriptor,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${environmentLabel}-${backupLabel}-descriptor.json"`,
        "content-type": "application/json; charset=utf-8",
      },
      status: 200,
    };
  }

  if (action === "typescript") {
    const code = await binding.getBackupTypescript(target, backupId);

    if (!code) {
      return createErrorResponse(
        "not_found",
        route,
        "Backup TypeScript artifact not found.",
        404,
      );
    }

    return {
      body: code,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${environmentLabel}-${backupLabel}-descriptor.ts"`,
        "content-type": "text/plain; charset=utf-8",
      },
      status: 200,
    };
  }

  if (action === "file") {
    const archive = await binding.getBackupArchive(target, backupId);

    if (!archive) {
      return createErrorResponse(
        "not_found",
        route,
        "Backup archive not found.",
        404,
      );
    }

    return {
      body: archive.data,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${archive.fileName.replace(/"/g, "")}"`,
        "content-length": String(archive.sizeBytes),
        "content-type": "application/gzip",
        "x-backup-checksum-sha256": archive.checksum,
      },
      status: 200,
    };
  }

  return notFound(route);
}
