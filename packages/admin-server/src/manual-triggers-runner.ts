// Manual Trigger Runner - HTTP execution with retry logic
// Extracted from apps/admin/lib/external-triggers/runner.ts for shared use

import { renderTemplate, buildTemplateContext, type ManualTriggerContext } from "./manual-triggers-core";
import type { ManualTriggerRecord } from "@cms0/admin-contract";

const RESPONSE_PREVIEW_MAX_LENGTH = 6000;

export type ManualTriggerStoreCallbacks = {
  getTriggerById: (triggerId: string) => Promise<ManualTriggerRecord | null>;
  getRunById: (runId: string) => Promise<{ id: string; status: string } | null>;
  markRunRunning: (input: {
    runId: string;
    attempt: number;
    requestPayload: {
      method: string;
      url: string;
      headers: Record<string, string>;
      body: string | null;
      timeoutMs: number;
    };
  }) => Promise<void>;
  markRunFailed: (input: {
    runId: string;
    errorMessage: string;
    responseStatus?: number | null;
    responseBodyPreview?: string | null;
    durationMs?: number;
  }) => Promise<void>;
  markRunSuccess: (input: {
    runId: string;
    responseStatus: number;
    responseBodyPreview: string | null;
    durationMs: number;
  }) => Promise<void>;
};

export type ManualTriggerExecutionPayload = {
  runId: string;
  triggerId: string;
  context: ManualTriggerContext;
  user: {
    id?: string;
    email?: string | null;
  } | null;
  attempts?: number | null;
  backoffMs?: number | null;
};

type TriggerExecutionError = Error & {
  responseStatus?: number;
  responseBodyPreview?: string;
};

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toPreview(value: string): string {
  if (value.length <= RESPONSE_PREVIEW_MAX_LENGTH) return value;
  return `${value.slice(0, RESPONSE_PREVIEW_MAX_LENGTH)}…`;
}

type SemanticFailure = {
  status: number | null;
  message: string;
};

function readFailureMessage(source: Record<string, unknown>): string | null {
  const directMessage =
    typeof source.message === "string"
      ? source.message.trim()
      : typeof source.detail === "string"
        ? source.detail.trim()
        : null;

  if (directMessage) return directMessage;

  if (typeof source.error === "string") {
    const message = source.error.trim();
    if (message) return message;
  }

  if (source.error && typeof source.error === "object" && !Array.isArray(source.error)) {
    const nested = source.error as Record<string, unknown>;
    if (typeof nested.message === "string" && nested.message.trim()) {
      return nested.message.trim();
    }
  }

  return null;
}

export function detectSemanticFailureFromBody(responseText: string): SemanticFailure | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }

  const body = parsed as Record<string, unknown>;
  const nestedError =
    body.error && typeof body.error === "object" && !Array.isArray(body.error)
      ? (body.error as Record<string, unknown>)
      : null;

  const statusCandidates = [
    body.status,
    body.statusCode,
    nestedError?.status,
    nestedError?.statusCode,
  ];
  const semanticStatus = statusCandidates.find(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value) && Math.floor(value) === value,
  );

  if (typeof semanticStatus === "number" && (semanticStatus < 200 || semanticStatus >= 300)) {
    const message =
      readFailureMessage(body) ??
      `Trigger response indicated failure status ${semanticStatus}.`;
    return {
      status: semanticStatus,
      message,
    };
  }

  if (body.ok === false || body.success === false || body.error === true) {
    return {
      status: typeof semanticStatus === "number" ? semanticStatus : null,
      message: readFailureMessage(body) ?? "Trigger response indicated failure.",
    };
  }

  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildResolvedRequest(
  trigger: ManualTriggerRecord,
  context: Record<string, unknown>,
) {
  const method = String(trigger.method || "POST").toUpperCase();
  const urlTemplate = renderTemplate(trigger.url, context);
  const url = new URL(urlTemplate);

  const queryParams = trigger.queryParamsJson ?? {};
  for (const [key, rawValue] of Object.entries(queryParams)) {
    const rendered = renderTemplate(String(rawValue), context);
    if (!rendered) continue;
    url.searchParams.set(key, rendered);
  }

  const headers: Record<string, string> = {};
  const headerSource = trigger.headersJson ?? {};
  for (const [key, rawValue] of Object.entries(headerSource)) {
    const headerName = key.trim();
    if (!headerName) continue;
    headers[headerName] = renderTemplate(String(rawValue), context);
  }

  let body: string | undefined;
  if (trigger.bodyTemplate && method !== "GET" && method !== "DELETE") {
    body = renderTemplate(trigger.bodyTemplate, context);
    if (body) {
      const parsed = tryParseJson(body);
      if (
        parsed &&
        !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")
      ) {
        headers["content-type"] = "application/json";
      }
    }
  }

  const timeoutMs =
    typeof trigger.timeoutMs === "number" && trigger.timeoutMs > 0
      ? trigger.timeoutMs
      : 15_000;

  return {
    method,
    url: url.toString(),
    headers,
    body,
    timeoutMs,
  };
}

