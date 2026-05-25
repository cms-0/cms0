/**
 * Admin Server Utilities
 *
 * Shared helper functions for routing, errors, and data handling.
 */

import type {
  AdminErrorCode,
  AdminRequestInput,
  AdminResponse,
  AdminErrorResponse,
  SchemaDescriptorSnapshot,
} from "@cms0/admin-contract";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function buildRoute(segments: string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

export function summarizeSnapshot(
  snapshot: SchemaDescriptorSnapshot | null,
): { checksum: string; publishedAt: string; version: string } | null {
  return snapshot
    ? {
        checksum: snapshot.checksum,
        publishedAt: snapshot.publishedAt,
        version: snapshot.version,
      }
    : null;
}

export function createErrorResponse(
  code: AdminErrorCode,
  route: string,
  message: string,
  status: number,
): AdminResponse<AdminErrorResponse> {
  return {
    body: {
      code,
      message,
      ok: false,
      route,
    },
    status,
  };
}

export function methodNotAllowed(
  route: string,
  method: AdminRequestInput["method"],
): AdminResponse<AdminErrorResponse> {
  return createErrorResponse(
    "method_not_allowed",
    route,
    `Method ${method} not allowed for ${route}`,
    405,
  );
}

export function notFound(route: string): AdminResponse<AdminErrorResponse> {
  return createErrorResponse(
    "not_found",
    route,
    `Route not found: ${route}`,
    404,
  );
}

export function invalidRequest(
  route: string,
  message: string,
): AdminResponse<AdminErrorResponse> {
  return createErrorResponse("invalid_request", route, message, 400);
}

export function sanitizeDownloadBasename(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "-");
  return normalized.replace(/^-+|-+$/g, "") || "server-artifact";
}

export function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
