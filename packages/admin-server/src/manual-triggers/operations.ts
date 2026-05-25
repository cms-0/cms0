/**
 * Manual Triggers Database Operations
 */

import { randomUUID } from "node:crypto";
import pg from "pg";
import type {
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerInput,
  ManualTriggerScopeType,
  TriggerRow,
  TriggerRunRow,
} from "./types";
import {
  normalizeTriggerRow,
  normalizeTriggerRunRow,
  isMissingTableError,
} from "./utils";

export async function listManualTriggers(
  pool: pg.Pool,
  filter?: { scopeType?: ManualTriggerScopeType; scopeName?: string },
): Promise<ManualTriggerRecord[]> {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.scopeType) {
      params.push(filter.scopeType);
      conditions.push(`scope_type = $${params.length}`);
    }
    if (filter?.scopeName !== undefined) {
      params.push(filter.scopeName);
      conditions.push(`scope_name = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const res = await pool.query<TriggerRow>(
      `SELECT * FROM external_triggers ${where} ORDER BY created_at DESC`,
      params,
    );
    return res.rows.map(normalizeTriggerRow);
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}

export async function getManualTriggerById(
  pool: pg.Pool,
  triggerId: string,
): Promise<ManualTriggerRecord | null> {
  try {
    const res = await pool.query<TriggerRow>(
      `SELECT * FROM external_triggers WHERE id = $1 LIMIT 1`,
      [triggerId],
    );
    const row = res.rows[0];
    return row ? normalizeTriggerRow(row) : null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function createManualTrigger(
  pool: pg.Pool,
  input: ManualTriggerInput,
  createdBy?: string | null,
): Promise<ManualTriggerRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const target = input.target ?? "editor";
  const canvasOnly = target === "canvas" || target === "both";
  const res = await pool.query<TriggerRow>(
    `INSERT INTO external_triggers
     (id, name, button_label, success_message, enabled, target, canvas_only,
      scope_type, scope_name, method, url, headers_json, query_params_json,
      body_template, timeout_ms, extra_wait_ms, attempts, backoff_ms,
      created_by, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING *`,
    [
      id,
      input.name ?? "",
      input.buttonLabel ?? "",
      input.successMessage ?? null,
      input.enabled ?? true,
      target,
      canvasOnly,
      input.scopeType ?? "global",
      input.scopeName ?? null,
      input.method ?? "POST",
      input.url ?? "",
      input.headersJson ? JSON.stringify(input.headersJson) : null,
      input.queryParamsJson ? JSON.stringify(input.queryParamsJson) : null,
      input.bodyTemplate ?? null,
      input.timeoutMs ?? null,
      input.extraWaitMs ?? null,
      input.attempts ?? null,
      input.backoffMs ?? null,
      createdBy ?? null,
      now,
      now,
    ],
  );
  return normalizeTriggerRow(res.rows[0]!);
}

export async function updateManualTrigger(
  pool: pg.Pool,
  triggerId: string,
  patch: Partial<ManualTriggerInput>,
): Promise<ManualTriggerRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];

  const addField = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };

  if (patch.name !== undefined) addField("name", patch.name);
  if (patch.buttonLabel !== undefined)
    addField("button_label", patch.buttonLabel);
  if (patch.successMessage !== undefined)
    addField("success_message", patch.successMessage);
  if (patch.enabled !== undefined) addField("enabled", patch.enabled);
  if (patch.target !== undefined) {
    addField("target", patch.target);
    addField(
      "canvas_only",
      patch.target === "canvas" || patch.target === "both",
    );
  }
  if (patch.scopeType !== undefined) addField("scope_type", patch.scopeType);
  if (patch.scopeName !== undefined) addField("scope_name", patch.scopeName);
  if (patch.method !== undefined) addField("method", patch.method);
  if (patch.url !== undefined) addField("url", patch.url);
  if (patch.headersJson !== undefined) {
    addField(
      "headers_json",
      patch.headersJson ? JSON.stringify(patch.headersJson) : null,
    );
  }
  if (patch.queryParamsJson !== undefined) {
    addField(
      "query_params_json",
      patch.queryParamsJson ? JSON.stringify(patch.queryParamsJson) : null,
    );
  }
  if (patch.bodyTemplate !== undefined)
    addField("body_template", patch.bodyTemplate);
  if (patch.timeoutMs !== undefined) addField("timeout_ms", patch.timeoutMs);
  if (patch.extraWaitMs !== undefined)
    addField("extra_wait_ms", patch.extraWaitMs);
  if (patch.attempts !== undefined) addField("attempts", patch.attempts);
  if (patch.backoffMs !== undefined) addField("backoff_ms", patch.backoffMs);

  if (sets.length === 0) return getManualTriggerById(pool, triggerId);

  params.push(new Date().toISOString());
  sets.push(`updated_at = $${params.length}`);
  params.push(triggerId);

  const res = await pool.query<TriggerRow>(
    `UPDATE external_triggers SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return res.rows[0] ? normalizeTriggerRow(res.rows[0]) : null;
}

export async function deleteManualTrigger(
  pool: pg.Pool,
  triggerId: string,
): Promise<boolean> {
  try {
    const res = await pool.query(
      `DELETE FROM external_triggers WHERE id = $1 RETURNING id`,
      [triggerId],
    );
    return (res.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function createManualTriggerRun(
  pool: pg.Pool,
  triggerId: string,
  data: {
    status?: string;
    requestPayload?: Record<string, unknown> | null;
    responseStatus?: number | null;
    responseBodyPreview?: string | null;
    errorMessage?: string | null;
    attempt?: number | null;
    resourceContext?: Record<string, unknown> | null;
    initiatedBy?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
    durationMs?: number | null;
  },
): Promise<ManualTriggerRunRecord> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const res = await pool.query<TriggerRunRow>(
    `INSERT INTO external_trigger_runs
     (id, trigger_id, status, request_payload, response_status, response_body_preview,
      error_message, attempt, resource_context, initiated_by, started_at, finished_at,
      duration_ms, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      id,
      triggerId,
      data.status ?? "pending",
      data.requestPayload ? JSON.stringify(data.requestPayload) : null,
      data.responseStatus ?? null,
      data.responseBodyPreview ?? null,
      data.errorMessage ?? null,
      data.attempt ?? null,
      data.resourceContext ? JSON.stringify(data.resourceContext) : null,
      data.initiatedBy ?? null,
      data.startedAt ?? null,
      data.finishedAt ?? null,
      data.durationMs ?? null,
      now,
    ],
  );
  return normalizeTriggerRunRow(res.rows[0]!);
}

export async function updateManualTriggerRun(
  pool: pg.Pool,
  runId: string,
  patch: {
    status?: string;
    responseStatus?: number | null;
    responseBodyPreview?: string | null;
    errorMessage?: string | null;
    finishedAt?: string | null;
    durationMs?: number | null;
  },
): Promise<ManualTriggerRunRecord | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const addField = (col: string, val: unknown) => {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  };
  if (patch.status !== undefined) addField("status", patch.status);
  if (patch.responseStatus !== undefined)
    addField("response_status", patch.responseStatus);
  if (patch.responseBodyPreview !== undefined)
    addField("response_body_preview", patch.responseBodyPreview);
  if (patch.errorMessage !== undefined)
    addField("error_message", patch.errorMessage);
  if (patch.finishedAt !== undefined) addField("finished_at", patch.finishedAt);
  if (patch.durationMs !== undefined) addField("duration_ms", patch.durationMs);

  if (sets.length === 0) {
    const res = await pool.query<TriggerRunRow>(
      `SELECT * FROM external_trigger_runs WHERE id = $1 LIMIT 1`,
      [runId],
    );
    return res.rows[0] ? normalizeTriggerRunRow(res.rows[0]) : null;
  }

  params.push(runId);
  const res = await pool.query<TriggerRunRow>(
    `UPDATE external_trigger_runs SET ${sets.join(", ")} WHERE id = $${params.length} RETURNING *`,
    params,
  );
  return res.rows[0] ? normalizeTriggerRunRow(res.rows[0]) : null;
}

export async function getManualTriggerRunById(
  pool: pg.Pool,
  runId: string,
): Promise<ManualTriggerRunRecord | null> {
  try {
    const res = await pool.query<TriggerRunRow>(
      `SELECT * FROM external_trigger_runs WHERE id = $1 LIMIT 1`,
      [runId],
    );
    return res.rows[0] ? normalizeTriggerRunRow(res.rows[0]) : null;
  } catch (err) {
    if (isMissingTableError(err)) return null;
    throw err;
  }
}

export async function listManualTriggerRuns(
  pool: pg.Pool,
  filter?: { triggerId?: string },
  limit = 100,
): Promise<ManualTriggerRunRecord[]> {
  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filter?.triggerId) {
      params.push(filter.triggerId);
      conditions.push(`trigger_id = $${params.length}`);
    }
    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(limit);
    const res = await pool.query<TriggerRunRow>(
      `SELECT * FROM external_trigger_runs ${where} ORDER BY created_at DESC LIMIT $${params.length}`,
      params,
    );
    return res.rows.map(normalizeTriggerRunRow);
  } catch (err) {
    if (isMissingTableError(err)) return [];
    throw err;
  }
}
