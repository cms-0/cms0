import "server-only";

import type {
  ManualTriggerExecutionResponse,
  ManualTriggerInput,
  ManualTriggerMethod,
  ManualTriggerRecord,
  ManualTriggerRunRecord,
  ManualTriggerScopeType,
  ManualTriggerTarget,
  ParseManualTriggerInputResult,
} from "@cms0/admin-contract";
import { parseManualTriggerInput } from "@cms0/admin-contract";

import { getSelfHostedAdminServer } from "./admin-server";

export type SelfHostedManualTriggerScopeType = ManualTriggerScopeType;
export type SelfHostedManualTriggerMethod = ManualTriggerMethod;
export type SelfHostedManualTriggerTarget = ManualTriggerTarget;
export type SelfHostedManualTriggerRecord = ManualTriggerRecord;
export type SelfHostedManualTriggerRunRecord = ManualTriggerRunRecord;
export type SelfHostedManualTriggerInput = ManualTriggerInput;
export type SelfHostedManualTriggerExecutionResponse =
  ManualTriggerExecutionResponse;

const getRuntime = () => getSelfHostedAdminServer();

export const parseSelfHostedManualTriggerInput = (
  value: unknown,
): ParseManualTriggerInputResult => parseManualTriggerInput(value);

export const listSelfHostedManualTriggers = async (): Promise<
  SelfHostedManualTriggerRecord[]
> => getRuntime().listManualTriggers();

export const listSelfHostedManualTriggerRuns = async (
  input?: {
    limit?: number;
    triggerId?: string;
  },
): Promise<SelfHostedManualTriggerRunRecord[]> => {
  const runs = await getRuntime().listManualTriggerRuns(input?.triggerId);
  const limit =
    typeof input?.limit === "number" && Number.isFinite(input.limit) && input.limit > 0
      ? input.limit
      : null;

  return limit ? runs.slice(0, limit) : runs;
};

export const createSelfHostedManualTrigger = async (
  input: SelfHostedManualTriggerInput,
) => getRuntime().createManualTrigger(input);

export const updateSelfHostedManualTrigger = async (
  triggerId: string,
  input: SelfHostedManualTriggerInput,
) => {
  const updated = await getRuntime().updateManualTrigger(triggerId, input);

  if (!updated) {
    throw new Error("Trigger not found.");
  }

  return updated;
};

export const deleteSelfHostedManualTrigger = async (triggerId: string) => {
  await getRuntime().deleteManualTrigger(triggerId);
};

export const runSelfHostedManualTrigger = async (
  triggerId: string,
): Promise<SelfHostedManualTriggerExecutionResponse> => {
  const execution = await getRuntime().runManualTrigger(triggerId);

  if (!execution) {
    throw new Error("Trigger not found or is disabled.");
  }

  return execution;
};