async function executeOnce(params: {
  runId: string;
  attempt: number;
  request: ReturnType<typeof buildResolvedRequest>;
  callbacks: ManualTriggerStoreCallbacks;
}): Promise<{ responseStatus: number; responseBodyPreview: string; durationMs: number }> {
  const { runId, attempt, request, callbacks } = params;
  
  await callbacks.markRunRunning({
    runId,
    attempt,
    requestPayload: {
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body ?? null,
      timeoutMs: request.timeoutMs,
    },
  });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), request.timeoutMs);

  try {
    const response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });

    const responseText = await response.text();
    const durationMs = Date.now() - started;

    const semanticFailure = response.ok
      ? detectSemanticFailureFromBody(responseText)
      : null;
    if (semanticFailure) {
      const error = new Error(semanticFailure.message) as TriggerExecutionError;
      error.responseStatus = semanticFailure.status ?? response.status;
      error.responseBodyPreview = toPreview(responseText);
      throw error;
    }

    if (!response.ok) {
      const error = new Error(`Trigger HTTP ${response.status}`) as TriggerExecutionError;
      error.responseStatus = response.status;
      error.responseBodyPreview = toPreview(responseText);
      throw error;
    }

    return {
      responseStatus: response.status,
      responseBodyPreview: toPreview(responseText),
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - started;
    const executionError =
      error instanceof Error ? (error as TriggerExecutionError) : null;
    const message = executionError ? executionError.message : String(error);
    await callbacks.markRunFailed({
      runId,
      errorMessage: message,
      responseStatus: executionError?.responseStatus ?? null,
      responseBodyPreview: executionError?.responseBodyPreview ?? null,
      durationMs,
    });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function runManualTrigger(
  payload: ManualTriggerExecutionPayload,
  callbacks: ManualTriggerStoreCallbacks,
): Promise<{ runId: string; attempt: number; responseStatus: number; responseBodyPreview: string; durationMs: number }> {
  const run = await callbacks.getRunById(payload.runId);
  if (!run) {
    throw new Error(`Run '${payload.runId}' not found.`);
  }

  const trigger = await callbacks.getTriggerById(payload.triggerId);
  if (!trigger) {
    await callbacks.markRunFailed({
      runId: payload.runId,
      errorMessage: `Trigger '${payload.triggerId}' not found.`,
    });
    throw new Error(`Trigger '${payload.triggerId}' not found.`);
  }

  if (!trigger.enabled) {
    await callbacks.markRunFailed({
      runId: payload.runId,
      errorMessage: `Trigger '${trigger.name}' is disabled.`,
    });
    throw new Error(`Trigger '${trigger.name}' is disabled.`);
  }

  const templateContext = buildTemplateContext({
    context: payload.context,
    user: payload.user,
  });
  const request = buildResolvedRequest(trigger, templateContext);

  const maxAttempts =
    typeof payload.attempts === "number" && payload.attempts > 1
      ? Math.floor(payload.attempts)
      : 1;
  const backoffMs =
    typeof payload.backoffMs === "number" && payload.backoffMs > 0
      ? Math.floor(payload.backoffMs)
      : 0;
  const extraWaitMs =
    typeof trigger.extraWaitMs === "number" && trigger.extraWaitMs > 0
      ? Math.floor(trigger.extraWaitMs)
      : 0;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await executeOnce({
        runId: payload.runId,
        attempt,
        request,
        callbacks,
      });

      if (extraWaitMs > 0) {
        await delay(extraWaitMs);
      }

      await callbacks.markRunSuccess({
        runId: payload.runId,
        responseStatus: result.responseStatus,
        responseBodyPreview: result.responseBodyPreview,
        durationMs: result.durationMs + extraWaitMs,
      });

      return {
        runId: payload.runId,
        attempt,
        ...result,
      };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      if (backoffMs > 0) {
        await delay(backoffMs);
      }
    }
  }

  throw (lastError instanceof Error
    ? lastError
    : new Error("Trigger execution failed."));
}
