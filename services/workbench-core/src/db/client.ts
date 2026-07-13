import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { WorkbenchConfig } from "../config.js";
import * as schema from "./schema.js";

export const DEFAULT_PROJECTS = [
  { id: "math", name: "数学基础", color: "#b42318", icon: "∑", allocationPercent: 38, description: "数学分析、高代、实变、泛函与 PDE 基础" },
  { id: "kaoyan", name: "考研训练", color: "#247a5a", icon: "◎", allocationPercent: 22, description: "每日题量、专业课推进、证明复现与错题复盘" },
  { id: "basic", name: "课程生活", color: "#52606d", icon: "□", allocationPercent: 10, description: "课程、作业、生活与行政任务" },
  { id: "tech", name: "技术开源", color: "#9a6700", icon: "</>", allocationPercent: 18, description: "开源协作、编程、形式化与数据工程" },
  { id: "research", name: "科研项目", color: "#b54708", icon: "⌁", allocationPercent: 8, description: "导师项目、论文阅读、数学前沿与计算实验" },
  { id: "buffer", name: "缓冲机动", color: "#475467", icon: "…", allocationPercent: 4, description: "突发任务、状态波动、复盘与身体维护" }
] as const;

export type SqliteDatabase = Database.Database;
export type DrizzleDatabase = ReturnType<typeof drizzle>;

export interface DatabaseContext {
  sqlite: SqliteDatabase;
  drizzle: DrizzleDatabase;
}

