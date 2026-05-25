import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  boolean,
  customType,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Meta tables (schema snapshots + current version pointer)
export const schemaSnapshots = pgTable("schema_snapshots", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  version: text("version"),
  descriptor: jsonb("descriptor").notNull(),
  checksum: text("checksum"),
  createdAt: text("created_at"),
});

export const schemaMeta = pgTable("schema_meta", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  currentVersion: text("current_version"),
});

export const schemaBackups = pgTable("schema_backups", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  reason: text("reason").notNull(),
  fromVersion: text("from_version"),
  toVersion: text("to_version"),
  fromChecksum: text("from_checksum"),
  toChecksum: text("to_checksum"),
  descriptor: jsonb("descriptor").notNull(),
  descriptorChecksum: text("descriptor_checksum").notNull(),
  dataFingerprint: text("data_fingerprint").notNull(),
  dataFileName: text("data_file_name").notNull(),
  dataChecksum: text("data_checksum").notNull(),
  rowCounts: jsonb("row_counts"),
  tableCount: integer("table_count"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull(),
  restoredAt: text("restored_at"),
  createdAt: text("created_at").notNull(),
});

export const schemaBackupData = pgTable(
  "schema_backup_data",
  {
    backupId: uuid("backup_id").primaryKey().notNull(),
    payload: bytea("payload").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.backupId],
      foreignColumns: [schemaBackups.id],
      name: "schema_backup_data_backup_id_schema_backups_id_fk",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

export const externalTriggers = pgTable("external_triggers", {
  id: uuid("id").defaultRandom().primaryKey().notNull(),
  name: text("name").notNull(),
  buttonLabel: text("button_label").notNull(),
  successMessage: text("success_message"),
  enabled: boolean("enabled").notNull().default(true),
  canvasOnly: boolean("canvas_only").notNull().default(false),
  target: text("target"),
  scopeType: text("scope_type").notNull(),
  scopeName: text("scope_name"),
  method: text("method").notNull(),
  url: text("url").notNull(),
  headersJson: jsonb("headers_json"),
  queryParamsJson: jsonb("query_params_json"),
  bodyTemplate: text("body_template"),
  timeoutMs: integer("timeout_ms"),
  extraWaitMs: integer("extra_wait_ms"),
  attempts: integer("attempts"),
  backoffMs: integer("backoff_ms"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const externalTriggerRuns = pgTable(
  "external_trigger_runs",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    triggerId: uuid("trigger_id").notNull(),
    status: text("status").notNull(),
    requestPayload: jsonb("request_payload"),
    responseStatus: integer("response_status"),
    responseBodyPreview: text("response_body_preview"),
    errorMessage: text("error_message"),
    attempt: integer("attempt"),
    resourceContext: jsonb("resource_context"),
    initiatedBy: text("initiated_by"),
    startedAt: text("started_at"),
    finishedAt: text("finished_at"),
    durationMs: integer("duration_ms"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.triggerId],
      foreignColumns: [externalTriggers.id],
      name: "external_trigger_runs_trigger_id_external_triggers_id_fk",
    })
      .onDelete("cascade")
      .onUpdate("cascade"),
  ],
);

export const usageMonths = pgTable(
  "usage_months",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    environmentKey: text("environment_key").notNull(),
    monthKey: text("month_key").notNull(),
    apiCalls: integer("api_calls").notNull().default(0),
    readCalls: integer("read_calls").notNull().default(0),
    writeCalls: integer("write_calls").notNull().default(0),
    contentReads: integer("content_reads").notNull().default(0),
    contentWrites: integer("content_writes").notNull().default(0),
    schemaPublishes: integer("schema_publishes").notNull().default(0),
    bytesIn: integer("bytes_in").notNull().default(0),
    bytesOut: integer("bytes_out").notNull().default(0),
    lastRequestAt: text("last_request_at"),
    lastMutationAt: text("last_mutation_at"),
  },
  (table) => [
    uniqueIndex("usage_months_env_month_idx").on(
      table.environmentKey,
      table.monthKey,
    ),
  ],
);

export const usageControlMonths = pgTable(
  "usage_control_months",
  {
    id: uuid("id").defaultRandom().primaryKey().notNull(),
    environmentKey: text("environment_key").notNull(),
    monthKey: text("month_key").notNull(),
    apiCalls: integer("api_calls").notNull().default(0),
    readCalls: integer("read_calls").notNull().default(0),
    writeCalls: integer("write_calls").notNull().default(0),
    contentReads: integer("content_reads").notNull().default(0),
    contentWrites: integer("content_writes").notNull().default(0),
    schemaPublishes: integer("schema_publishes").notNull().default(0),
    bytesIn: integer("bytes_in").notNull().default(0),
    bytesOut: integer("bytes_out").notNull().default(0),
    lastRequestAt: text("last_request_at"),
    lastMutationAt: text("last_mutation_at"),
  },
  (table) => [
    uniqueIndex("usage_control_months_env_month_idx").on(
      table.environmentKey,
      table.monthKey,
    ),
  ],
);
