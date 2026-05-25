/**
 * Trigger Store Adapter
 *
 * Shared TriggerStoreAdapter implementation for both self-hosted and hosted apps.
 */

import type { TriggerStoreAdapter } from "../binding-factory/types";
import type { AdapterConfig } from "./types";
import type {
  ManualTriggerRecord,
  ManualTriggerRunRecord,
} from "@cms0/admin-contract";
import type { ManualTriggerInput } from "../manual-triggers/types";
import {
  listManualTriggers,
  getManualTriggerById,
  createManualTrigger,
  updateManualTrigger,
  deleteManualTrigger,
  createManualTriggerRun,
  updateManualTriggerRun,
  listManualTriggerRuns,
  getManualTriggerRunById,
} from "../manual-triggers";
import { runManualTrigger } from "../manual-triggers-runner";

/**
 * Create a trigger store adapter
 */
export function createTriggerStoreAdapter(
  config: AdapterConfig & { fullExecute?: boolean },
): TriggerStoreAdapter {
  const { pool, fullExecute = false } = config;

  return {
    async list() {
      return listManualTriggers(pool) as Promise<ManualTriggerRecord[]>;
    },

    async create(input) {
      return createManualTrigger(
        pool,
        input as ManualTriggerInput,
        null,
      ) as Promise<ManualTriggerRecord>;
    },

    async update(triggerId, input) {
      return updateManualTrigger(
        pool,
        triggerId,
        input as Partial<ManualTriggerInput>,
      ) as Promise<ManualTriggerRecord | null>;
    },

    async delete(triggerId) {
      await deleteManualTrigger(pool, triggerId);
    },

    async getById(triggerId) {
      return getManualTriggerById(
        pool,
        triggerId,
      ) as Promise<ManualTriggerRecord | null>;
    },

    async listRuns(limit?: number, triggerId?: string) {
      return listManualTriggerRuns(
        pool,
        triggerId ? { triggerId } : undefined,
        limit,
      ) as Promise<ManualTriggerRunRecord[]>;
    },

    async getRunById(runId) {
      return getManualTriggerRunById(
        pool,
        runId,
      ) as Promise<ManualTriggerRunRecord | null>;
    },

    async createRun(input) {
      const run = await createManualTriggerRun(pool, input.triggerId, {
        status: input.status,
        initiatedBy: input.initiatedBy,
        resourceContext: input.resourceContext ?? {},
      });
      return run as ManualTriggerRunRecord;
    },

    async updateRun(runId, updates) {
      await updateManualTriggerRun(pool, runId, updates);
    },

    async execute(trigger, context) {
      if (!fullExecute) {
        // Stub implementation for self-hosted
        return {
          success: true,
          responseStatus: 200,
          responseBodyPreview: null,
          error: null,
          durationMs: 0,
        };
      }

      // Full implementation for runtimes that execute trigger HTTP requests.
      const run = await createManualTriggerRun(pool, trigger.id, {
        status: "pending",
        initiatedBy: null,
        resourceContext: context ?? {},
      });

      const result = await runManualTrigger(
        {
          runId: run.id,
          triggerId: trigger.id,
          context: context as any,
          user: null,
          attempts: trigger.attempts,
          backoffMs: trigger.backoffMs,
        },
        {
          getTriggerById: (id: string) =>
            getManualTriggerById(
              pool,
              id,
            ) as Promise<ManualTriggerRecord | null>,
          getRunById: (id: string) =>
            getManualTriggerRunById(pool, id) as Promise<{
              id: string;
              status: string;
            } | null>,
          markRunRunning: async (input: { runId: string }) => {
            await updateManualTriggerRun(pool, input.runId, {
              status: "running",
            });
          },
          markRunFailed: async (input: {
            runId: string;
            errorMessage: string;
            responseStatus?: number | null;
            responseBodyPreview?: string | null;
            durationMs?: number;
          }) => {
            await updateManualTriggerRun(pool, input.runId, {
              status: "failed",
              errorMessage: input.errorMessage,
              responseStatus: input.responseStatus ?? null,
              responseBodyPreview: input.responseBodyPreview ?? null,
              finishedAt: new Date().toISOString(),
              ...(input.durationMs !== undefined && {
                durationMs: input.durationMs,
              }),
            });
          },
          markRunSuccess: async (input: {
            runId: string;
            responseStatus: number;
            responseBodyPreview: string | null;
            durationMs: number;
          }) => {
            await updateManualTriggerRun(pool, input.runId, {
              status: "success",
              responseStatus: input.responseStatus,
              responseBodyPreview: input.responseBodyPreview,
              finishedAt: new Date().toISOString(),
              durationMs: input.durationMs,
            });
          },
        },
      );

      return {
        success: true,
        responseStatus: result.responseStatus,
        responseBodyPreview: result.responseBodyPreview,
        error: null,
        durationMs: result.durationMs,
      };
    },
  };
}
