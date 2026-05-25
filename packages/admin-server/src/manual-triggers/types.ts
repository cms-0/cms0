/**
 * Manual Triggers Types
 */

export type ManualTriggerTarget = "editor" | "canvas" | "both";
export type ManualTriggerScopeType = "global" | "collection" | "singleton";

export type ManualTriggerRecord = {
  id: string;
  name: string;
  buttonLabel: string;
  successMessage: string | null;
  enabled: boolean;
  target: ManualTriggerTarget;
  scopeType: ManualTriggerScopeType;
  scopeName: string | null;
  method: string;
  url: string;
  headersJson: Record<string, string> | null;
  queryParamsJson: Record<string, string> | null;
  bodyTemplate: string | null;
  timeoutMs: number | null;
  extraWaitMs: number | null;
  attempts: number | null;
  backoffMs: number | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ManualTriggerRunRecord = {
  id: string;
  triggerId: string;
  status: string;
  requestPayload: Record<string, unknown> | null;
  responseStatus: number | null;
  responseBodyPreview: string | null;
  errorMessage: string | null;
  attempt: number | null;
  resourceContext: Record<string, unknown> | null;
  initiatedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type ManualTriggerInput = {
  name?: string;
  buttonLabel?: string;
  successMessage?: string | null;
  enabled?: boolean;
  target?: ManualTriggerTarget;
  scopeType?: ManualTriggerScopeType;
  scopeName?: string | null;
  method?: string;
  url?: string;
  headersJson?: Record<string, string> | null;
  queryParamsJson?: Record<string, string> | null;
  bodyTemplate?: string | null;
  timeoutMs?: number | null;
  extraWaitMs?: number | null;
  attempts?: number | null;
  backoffMs?: number | null;
};

export type ManualTriggerContext = {
  resourceId?: string;
  resourcePath?: string;
};

export type TriggerRow = {
  id: string;
  name: string;
  button_label: string;
  success_message: string | null;
  enabled: boolean;
  target: string | null;
  canvas_only: boolean;
  scope_type: string | null;
  scope_name: string | null;
  method: string;
  url: string;
  headers_json: unknown;
  query_params_json: unknown;
  body_template: string | null;
  timeout_ms: number | null;
  extra_wait_ms: number | null;
  attempts: number | null;
  backoff_ms: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TriggerRunRow = {
  id: string;
  trigger_id: string;
  status: string;
  request_payload: unknown;
  response_status: number | null;
  response_body_preview: string | null;
  error_message: string | null;
  attempt: number | null;
  resource_context: unknown;
  initiated_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
};
