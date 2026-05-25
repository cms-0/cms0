import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";

import { createAdminServer } from "../core";
import { buildRoute, methodNotAllowed } from "../utils";
import type { AdminServerTarget } from "../types";

export async function handleUsageRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);

  if (request.method !== "GET") {
    return methodNotAllowed(route, request.method);
  }

  if (request.segments.length !== 1) {
    return {
      status: 404,
      body: {
        code: "not_found",
        message: `Route not found: ${route}`,
        ok: false,
        route,
      },
    };
  }

  const summary = await createAdminServer(target).getUsageSummary();

  return {
    status: 200,
    body: {
      ok: true,
      summary,
    },
  };
}
