// Manual Trigger Core - Pure business logic for trigger execution
// Extracted from apps/admin/lib/external-triggers/core.ts for shared use

export const MANUAL_TRIGGER_SCOPE_TYPES = ["global", "root", "model"] as const;
export type ManualTriggerScopeType = (typeof MANUAL_TRIGGER_SCOPE_TYPES)[number];

export const MANUAL_TRIGGER_TARGETS = ["editor", "canvas", "both"] as const;
export type ManualTriggerTarget = (typeof MANUAL_TRIGGER_TARGETS)[number];

export const MANUAL_TRIGGER_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
] as const;
export type ManualTriggerMethod = (typeof MANUAL_TRIGGER_METHODS)[number];

export type ManualTriggerContext = {
  resourceType?: "root" | "model" | "global";
  resourceName?: string;
  pathname?: string;
  locale?: string;
  defaultLocale?: string;
  id?: string;
  rootIds?: string[];
  [key: string]: unknown;
};

export type ManualTriggerInput = {
  name: string;
  buttonLabel: string;
  successMessage: string | null;
  enabled: boolean;
  target: ManualTriggerTarget;
  scopeType: ManualTriggerScopeType;
  scopeName: string | null;
  method: ManualTriggerMethod;
  url: string;
  headersJson: Record<string, string> | null;
  queryParamsJson: Record<string, string> | null;
  bodyTemplate: string | null;
  timeoutMs: number | null;
  extraWaitMs: number | null;
  attempts: number | null;
  backoffMs: number | null;
};

type NormalizeOptions = {
  partial?: boolean;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function parseInteger(value: unknown, field: string): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return parsed;
}

export function parseStringRecord(value: unknown, field: string): Record<string, string> | null {
  if (value == null || value === "") return null;

  const source =
    typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value) as unknown;
          } catch {
            throw new Error(`${field} must be valid JSON object.`);
          }
        })()
      : value;

  if (!isPlainRecord(source)) {
    throw new Error(`${field} must be a JSON object.`);
  }

  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(source)) {
    const normalizedKey = key.trim();
    if (!normalizedKey) continue;
    if (raw == null) continue;
    out[normalizedKey] = String(raw);
  }

  return Object.keys(out).length ? out : null;
}

