/**
 * API Keys Request Handler
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
  createErrorResponse,
} from "../utils";
import { resolveBinding } from "../config";
import { readApiKeyCreateInput, readApiKeyUpdateInput } from "../parsers";

export async function handleApiKeysRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  if (request.segments.length === 1) {
    if (request.method === "GET") {
      return {
        body: await binding.listApiKeys(target, { headers: request.headers }),
        status: 200,
      };
    }

    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const payload = readApiKeyCreateInput(request.body);
    if (!payload) {
      return invalidRequest(route, "API key create payload is invalid.");
    }

    return {
      body: await binding.createApiKey(target, payload, {
        headers: request.headers,
      }),
      status: 201,
    };
  }

  if (request.segments.length !== 2) {
    return notFound(route);
  }

  const keyId = request.segments[1]!;

  if (request.method === "PATCH") {
    const payload = readApiKeyUpdateInput(request.body);
    if (!payload) {
      return invalidRequest(route, "API key update payload is invalid.");
    }

    const updated = await binding.updateApiKey(target, keyId, payload, {
      headers: request.headers,
    });
    if (!updated) {
      return createErrorResponse("not_found", route, "API key not found.", 404);
    }

    return {
      body: {
        key: updated,
      },
      status: 200,
    };
  }

  if (request.method === "DELETE") {
    const revoked = await binding.revokeApiKey(target, keyId, {
      headers: request.headers,
    });
    if (!revoked) {
      return createErrorResponse("not_found", route, "API key not found.", 404);
    }

    return {
      body: {
        key: revoked,
      },
      status: 200,
    };
  }

  return methodNotAllowed(route, request.method);
}
