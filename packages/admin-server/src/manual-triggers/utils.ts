/**
 * Manual Triggers Utilities
 */

import type {
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerTarget,
  ManualTriggerScopeType,
  TriggerRow,
  TriggerRunRow,
} from "./types";

export function normalizeStringRecord(
  value: unknown,
): Record<string, string> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const k = String(key).trim();
    if (!k || raw == null) continue;
    out[k] = String(raw);
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function normalizeTarget(
  value: string | null,
  canvasOnly: boolean,
): ManualTriggerTarget {
  if (value === "editor" || value === "canvas" || value === "both")
    return value;
  return canvasOnly ? "canvas" : "editor";
}

export function normalizeScopeType(
  value: string | null,
): ManualTriggerScopeType {
  if (value === "collection" || value === "singleton") return value;
  return "global";
}

export function normalizeTriggerRow(row: TriggerRow): ManualTriggerRecord {
  return {
    id: row.id,
    name: row.name,
    buttonLabel: row.button_label,
    successMessage: row.success_message ?? null,
    enabled: row.enabled,
    target: normalizeTarget(row.target, row.canvas_only),
    scopeType: normalizeScopeType(row.scope_type),
    scopeName: row.scope_name ?? null,
    method: row.method,
    url: row.url,
    headersJson: normalizeStringRecord(row.headers_json),
    queryParamsJson: normalizeStringRecord(row.query_params_json),
    bodyTemplate: row.body_template ?? null,
    timeoutMs: row.timeout_ms ?? null,
    extraWaitMs: row.extra_wait_ms ?? null,
    attempts: row.attempts ?? null,
    backoffMs: row.backoff_ms ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function normalizeTriggerRunRow(
  row: TriggerRunRow,
): ManualTriggerRunRecord {
  return {
    id: row.id,
    triggerId: row.trigger_id,
    status: row.status,
    requestPayload:
      row.request_payload && typeof row.request_payload === "object"
        ? (row.request_payload as Record<string, unknown>)
        : null,
    responseStatus: row.response_status ?? null,
    responseBodyPreview: row.response_body_preview ?? null,
    errorMessage: row.error_message ?? null,
    attempt: row.attempt ?? null,
    resourceContext:
      row.resource_context && typeof row.resource_context === "object"
        ? (row.resource_context as Record<string, unknown>)
        : null,
    initiatedBy: row.initiated_by ?? null,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    durationMs: row.duration_ms ?? null,
    createdAt: row.created_at,
  };
}

export function isMissingTableError(err: unknown): boolean {
  const code = (err as any)?.code;
  const msg = (err as any)?.message ?? "";
  return (
    code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("external_triggers")
  );
}
