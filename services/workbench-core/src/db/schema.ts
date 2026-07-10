import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color"),
  icon: text("icon"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id"),
  title: text("title").notNull(),
  status: text("status").notNull(),
  source: text("source").notNull(),
  tagsJson: text("tags_json"),
  contextJson: text("context_json"),
  timerPolicyId: text("timer_policy_id"),
  estimateMinutes: integer("estimate_minutes"),
  plannedDate: text("planned_date"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const timerPolicies = sqliteTable("timer_policies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  configJson: text("config_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const focusSessions = sqliteTable("focus_sessions", {
  id: text("id").primaryKey(),
  taskId: text("task_id"),
  projectId: text("project_id"),
  policyId: text("policy_id").notNull(),
  plannedMinutes: integer("planned_minutes"),
  actualMinutes: integer("actual_minutes"),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  activityEvidenceJson: text("activity_evidence_json"),
  musicContextJson: text("music_context_json"),
  adjustmentLogJson: text("adjustment_log_json")
});

export const focusSegments = sqliteTable("focus_segments", {
  id: text("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  type: text("type").notNull(),
  startedAt: text("started_at").notNull(),
  endedAt: text("ended_at"),
  durationSeconds: integer("duration_seconds"),
  note: text("note")
});

export const activitySnapshots = sqliteTable("activity_snapshots", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  date: text("date").notNull(),
  startedAt: text("started_at"),
  endedAt: text("ended_at"),
  payloadJson: text("payload_json").notNull(),
  createdAt: text("created_at").notNull()
});

export const dailyReviews = sqliteTable("daily_reviews", {
  id: text("id").primaryKey(),
  date: text("date").notNull(),
  summary: text("summary"),
  reviewJson: text("review_json").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const musicState = sqliteTable("music_state", {
  id: text("id").primaryKey(),
  playing: integer("playing").notNull(),
  mood: text("mood").notNull(),
  currentJson: text("current_json"),
  queueJson: text("queue_json").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const workstationSettings = sqliteTable("workstation_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const widgetSettings = sqliteTable("widget_settings", {
  id: text("id").primaryKey(),
  enabled: integer("enabled").notNull(),
  modesJson: text("modes_json").notNull(),
  refreshIntervalSeconds: integer("refresh_interval_seconds"),
  sizeJson: text("size_json"),
  positionJson: text("position_json"),
  optionsJson: text("options_json"),
  updatedAt: text("updated_at").notNull()
});