export function normalizeManualTriggerInput(
  value: unknown,
  options: { partial: true },
): Partial<ManualTriggerInput>;
export function normalizeManualTriggerInput(
  value: unknown,
  options?: { partial?: false | undefined },
): ManualTriggerInput;
export function normalizeManualTriggerInput(
  value: unknown,
  options: NormalizeOptions = {},
): Partial<ManualTriggerInput> | ManualTriggerInput {
  const source = isPlainRecord(value) ? value : {};
  const partial = options.partial === true;

  const name = toTrimmedString(source.name);
  const buttonLabel = toTrimmedString(source.buttonLabel);
  const successMessage = toTrimmedString(source.successMessage);
  const scopeTypeRaw = toTrimmedString(source.scopeType).toLowerCase();
  const methodRaw = toTrimmedString(source.method).toUpperCase();
  const url = toTrimmedString(source.url);

  const has = (key: string) => Object.prototype.hasOwnProperty.call(source, key);

  const patch: Partial<ManualTriggerInput> = {};

  if (!partial || has("name")) {
    if (!name) throw new Error("name is required.");
    patch.name = name;
  }

  if (!partial || has("buttonLabel")) {
    patch.buttonLabel = buttonLabel || name;
    if (!patch.buttonLabel) {
      throw new Error("buttonLabel is required.");
    }
  }

  if (!partial || has("successMessage")) {
    patch.successMessage = successMessage || null;
  }

  if (!partial || has("enabled")) {
    patch.enabled = parseBoolean(source.enabled, true);
  }

  if (!partial || has("target")) {
    const targetRaw = toTrimmedString(source.target).toLowerCase();
    if (!targetRaw) {
      if (!partial) {
        patch.target = "editor";
      }
    } else {
      if (!MANUAL_TRIGGER_TARGETS.includes(targetRaw as ManualTriggerTarget)) {
        throw new Error(`target must be one of: ${MANUAL_TRIGGER_TARGETS.join(", ")}.`);
      }
      patch.target = targetRaw as ManualTriggerTarget;
    }
  }

  if (!partial || has("scopeType")) {
    if (!MANUAL_TRIGGER_SCOPE_TYPES.includes(scopeTypeRaw as ManualTriggerScopeType)) {
      throw new Error(`scopeType must be one of: ${MANUAL_TRIGGER_SCOPE_TYPES.join(", ")}.`);
    }
    patch.scopeType = scopeTypeRaw as ManualTriggerScopeType;
  }

  if (!partial || has("scopeName") || patch.scopeType) {
    const scopeName = toTrimmedString(source.scopeName);
    const effectiveScope = patch.scopeType ?? undefined;
    if (
      effectiveScope &&
      effectiveScope !== "global" &&
      !scopeName
    ) {
      throw new Error("scopeName is required for root/model scoped triggers.");
    }
    patch.scopeName = scopeName || null;
  }

  if (!partial || has("method")) {
    if (!MANUAL_TRIGGER_METHODS.includes(methodRaw as ManualTriggerMethod)) {
      throw new Error(`method must be one of: ${MANUAL_TRIGGER_METHODS.join(", ")}.`);
    }
    patch.method = methodRaw as ManualTriggerMethod;
  }

  if (!partial || has("url")) {
    if (!url) throw new Error("url is required.");
    try {
      new URL(url);
    } catch {
      throw new Error("url must be a valid absolute URL.");
    }
    patch.url = url;
  }

  if (!partial || has("headersJson")) {
    patch.headersJson = parseStringRecord(source.headersJson, "headersJson");
  }

  if (!partial || has("queryParamsJson")) {
    patch.queryParamsJson = parseStringRecord(source.queryParamsJson, "queryParamsJson");
  }

  if (!partial || has("bodyTemplate")) {
    const bodyTemplate = toTrimmedString(source.bodyTemplate);
    patch.bodyTemplate = bodyTemplate || null;
  }

  if (!partial || has("timeoutMs")) {
    patch.timeoutMs = parseInteger(source.timeoutMs, "timeoutMs");
  }

  if (!partial || has("extraWaitMs")) {
    patch.extraWaitMs = parseInteger(source.extraWaitMs, "extraWaitMs");
  }

  if (!partial || has("attempts")) {
    patch.attempts = parseInteger(source.attempts, "attempts");
  }

  if (!partial || has("backoffMs")) {
    patch.backoffMs = parseInteger(source.backoffMs, "backoffMs");
  }

  if (partial) return patch;

  return {
    name: patch.name!,
    buttonLabel: patch.buttonLabel!,
    successMessage: patch.successMessage ?? null,
    enabled: patch.enabled ?? true,
    target: patch.target ?? "editor",
    scopeType: patch.scopeType!,
    scopeName: patch.scopeName ?? null,
    method: patch.method!,
    url: patch.url!,
    headersJson: patch.headersJson ?? null,
    queryParamsJson: patch.queryParamsJson ?? null,
    bodyTemplate: patch.bodyTemplate ?? null,
    timeoutMs: patch.timeoutMs ?? null,
    extraWaitMs: patch.extraWaitMs ?? null,
    attempts: patch.attempts ?? null,
    backoffMs: patch.backoffMs ?? null,
  };
}

export function matchesManualTriggerScope(
  trigger: { scopeType: ManualTriggerScopeType; scopeName: string | null; enabled: boolean },
  context: ManualTriggerContext,
): boolean {
  if (!trigger.enabled) return false;
  if (trigger.scopeType === "global") return true;

  const ctxType = typeof context.resourceType === "string" ? context.resourceType : "";
  const ctxName = typeof context.resourceName === "string" ? context.resourceName : "";

  if (trigger.scopeType === "root") {
    return ctxType === "root" && ctxName === (trigger.scopeName ?? "");
  }

  if (trigger.scopeType === "model") {
    return ctxType === "model" && ctxName === (trigger.scopeName ?? "");
  }

  return false;
}

function getPathValue(source: unknown, path: string): unknown {
  const segments = path.split(".").filter(Boolean);
  let current: any = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
}

export function renderTemplate(
  template: string,
  context: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_whole, key: string) => {
    const value = getPathValue(context, key);
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  });
}

export function buildTemplateContext(args: {
  context?: ManualTriggerContext;
  user?: { id?: string; email?: string | null } | null;
}): Record<string, unknown> {
  return {
    timestamp: new Date().toISOString(),
    user: {
      id: args.user?.id ?? null,
      email: args.user?.email ?? null,
    },
    ...(args.context ?? {}),
  };
}
