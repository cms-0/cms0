import "server-only";

import type {
  RuntimeBackupArchive,
  RuntimeBackupRecord,
} from "@cms0/admin-contract";

import { getSelfHostedAdminServer } from "./admin-server";

export type SelfHostedBackupRecord = RuntimeBackupRecord;
export type SelfHostedBackupArchive = RuntimeBackupArchive;

const getRuntime = () => getSelfHostedAdminServer();

export const listSelfHostedBackups = async (): Promise<SelfHostedBackupRecord[]> =>
  getRuntime().listBackups();

export const createSelfHostedBackup = async (input?: {
  description?: string;
  reason?: string;
}) => {
  const backup = await getRuntime().createBackup(input);

  if (!backup) {
    throw new Error("No published descriptor is available to back up yet.");
  }

  return backup;
};

export const deleteSelfHostedBackup = async (backupId: string) => {
  await getRuntime().deleteBackup(backupId);
};

export const restoreSelfHostedBackup = async (backupId: string) => {
  const restored = await getRuntime().restoreBackup(backupId);

  if (!restored) {
    throw new Error("Backup not found.");
  }

  return restored;
};

export const getSelfHostedBackupDescriptor = async (backupId: string) =>
  getRuntime().getBackupDescriptor(backupId);

export const getSelfHostedBackupTypescript = async (backupId: string) =>
  getRuntime().getBackupTypescript(backupId);

export const getSelfHostedBackupArchive = async (
  backupId: string,
): Promise<SelfHostedBackupArchive | null> => getRuntime().getBackup(backupId);
