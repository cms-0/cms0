/**
 * Schema Request Handler
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
import { readSchemaPublishInput } from "../parsers";
import { createSchemaTypescript } from "../responses";

export async function handleSchemaRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);

  if (request.segments.length === 1) {
    if (request.method !== "POST") {
      return methodNotAllowed(route, request.method);
    }

    const input = readSchemaPublishInput(request.body);
    if (!input) {
      return invalidRequest(
        route,
        "Schema publish requests must include a descriptor object.",
      );
    }

    return {
      body: await runEnvironmentOperationExclusive(target.environmentKey, () =>
        Promise.resolve(binding.publishSchema(target, input)),
      ),
      status: 200,
    };
  }

  if (
    request.segments.length === 2 &&
    request.segments[1] === "latestSnapshot"
  ) {
    if (request.method !== "GET") {
      return methodNotAllowed(route, request.method);
    }

    return {
      body: {
        ok: true,
        snapshot: await binding.getLatestSchemaSnapshot(target),
      },
      status: 200,
    };
  }

  if (
    request.segments.length === 3 &&
    request.segments[1] === "typescript" &&
    request.segments[2] === "latest"
  ) {
    if (request.method !== "GET") {
      return methodNotAllowed(route, request.method);
    }

    return {
      body: await createSchemaTypescript(target),
      status: 200,
    };
  }

  return notFound(route);
}
