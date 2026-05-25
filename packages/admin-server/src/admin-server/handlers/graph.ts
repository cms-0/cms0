/**
 * Graph Request Handler
 */

import type { AdminRequestInput, AdminResponse } from "@cms0/admin-contract";
import {
  parseGraphQueryOptions,
  type ParsedGraphPathQueryOptions,
} from "@cms0/shared";
import type { AdminServerTarget } from "../types";
import {
  buildRoute,
  methodNotAllowed,
  notFound,
  invalidRequest,
} from "../utils";
import { resolveBinding } from "../config";
import { parseGraphMutationInput } from "../../graph-mutation-engine";

/** UUID v4 / UUID-like pattern used to detect per-item path segments. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const readPageSizeValue = (value: unknown): number | "full" | undefined =>
  value === "full" ||
  (typeof value === "number" && Number.isFinite(value) && value > 0)
    ? value
    : undefined;

function isUuidLike(s: string): boolean {
  return UUID_RE.test(s);
}

export async function handleGraphRequest(
  target: AdminServerTarget,
  request: AdminRequestInput,
): Promise<AdminResponse> {
  const route = buildRoute(request.segments);
  const binding = await resolveBinding(target);
  const graphSegments = request.segments.slice(1); // strip leading "_graph"

  if (graphSegments.length === 0) {
    return invalidRequest(
      route,
      "Graph requests must include a descriptor path.",
    );
  }

  const lastSeg = graphSegments[graphSegments.length - 1];

  // ── _subscribe ────────────────────────────────────────────────────────────
  // Wire the endpoint but leave real-time delivery as a TODO.
  if (lastSeg === "_subscribe") {
    if (request.method !== "GET") return methodNotAllowed(route, request.method);
    // TODO: implement Server-Sent Events stream for live content updates.
    // When implemented this should:
    //   1. Upgrade the connection to SSE (Content-Type: text/event-stream)
    //   2. Subscribe to change events for `graphPath`
    //   3. Push `{ event: "update", data: <newValue> }` on each write
    //   4. Handle client disconnects and heartbeat pings
    return {
      body: {
        ok: false,
        code: "not_implemented",
        message: "Real-time subscriptions are not yet implemented.",
      },
      status: 501,
    };
  }

  // ── _query (POST with structured filter body) ─────────────────────────────
  // GET /_graph/{path} already covers search/orderBy/orderDir/fields via query
  // params. _query is the POST companion for complex filter objects that exceed
  // URL length limits or require structured field predicates.
  if (lastSeg === "_query") {
    if (request.method !== "POST") return methodNotAllowed(route, request.method);
    const graphPath = graphSegments.slice(0, -1).join("/");

    const body = (request.body ?? {}) as Record<string, unknown>;
    const paths =
      body.paths &&
      typeof body.paths === "object" &&
      !Array.isArray(body.paths)
        ? (body.paths as Record<string, ParsedGraphPathQueryOptions>)
        : undefined;

    const fields =
      typeof body.fields === "string"
        ? body.fields.split(",").map((item) => item.trim()).filter(Boolean)
        : Array.isArray(body.fields)
          ? (body.fields as string[])
          : undefined;
    const exclude =
      typeof body.exclude === "string"
        ? body.exclude.split(",").map((item) => item.trim()).filter(Boolean)
        : Array.isArray(body.exclude)
          ? (body.exclude as string[])
          : undefined;

    const pagination = {
      page: typeof body.page === "number" ? body.page : undefined,
      pageSize: readPageSizeValue(body.pageSize),
      orderBy: typeof body.orderBy === "string" ? body.orderBy : undefined,
      orderDir:
        body.orderDir === "desc" ? ("desc" as const) : ("asc" as const),
      search: typeof body.search === "string" ? body.search : undefined,
      fields,
      exclude,
    };

    const result = await binding.readGraphValue({
      path: graphPath,
      target,
      options: {
        locale: typeof body.locale === "string" ? body.locale : undefined,
        resolveModelRefs: body.resolveModelRefs !== false,
        maxDepth: typeof body.maxDepth === "number" ? body.maxDepth : undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
        orderBy: pagination.orderBy,
        orderDir: pagination.orderDir,
        search: pagination.search,
        fields: pagination.fields,
        exclude: pagination.exclude,
        paths,
      },
    });

    if (result === null || result === undefined) return notFound(route);
    return { body: result, status: 200 };
  }

  // ── _mutate ───────────────────────────────────────────────────────────────
  if (lastSeg === "_mutate") {
    if (request.method !== "POST") return methodNotAllowed(route, request.method);

    const pathBeforeMutate = graphSegments.slice(0, -1);

    // Detect per-item collection mutate: _graph/{collectionPath}/{uuid}/_mutate
    const maybeId = pathBeforeMutate[pathBeforeMutate.length - 1];
    const isItemMutate = !!maybeId && isUuidLike(maybeId);

    const graphPath = isItemMutate
      ? pathBeforeMutate.slice(0, -1).join("/")
      : pathBeforeMutate.join("/");

    const itemId = isItemMutate ? maybeId : undefined;

    const input = parseGraphMutationInput(request.body);
    if (!input) {
      return invalidRequest(
        route,
        "Mutation requests require a valid { ops: [...] } body.",
      );
    }

    const result = await binding.mutateGraphValue({
      path: graphPath,
      target,
      ops: input.ops,
      itemId,
    });

    if (result === null || result === undefined) return notFound(route);
    return { body: result, status: 200 };
  }

  // ── GET (read) ────────────────────────────────────────────────────────────
  if (request.method !== "GET") return methodNotAllowed(route, request.method);

  const graphPath = graphSegments.join("/");
  const graphOptions = parseGraphQueryOptions(request.searchParams);

  const result = await binding.readGraphValue({
    path: graphPath,
    target,
    options: graphOptions,
  });

  if (result === null || result === undefined) return notFound(route);
  return { body: result, status: 200 };
}
