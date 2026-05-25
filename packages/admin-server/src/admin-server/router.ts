/**
 * Admin Server Request Router
 *
 * Dispatches incoming requests to the appropriate handler.
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import type { AdminServerTarget } from "./types";
import { buildRoute, methodNotAllowed } from "./utils";
import { getAdminServerConfig, resolveBinding } from "./config";
import {
  createOverviewResponse,
  createHealthResponse,
  createContextResponse,
} from "./responses";
import { handleSchemaRequest } from "./handlers/schema";
import { handleContentRequest } from "./handlers/content";
import { handleGraphRequest } from "./handlers/graph";
import { handleBackupsRequest } from "./handlers/backups";
import { handleTriggersRequest } from "./handlers/triggers";
import { handleApiKeysRequest } from "./handlers/api-keys";
import { handleDataTransferRequest } from "./handlers/data-transfer";
import { handleUploadsRequest } from "./handlers/uploads";
import { handleUsageRequest } from "./handlers/usage";

export async function handleAdminRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  let response: AdminResponse;

  const config = getAdminServerConfig();
  const authorization = await config.authorizeRequest?.({
    request,
    route,
    target,
  });

  if (authorization) {
    return authorization;
  }

  if (request.segments.length === 0) {
    response =
      request.method !== "GET"
        ? methodNotAllowed(route, request.method)
        : {
            body: await createOverviewResponse(target),
            status: 200,
          };
  } else if (request.segments[0] === "health") {
    response =
      request.method !== "GET"
        ? methodNotAllowed(route, request.method)
        : {
            body: await createHealthResponse(target),
            status: 200,
          };
  } else if (request.segments[0] === "context") {
    response =
      request.method !== "GET"
        ? methodNotAllowed(route, request.method)
        : {
            body: await createContextResponse(target),
            status: 200,
          };
  } else if (request.segments[0] === "schema") {
    response = await handleSchemaRequest(target, request);
  } else if (request.segments[0] === "content") {
    response = await handleContentRequest(target, request);
  } else if (request.segments[0] === "_graph") {
    response = await handleGraphRequest(target, request);
  } else if (request.segments[0] === "api-keys") {
    response = await handleApiKeysRequest(target, request);
  } else if (request.segments[0] === "backups") {
    response = await handleBackupsRequest(target, request);
  } else if (request.segments[0] === "triggers") {
    response = await handleTriggersRequest(target, request);
  } else if (request.segments[0] === "data-transfer") {
    response = await handleDataTransferRequest(target, request);
  } else if (request.segments[0] === "uploads") {
    response = await handleUploadsRequest(target, request);
  } else if (request.segments[0] === "usage") {
    response = await handleUsageRequest(target, request);
  } else {
    response = {
      body: {
        code: "not_found",
        message: `Route not found: ${route}`,
        ok: false,
        route,
      },
      status: 404,
    };
  }

  const binding = await resolveBinding(target);
  if (binding.recordRequestUsage) {
    try {
      await binding.recordRequestUsage({
        request,
        response,
        target,
      });
    } catch {
      // Server telemetry must not block responses.
    }
  }

  return response;
}