export function openDatabase(config: WorkbenchConfig): DatabaseContext {
  const sqlite = new Database(config.databasePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  migrate(sqlite);
  seedDefaults(sqlite, config);

  return {
    sqlite,
    drizzle: drizzle(sqlite, { schema })
  };
}

export function migrate(sqlite: SqliteDatabase): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      icon TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      tags_json TEXT,
      context_json TEXT,
      timer_policy_id TEXT,
      estimate_minutes INTEGER,
      planned_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS timer_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mode TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS focus_sessions (
      id TEXT PRIMARY KEY,
      task_id TEXT,
      project_id TEXT,
      policy_id TEXT NOT NULL,
      planned_minutes INTEGER,
      actual_minutes INTEGER,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      activity_evidence_json TEXT,
      music_context_json TEXT,
      adjustment_log_json TEXT
    );

    CREATE TABLE IF NOT EXISTS focus_segments (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_seconds INTEGER,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS activity_snapshots (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      date TEXT NOT NULL,
      started_at TEXT,
      ended_at TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_reviews (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      summary TEXT,
      review_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS music_state (
      id TEXT PRIMARY KEY,
      playing INTEGER NOT NULL,
      mood TEXT NOT NULL,
      current_json TEXT,
      queue_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workstation_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS widget_settings (
      id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL,
      modes_json TEXT NOT NULL,
      refresh_interval_seconds INTEGER,
      size_json TEXT,
      position_json TEXT,
      options_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_planned_date ON tasks(planned_date);
    CREATE INDEX IF NOT EXISTS idx_tasks_timer_policy_id ON tasks(timer_policy_id);

    CREATE INDEX IF NOT EXISTS idx_focus_sessions_task_id ON focus_sessions(task_id);
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_project_id ON focus_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_started_at ON focus_sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_focus_sessions_ended_at ON focus_sessions(ended_at);

    CREATE INDEX IF NOT EXISTS idx_focus_segments_session_id ON focus_segments(session_id);
    CREATE INDEX IF NOT EXISTS idx_focus_segments_started_at ON focus_segments(started_at);

    CREATE INDEX IF NOT EXISTS idx_activity_snapshots_source_date ON activity_snapshots(source, date);
    CREATE INDEX IF NOT EXISTS idx_daily_reviews_date ON daily_reviews(date);
  `);
}

function seedDefaults(sqlite: SqliteDatabase, config: WorkbenchConfig): void {
  const now = new Date().toISOString();
  const insertProject = sqlite.prepare(
    `INSERT OR IGNORE INTO projects (id, name, color, icon, created_at, updated_at)
     VALUES (@id, @name, @color, @icon, @createdAt, @updatedAt)`
  );
  for (const project of DEFAULT_PROJECTS) {
    insertProject.run({ ...project, createdAt: now, updatedAt: now });
  }

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO timer_policies
        (id, name, mode, config_json, created_at, updated_at)
       VALUES (@id, @name, @mode, @configJson, @createdAt, @updatedAt)`
    )
    .run({
      id: "elastic-50-10",
      name: "弹性 50 + 10",
      mode: "elastic-block",
      configJson: JSON.stringify({
        defaultFocusMinutes: 50,
        defaultBreakMinutes: 10,
        allowExtend: true,
        allowShorten: true,
        allowSkipBreak: true,
        allowManualAdjustment: true,
        softReminderAfterMinutes: 50,
        hardReminderAfterMinutes: 100
      }),
      createdAt: now,
      updatedAt: now
    });

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO music_state
        (id, playing, mood, current_json, queue_json, updated_at)
       VALUES ('current', 0, 'deep-focus', NULL, '[]', @updatedAt)`
    )
    .run({ updatedAt: now });

  sqlite
    .prepare(
      `INSERT OR IGNORE INTO workstation_settings (key, value_json, updated_at)
       VALUES ('workstation', @valueJson, @updatedAt)`
    )
    .run({
      valueJson: JSON.stringify(defaultWorkstationSettings(now, config)),
      updatedAt: now
    });

  const insertWidget = sqlite.prepare(
    `INSERT OR IGNORE INTO widget_settings
      (id, enabled, modes_json, refresh_interval_seconds, size_json, position_json, options_json, updated_at)
     VALUES
      (@id, @enabled, @modesJson, @refreshIntervalSeconds, @sizeJson, @positionJson, @optionsJson, @updatedAt)`
  );
  for (const widget of defaultWidgetSettings(now)) {
    insertWidget.run({
      id: widget.id,
      enabled: widget.enabled ? 1 : 0,
      modesJson: JSON.stringify(widget.modes),
      refreshIntervalSeconds: widget.refreshIntervalSeconds,
      sizeJson: JSON.stringify(widget.size),
      positionJson: JSON.stringify(widget.position),
      optionsJson: JSON.stringify(widget.options ?? {}),
      updatedAt: now
    });
  }
}

function defaultWorkstationSettings(updatedAt: string, config: WorkbenchConfig): Record<string, unknown> {
  return {
    defaultMode: "study",
    modes: {
      study: mode("deep-study", "elastic-50-10", "deep-focus", [
        "workstation.task-board",
        "workstation.flex-timer",
        "workstation.activitywatch-now",
        "workstation.music-mini"
      ]),
      coding: mode("coding", "elastic-50-10", "coding", [
        "workstation.task-board",
        "workstation.flex-timer",
        "workstation.github-heatmap",
        "workstation.token-usage",
        "workstation.music-mini"
      ]),
      writing: mode("deep-study", "elastic-50-10", "writing", ["workstation.task-board", "workstation.flex-timer"]),
      music: mode("music-cinema", "elastic-50-10", "music", ["workstation.music-mini"]),
      review: mode("review-paper", "elastic-50-10", "ambient", [
        "workstation.activity-summary",
        "workstation.daily-review"
      ]),
      rest: mode("rest-soft", "elastic-50-10", "relaxed", ["workstation.music-mini"])
    },
    activitywatch: {
      enabled: true,
      baseUrl: config.activityWatchUrl,
      watchers: { window: true, afk: true, web: true },
      afkCorrection: { enabled: true, thresholdMinutes: 5 },
      showEvidenceInReview: true
    },
    activityStats: {
      tokeiRepo: config.tokeiRepo,
      tokeiPython: config.tokeiPython,
      githubUsername: config.githubUsername,
      refreshIntervalMinutes: 5,
      cacheEnabled: true,
      includeInReview: true,
      linkToCurrentProject: true
    },
    music: {
      enabled: true,
      provider: config.musicServiceUrl ? "remote" : "mineradio",
      serviceUrl: config.musicServiceUrl,
      enableLyrics: false,
      enableDesktopLyrics: false,
      playlistTrackIds: [],
      moodRules: {
        study: "deep-focus",
        coding: "coding",
        writing: "writing",
        review: "ambient",
        rest: "relaxed"
      }
    },
    tasks: {
      defaultPlannedDate: "today",
      defaultTags: [],
      allowTasksWithoutProject: true,
      autoStopTimerOnDone: false,
      projectPreferences: DEFAULT_PROJECTS.map((project) => ({
        ...project,
        defaultTimerPolicyId: "elastic-50-10",
        defaultMusicMood: project.id === "tech" ? "coding" : "deep-focus"
      }))
    },
    theme: {
      globalTheme: "blog-light",
      modeThemes: {
        study: "deep-study",
        coding: "coding",
        music: "music-cinema",
        review: "review-paper",
        rest: "rest-soft"
      },
      widgetOpacity: 0.86,
      blur: true,
      animationLevel: "low",
      density: "comfortable"
    },
    privacy: {
      keepActivityWatchRawDays: 14,
      keepApiCacheDays: 30,
      allowSensitiveTitlesInReview: false
    },
    updatedAt
  };
}

function mode(theme: string, timerPolicyId: string, musicMood: string, widgets: string[]): Record<string, unknown> {
  return {
    theme,
    timerPolicyId,
    musicMood,
    widgets,
    activityWatchCorrection: true,
    activityStatsEnabled: true
  };
}

function defaultWidgetSettings(updatedAt: string): Array<Record<string, unknown>> {
  const widgets = [
    ["workstation.task-board", 10, ["study", "coding", "writing"]],
    ["workstation.flex-timer", 1, ["study", "coding", "writing", "review"]],
    ["workstation.token-usage", 300, ["coding", "review"]],
    ["workstation.github-heatmap", 300, ["coding", "review"]],
    ["workstation.activitywatch-now", 10, ["study", "coding"]],
    ["workstation.activity-summary", 60, ["review"]],
    ["workstation.music-mini", 2, ["study", "coding", "music", "rest"]],
    ["workstation.daily-review", 0, ["review"]]
  ] as const;

  return widgets.map(([id, refreshIntervalSeconds, modes], index) => ({
    id,
    enabled: true,
    modes,
    refreshIntervalSeconds,
    size: { w: 1, h: 1 },
    position: { x: index % 4, y: Math.floor(index / 4) },
    options: {},
    updatedAt
  }));
}
