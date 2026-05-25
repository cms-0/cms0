/**
 * Uploads Request Handler
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import type { AssetKind } from "@cms0/shared";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
} from "../utils";
import { resolveBinding, runEnvironmentOperationExclusive } from "../config";
import { readArchiveImportInput } from "../parsers";

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  json: "application/json",
  mov: "video/quicktime",
  mp4: "video/mp4",
  pdf: "application/pdf",
  png: "image/png",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  webm: "video/webm",
  webp: "image/webp",
};

function resolveAssetKind(segment: string): AssetKind | null {
  if (segment === "images") return "image";
  if (segment === "videos") return "video";
  if (segment === "files") return "file";
  return null;
}

function resolveContentType(filename: string): string {
  const normalized = filename.trim().toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex < 0) return "application/octet-stream";
  const extension = normalized.slice(dotIndex + 1);
  return CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream";
}

export async function handleUploadAssetRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const assetRequest = {
    ...request,
    segments: ["assets", ...request.segments],
  };
  const route = buildRoute(assetRequest.segments);
  const binding = await resolveBinding(target);

  const limitsError = await binding.checkLimits?.(assetRequest);
  let response: AdminResponse;

  if (limitsError) {
    response = limitsError;
  } else if (request.method !== "GET" && request.method !== "HEAD") {
    response = methodNotAllowed(route, request.method);
  } else {
    const assetKind = resolveAssetKind(request.segments[0] ?? "");
    const filename = request.segments.slice(1).join("/");
    if (!assetKind || !filename) {
      response = notFound(route);
    } else {
      const asset = await binding.getUploadAsset(target, {
        filename,
        kind: assetKind,
      });
      if (!asset) {
        response = notFound(route);
      } else {
        response = {
          body: request.method === "HEAD" ? "" : asset.data,
          headers: {
            "cache-control": "public, max-age=31536000, immutable",
            "content-length": String(asset.data.byteLength),
            "content-type": resolveContentType(filename),
          },
          status: 200,
        };
      }
    }
  }

  if (binding.recordRequestUsage) {
    try {
      await binding.recordRequestUsage({
        request: assetRequest,
        response,
        target,
      });
    } catch {
      // Server telemetry must not block responses.
    }
  }

  return response;
}

export async function handleUploadsRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  const limitsError = await binding.checkLimits?.(request);
  if (limitsError) {
    return limitsError;
  }

  if (request.segments.length === 2 && request.segments[1] === "export") {
    if (request.method !== "GET") {
      return methodNotAllowed(route, request.method);
    }

    const archive = await binding.exportUploadsArchive(target);
    return {
      body: archive.data,
      headers: {
        "content-disposition": `attachment; filename="${archive.fileName.replace(/"/g, "")}"`,
        "content-length": String(archive.sizeBytes),
        "content-type": "application/octet-stream",
        "x-uploads-checksum-sha256": archive.checksum,
        "x-uploads-file-count": String(archive.fileCount),
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
        "Uploads preflight requires multipart/form-data with archive file field.",
      );
    }

    return {
      body: await binding.preflightUploadsImport(target, {
        archive: input.archive,
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
        "Uploads import requires multipart/form-data with archive file field.",
      );
    }

    return {
      body: await runEnvironmentOperationExclusive(target.environmentKey, () =>
        Promise.resolve(
          binding.importUploadsArchive(target, {
            archive: input.archive,
          }),
        ),
      ),
      status: 200,
    };
  }

  return notFound(route);
}
