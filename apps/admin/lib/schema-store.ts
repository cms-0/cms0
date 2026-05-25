// Local admin-specific schema store helpers that use global db
// Note: Main schema operations are now imported from @cms0/admin-server

import { eq, desc } from "drizzle-orm";
import { db, schema } from "./config.db";
import { checksumDescriptor } from "@cms0/admin-server";

const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

export function normalizeSchemaSnapshotChecksum(
  checksum: string | null | undefined,
  descriptor: unknown,
): string {
  const value = typeof checksum === "string" ? checksum.trim() : "";
  if (SHA256_HEX_PATTERN.test(value)) {
    return value.toLowerCase();
  }
  return checksumDescriptor(descriptor);
}

export async function setCurrentSchemaVersion(version: string | null) {
  const existing = await db
    .select()
    .from(schema.schemaMeta)
    .orderBy(desc(schema.schemaMeta.id))
    .limit(1);

  if (!existing.length) {
    await db.insert(schema.schemaMeta).values({
      currentVersion: version,
    });
    return;
  }

  await db
    .update(schema.schemaMeta)
    .set({ currentVersion: version })
    .where(eq(schema.schemaMeta.id, existing[0]!.id));
}
