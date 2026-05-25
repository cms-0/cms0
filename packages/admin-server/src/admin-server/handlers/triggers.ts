/**
 * Triggers Request Handler
 */

import type {
  AdminRequestInput,
  AdminResponse,
  AdminMutationSuccessResponse,
  ParseManualTriggerInputResult,
} from "@cms0/admin-contract";
import { parseManualTriggerInput } from "@cms0/admin-contract";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
  createErrorResponse,
} from "../utils";
import { resolveBinding } from "../config";
import {
  readManualTriggerRunsQuery,
  readManualTriggerRunContext,
} from "../parsers";

export async function handleTriggersRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  if (request.segments.length === 1) {
    if (request.method === "GET") {
      return {
        body: await binding.listManualTriggers(target),
        status: 200,
      };
    }

    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const payload: ParseManualTriggerInputResult = parseManualTriggerInput(
      request.body,
    );
    if (!payload.ok) {
      return invalidRequest(route, payload.error);
    }

    return {
      body: await binding.createManualTrigger(target, payload.value),
      status: 201,
    };
  }

  if (request.segments.length === 2 && request.segments[1] === "runs") {
    if (request.method !== "GET") {
      return methodNotAllowed(route, request.method);
    }

    const query = readManualTriggerRunsQuery(request.searchParams);
    const runs = await binding.listManualTriggerRuns(target, query.triggerId);

    return {
      body: query.limit ? runs.slice(0, query.limit) : runs,
      status: 200,
    };
  }

  if (request.segments.length === 2) {
    const triggerId = request.segments[1]!;

    if (request.method === "DELETE") {
      await binding.deleteManualTrigger(target, triggerId);

      return {
        body: {
          ok: true,
        } satisfies AdminMutationSuccessResponse,
        status: 200,
      };
    }

    if (request.method !== "PATCH") {
      return methodNotAllowed(route, request.method);
    }

    const payload = parseManualTriggerInput(request.body);
    if (!payload.ok) {
      return invalidRequest(route, payload.error);
    }

    const updated = await binding.updateManualTrigger(
      target,
      triggerId,
      payload.value,
    );

    if (!updated) {
      return createErrorResponse("not_found", route, "Trigger not found.", 404);
    }

    return {
      body: updated,
      status: 200,
    };
  }

  if (request.segments.length === 3 && request.segments[2] === "run") {
    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const execution = await binding.runManualTrigger(
      target,
      request.segments[1]!,
      readManualTriggerRunContext(request) ?? undefined,
    );

    if (!execution) {
      return createErrorResponse(
        "not_found",
        route,
        "Trigger not found or is disabled.",
        404,
      );
    }

    return {
      body: execution,
      status: 200,
    };
  }

  return notFound(route);
}
