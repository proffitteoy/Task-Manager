import { randomUUID } from "node:crypto";

import type {
  DailyReview,
  FocusSegment,
  FocusSession,
  MusicState,
  MusicTrack,
  Project,
  TaskSource,
  TaskStatus,
  TimerAdjustment,
  TimerCurrent,
  TimerMode,
  TimerPolicy,
  TimerPolicyConfig,
  WidgetSettings,
  WorkTask,
  WorkTaskContext,
  WorkstationSettings
} from "@cw/contracts";

import { evaluateBreakReminder } from "./breakReminder.js";

import { DEFAULT_PROJECTS, type SqliteDatabase } from "../db/client.js";

type Row = Record<string, unknown>;

const LEGACY_PLACEHOLDER_MUSIC_TRACK_IDS = ["29764576", "185511"];

export class WorkbenchRepository {
  constructor(private readonly sqlite: SqliteDatabase) {}

  listProjects(): Project[] {
    return (this.sqlite.prepare("SELECT * FROM projects ORDER BY created_at ASC").all() as Row[]).map(mapProject);
  }

  createProject(input: { name: string; color?: string; icon?: string }): Project {
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      name: input.name,
      color: input.color,
      icon: input.icon,
      createdAt: now,
      updatedAt: now
    };
    this.sqlite
      .prepare(
        `INSERT INTO projects (id, name, color, icon, created_at, updated_at)
         VALUES (@id, @name, @color, @icon, @createdAt, @updatedAt)`
      )
      .run(project);
    return project;
  }

  listTasks(): WorkTask[] {
    return (this.sqlite.prepare("SELECT * FROM tasks ORDER BY created_at DESC").all() as Row[]).map(mapTask);
  }

  getTask(id: string): WorkTask | undefined {
    const row = this.sqlite.prepare("SELECT * FROM tasks WHERE id = ?").get(id) as Row | undefined;
    return row ? mapTask(row) : undefined;
  }

  createTask(input: {
    title: string;
    projectId?: string;
    source?: TaskSource;
    status?: TaskStatus;
    tags?: string[];
    context?: WorkTaskContext;
    timerPolicyId?: string;
    estimateMinutes?: number;
    plannedDate?: string;
  }): WorkTask {
    const now = new Date().toISOString();
    const task: WorkTask = {
      id: randomUUID(),
      title: input.title,
      projectId: input.projectId,
      source: input.source ?? "manual",
      status: input.status ?? "todo",
      tags: input.tags ?? [],
      context: input.context,
      timerPolicyId: input.timerPolicyId,
      estimateMinutes: input.estimateMinutes,
      plannedDate: input.plannedDate,
      createdAt: now,
      updatedAt: now
    };
    this.sqlite
      .prepare(
        `INSERT INTO tasks
          (id, project_id, title, status, source, tags_json, context_json, timer_policy_id, estimate_minutes, planned_date, created_at, updated_at)
         VALUES
          (@id, @projectId, @title, @status, @source, @tagsJson, @contextJson, @timerPolicyId, @estimateMinutes, @plannedDate, @createdAt, @updatedAt)`
      )
      .run({
        ...task,
        tagsJson: JSON.stringify(task.tags),
        contextJson: stringifyNullable(task.context)
      });
    return task;
  }

  updateTask(id: string, input: Partial<Omit<WorkTask, "id" | "createdAt" | "updatedAt">>): WorkTask {
    const current = this.getTask(id);
    if (!current) {
      throw new Error(`Task not found: ${id}`);
    }
    const next: WorkTask = {
      ...current,
      ...input,
      tags: input.tags ?? current.tags,
      context: input.context ?? current.context,
      updatedAt: new Date().toISOString()
    };
    this.sqlite
      .prepare(
        `UPDATE tasks SET
          project_id = @projectId,
          title = @title,
          status = @status,
          source = @source,
          tags_json = @tagsJson,
          context_json = @contextJson,
          timer_policy_id = @timerPolicyId,
          estimate_minutes = @estimateMinutes,
          planned_date = @plannedDate,
          updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        ...next,
        tagsJson: JSON.stringify(next.tags),
        contextJson: stringifyNullable(next.context)
      });
    return next;
  }

  deleteTask(id: string): void {
    const task = this.getTask(id);
    if (!task) {
      throw new Error(`Task not found: ${id}`);
    }
    const sessionCount = (this.sqlite.prepare("SELECT COUNT(*) AS count FROM focus_sessions WHERE task_id = ?").get(id) as { count: number }).count;
    if (sessionCount > 0) {
      this.sqlite.prepare("UPDATE focus_sessions SET task_id = NULL WHERE task_id = ?").run(id);
    }
    this.sqlite.prepare("DELETE FROM tasks WHERE id = ?").run(id);
  }

  listTimerPolicies(): TimerPolicy[] {
    return (this.sqlite.prepare("SELECT * FROM timer_policies ORDER BY created_at ASC").all() as Row[]).map(mapTimerPolicy);
  }

  getTimerPolicy(id: string): TimerPolicy | undefined {
    const row = this.sqlite.prepare("SELECT * FROM timer_policies WHERE id = ?").get(id) as Row | undefined;
    return row ? mapTimerPolicy(row) : undefined;
  }

  createTimerPolicy(input: { id?: string; name: string; mode: TimerMode; config: TimerPolicyConfig }): TimerPolicy {
    const now = new Date().toISOString();
    const policy: TimerPolicy = {
      id: input.id ?? randomUUID(),
      name: input.name,
      mode: input.mode,
      config: input.config,
      createdAt: now,
      updatedAt: now
    };
    this.sqlite
      .prepare(
        `INSERT INTO timer_policies (id, name, mode, config_json, created_at, updated_at)
         VALUES (@id, @name, @mode, @configJson, @createdAt, @updatedAt)`
      )
      .run({ ...policy, configJson: JSON.stringify(policy.config) });
    return policy;
  }

  updateTimerPolicy(id: string, input: Partial<Omit<TimerPolicy, "id" | "createdAt" | "updatedAt">>): TimerPolicy {
    const current = this.getTimerPolicy(id);
    if (!current) {
      throw new Error(`Timer policy not found: ${id}`);
    }
    const next: TimerPolicy = {
      ...current,
      ...input,
      config: input.config ?? current.config,
      updatedAt: new Date().toISOString()
    };
    this.sqlite
      .prepare(
        `UPDATE timer_policies SET
          name = @name,
          mode = @mode,
          config_json = @configJson,
          updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id: next.id,
        name: next.name,
        mode: next.mode,
        configJson: JSON.stringify(next.config),
        updatedAt: next.updatedAt
      });
    return next;
  }

  deleteTimerPolicy(id: string): void {
    const taskCount = (this.sqlite.prepare("SELECT COUNT(*) AS count FROM tasks WHERE timer_policy_id = ?").get(id) as { count: number }).count;
    const sessionCount = (this.sqlite.prepare("SELECT COUNT(*) AS count FROM focus_sessions WHERE policy_id = ?").get(id) as { count: number }).count;
    if (taskCount > 0 || sessionCount > 0) {
      throw new Error(`Timer policy is still referenced: ${id}`);
    }
    this.sqlite.prepare("DELETE FROM timer_policies WHERE id = ?").run(id);
  }

  getCurrentTimer(): TimerCurrent {
    const row = this.sqlite
      .prepare("SELECT * FROM focus_sessions WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1")
      .get() as Row | undefined;
    if (!row) {
      return { running: false, paused: false };
    }
    const session = this.mapSession(row);
    const openSegment = session.segments.find((segment) => !segment.endedAt);
    const policy = this.getTimerPolicy(session.policyId);
    return {
      session,
      running: Boolean(openSegment && openSegment.type === "focus"),
      paused: !openSegment || openSegment.type !== "focus",
      breakReminder: policy ? evaluateBreakReminder(session, policy) : undefined
    };
  }

  startTimer(input: {
    taskId?: string;
    projectId?: string;
    policyId?: string;
    plannedMinutes?: number;
    musicContext?: Record<string, unknown>;
  }): FocusSession {
    const current = this.getCurrentTimer();
    if (current.session) {
      throw new Error("A focus session is already active");
    }
    const task = input.taskId ? this.getTask(input.taskId) : undefined;
    const projectId = input.projectId ?? task?.projectId;
    const projectPreference = this.getWorkstationSettings().tasks.projectPreferences.find((item) => item.id === projectId);
    const policyId = input.policyId ?? task?.timerPolicyId ?? projectPreference?.defaultTimerPolicyId ?? "elastic-50-10";
    const policy = this.getTimerPolicy(policyId);
    if (!policy) {
      throw new Error(`Timer policy not found: ${policyId}`);
    }
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    this.sqlite
      .prepare(
        `INSERT INTO focus_sessions
          (id, task_id, project_id, policy_id, planned_minutes, actual_minutes, started_at, ended_at, activity_evidence_json, music_context_json, adjustment_log_json)
         VALUES
          (@id, @taskId, @projectId, @policyId, @plannedMinutes, NULL, @startedAt, NULL, NULL, @musicContextJson, '[]')`
      )
      .run({
        id: sessionId,
        taskId: input.taskId,
        projectId,
        policyId,
        plannedMinutes: input.plannedMinutes ?? task?.estimateMinutes ?? policy.config.defaultFocusMinutes,
        startedAt: now,
        musicContextJson: stringifyNullable(input.musicContext)
      });
    this.insertSegment(sessionId, "focus", now);
    if (task && task.status === "todo") {
      this.updateTask(task.id, { status: "doing" });
    }
    return this.getSession(sessionId);
  }

  pauseTimer(): FocusSession {
    const current = this.requireCurrentSession();
    this.closeOpenSegment(current.id);
    this.insertSegment(current.id, "break", new Date().toISOString(), "manual pause");
    return this.getSession(current.id);
  }

  resumeTimer(): FocusSession {
    const current = this.requireCurrentSession();
    this.closeOpenSegment(current.id);
    this.insertSegment(current.id, "focus", new Date().toISOString());
    return this.getSession(current.id);
  }

  stopTimer(input: { reason?: string; activityEvidence?: Record<string, unknown> } = {}): FocusSession {
    const current = this.requireCurrentSession();
    const endedAt = new Date().toISOString();
    this.closeOpenSegment(current.id, endedAt);
    const actualMinutes = Math.round(this.sumSegmentsSeconds(current.id) / 60);
    const adjustmentLog = current.adjustmentLog;
    if (input.reason) {
      adjustmentLog.push({
        at: endedAt,
        reason: input.reason,
        source: "user",
        before: { status: "running", endedAt: current.endedAt, actualMinutes: current.actualMinutes },
        after: { status: "stopped", endedAt, actualMinutes },
        changes: { action: "stop" }
      });
    }
    this.sqlite
      .prepare(
        `UPDATE focus_sessions SET
          ended_at = @endedAt,
          actual_minutes = @actualMinutes,
          activity_evidence_json = @activityEvidenceJson,
          adjustment_log_json = @adjustmentLogJson
         WHERE id = @id`
      )
      .run({
        id: current.id,
        endedAt,
        actualMinutes,
        activityEvidenceJson: stringifyNullable(input.activityEvidence),
        adjustmentLogJson: JSON.stringify(adjustmentLog)
      });
    return this.getSession(current.id);
  }

  splitTimer(input: { sessionId?: string; note?: string; durationSeconds?: number }): FocusSession {
    const session = input.sessionId ? this.getSession(input.sessionId) : this.requireCurrentSession();
    const now = new Date().toISOString();
    const segmentId = randomUUID();
    this.sqlite
      .prepare(
        `INSERT INTO focus_segments (id, session_id, type, started_at, ended_at, duration_seconds, note)
         VALUES (@id, @sessionId, 'manual', @startedAt, @endedAt, @durationSeconds, @note)`
      )
      .run({
        id: segmentId,
        sessionId: session.id,
        startedAt: now,
        endedAt: now,
        durationSeconds: input.durationSeconds ?? 0,
        note: input.note ?? "手动拆分"
      });
    this.appendAdjustment(session.id, "手动拆分", {
      source: "user",
      before: { segmentCount: session.segments.length },
      after: {
        segmentCount: session.segments.length + 1,
        manualSegmentDurationSeconds: input.durationSeconds ?? 0
      },
      changes: { action: "split", note: input.note, durationSeconds: input.durationSeconds }
    });
    return this.getSession(session.id);
  }

  adjustTimer(input: {
    sessionId?: string;
    taskId?: string;
    projectId?: string;
    plannedMinutes?: number;
    actualMinutes?: number;
    reason?: string;
  }): FocusSession {
    const session = input.sessionId ? this.getSession(input.sessionId) : this.requireCurrentSession();
    const before = {
      taskId: session.taskId,
      projectId: session.projectId,
      plannedMinutes: session.plannedMinutes,
      actualMinutes: session.actualMinutes
    };
    const next = {
      taskId: input.taskId ?? session.taskId,
      projectId: input.projectId ?? session.projectId,
      plannedMinutes: input.plannedMinutes ?? session.plannedMinutes,
      actualMinutes: input.actualMinutes ?? session.actualMinutes
    };
    this.sqlite
      .prepare(
        `UPDATE focus_sessions SET
          task_id = @taskId,
          project_id = @projectId,
          planned_minutes = @plannedMinutes,
          actual_minutes = @actualMinutes
         WHERE id = @id`
      )
      .run({ id: session.id, ...next });
    this.appendAdjustment(session.id, input.reason ?? "手动调整", {
      source: "user",
      before,
      after: next,
      changes: changedFields(before, next)
    });
    return this.getSession(session.id);
  }

  listTodaySessions(date = today()): FocusSession[] {
    const start = `${date}T00:00:00.000Z`;
    const end = `${nextDate(date)}T00:00:00.000Z`;
    return this.sqlite
      .prepare("SELECT * FROM focus_sessions WHERE started_at >= ? AND started_at < ? ORDER BY started_at ASC")
      .all(start, end)
      .map((row) => this.mapSession(row as Row));
  }

  getMusicState(): MusicState {
    const row = this.sqlite.prepare("SELECT * FROM music_state WHERE id = 'current'").get() as Row | undefined;
    const now = new Date().toISOString();
    if (!row) {
      return { playing: false, mood: "deep-focus", queue: [], updatedAt: now };
    }
    return {
      playing: Boolean(row.playing),
      mood: String(row.mood),
      current: parseNullable<MusicTrack>(row.current_json),
      queue: parseJson<MusicTrack[]>(row.queue_json, []),
      updatedAt: String(row.updated_at)
    };
  }

  setMusicState(input: Partial<MusicState>): MusicState {
    const current = this.getMusicState();
    const next: MusicState = {
      ...current,
      ...input,
      queue: input.queue ?? current.queue,
      updatedAt: new Date().toISOString()
    };
    this.sqlite
      .prepare(
        `INSERT INTO music_state (id, playing, mood, current_json, queue_json, updated_at)
         VALUES ('current', @playing, @mood, @currentJson, @queueJson, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
          playing = excluded.playing,
          mood = excluded.mood,
          current_json = excluded.current_json,
          queue_json = excluded.queue_json,
          updated_at = excluded.updated_at`
      )
      .run({
        playing: next.playing ? 1 : 0,
        mood: next.mood,
        currentJson: stringifyNullable(next.current),
        queueJson: JSON.stringify(next.queue),
        updatedAt: next.updatedAt
      });
    return next;
  }

  upsertDailyReview(date: string, summary: string, review: Record<string, unknown>): DailyReview {
    const existing = this.getDailyReview(date);
    const now = new Date().toISOString();
    const reviewRecord: DailyReview = {
      id: existing?.id ?? randomUUID(),
      date,
      summary,
      review,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.sqlite
      .prepare(
        `INSERT INTO daily_reviews (id, date, summary, review_json, created_at, updated_at)
         VALUES (@id, @date, @summary, @reviewJson, @createdAt, @updatedAt)
         ON CONFLICT(date) DO UPDATE SET
          summary = excluded.summary,
          review_json = excluded.review_json,
          updated_at = excluded.updated_at`
      )
      .run({ ...reviewRecord, reviewJson: JSON.stringify(reviewRecord.review) });
    return reviewRecord;
  }

  getDailyReview(date: string): DailyReview | undefined {
    const row = this.sqlite.prepare("SELECT * FROM daily_reviews WHERE date = ?").get(date) as Row | undefined;
    return row ? mapDailyReview(row) : undefined;
  }

  getWorkstationSettings(): WorkstationSettings {
    const row = this.sqlite
      .prepare("SELECT * FROM workstation_settings WHERE key = 'workstation'")
      .get() as Row | undefined;
    if (!row) {
      throw new Error("Workstation settings were not initialized");
    }
    const defaults = defaultSettings(String(row.updated_at ?? new Date().toISOString()));
    const saved = parseJson<Partial<WorkstationSettings>>(row.value_json, {});
    const settings = deepMerge(defaults, saved) as WorkstationSettings;
    if (/[\\/]Task-Manager-main$/i.test(settings.activityStats.tokeiRepo)) {
      settings.activityStats.tokeiRepo = defaults.activityStats.tokeiRepo;
    }
    if (settings.music.provider === "mock") {
      settings.music.provider = "mineradio";
    }
    if (settings.theme.globalTheme === "default-dark") {
      settings.theme.globalTheme = defaults.theme.globalTheme;
    }
    settings.music.playlistTrackIds = normalizeMusicTrackIds(settings.music.playlistTrackIds);
    return settings;
  }

  updateWorkstationSettings(input: Partial<WorkstationSettings>): WorkstationSettings {
    const current = this.getWorkstationSettings();
    const next = deepMerge(current, input) as WorkstationSettings;
    next.music.playlistTrackIds = normalizeMusicTrackIds(next.music.playlistTrackIds);
    next.updatedAt = new Date().toISOString();
    this.sqlite
      .prepare(
        `INSERT INTO workstation_settings (key, value_json, updated_at)
         VALUES ('workstation', @valueJson, @updatedAt)
         ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at`
      )
      .run({
        valueJson: JSON.stringify(next),
        updatedAt: next.updatedAt
      });
    return next;
  }

  listWidgetSettings(): WidgetSettings[] {
    return (this.sqlite.prepare("SELECT * FROM widget_settings ORDER BY id").all() as Row[]).map(mapWidgetSettings);
  }

  updateWidgetSettings(id: string, input: Partial<WidgetSettings>): WidgetSettings {
    const current = this.listWidgetSettings().find((widget) => widget.id === id);
    if (!current) {
      throw new Error(`Widget settings not found: ${id}`);
    }
    const next: WidgetSettings = {
      ...current,
      ...input,
      id,
      modes: input.modes ?? current.modes,
      size: input.size ?? current.size,
      position: input.position ?? current.position,
      options: input.options ?? current.options,
      updatedAt: new Date().toISOString()
    };
    this.sqlite
      .prepare(
        `UPDATE widget_settings SET
          enabled = @enabled,
          modes_json = @modesJson,
          refresh_interval_seconds = @refreshIntervalSeconds,
          size_json = @sizeJson,
          position_json = @positionJson,
          options_json = @optionsJson,
          updated_at = @updatedAt
         WHERE id = @id`
      )
      .run({
        id: next.id,
        enabled: next.enabled ? 1 : 0,
        modesJson: JSON.stringify(next.modes),
        refreshIntervalSeconds: next.refreshIntervalSeconds,
        sizeJson: stringifyNullable(next.size),
        positionJson: stringifyNullable(next.position),
        optionsJson: stringifyNullable(next.options),
        updatedAt: next.updatedAt
      });
    return next;
  }

  reorderWidgetSettings(input: Array<{ id: string; position: { x: number; y: number } }>): WidgetSettings[] {
    const update = this.sqlite.prepare("UPDATE widget_settings SET position_json = @positionJson, updated_at = @updatedAt WHERE id = @id");
    const updatedAt = new Date().toISOString();
    const transaction = this.sqlite.transaction((items: typeof input) => {
      for (const item of items) {
        update.run({
          id: item.id,
          positionJson: JSON.stringify(item.position),
          updatedAt
        });
      }
    });
    transaction(input);
    return this.listWidgetSettings();
  }

  exportData(): Record<string, unknown> {
    return {
      exportedAt: new Date().toISOString(),
      settings: this.getWorkstationSettings(),
      widgets: this.listWidgetSettings(),
      projects: this.listProjects(),
      tasks: this.listTasks(),
      timerPolicies: this.listTimerPolicies(),
      music: this.getMusicState()
    };
  }

  deleteAllData(): void {
    this.sqlite.exec(`
      DELETE FROM focus_segments;
      DELETE FROM focus_sessions;
      DELETE FROM activity_snapshots;
      DELETE FROM daily_reviews;
      DELETE FROM tasks;
      DELETE FROM projects;
    `);
  }

  private requireCurrentSession(): FocusSession {
    const current = this.getCurrentTimer();
    if (!current.session) {
      throw new Error("No active focus session");
    }
    return current.session;
  }

  private getSession(id: string): FocusSession {
    const row = this.sqlite.prepare("SELECT * FROM focus_sessions WHERE id = ?").get(id) as Row | undefined;
    if (!row) {
      throw new Error(`Focus session not found: ${id}`);
    }
    return this.mapSession(row);
  }

  private mapSession(row: Row): FocusSession {
    const segments = (this.sqlite
      .prepare("SELECT * FROM focus_segments WHERE session_id = ? ORDER BY started_at ASC")
      .all(String(row.id)) as Row[]).map(mapSegment);
    return {
      id: String(row.id),
      taskId: optionalString(row.task_id),
      projectId: optionalString(row.project_id),
      policyId: String(row.policy_id),
      plannedMinutes: optionalNumber(row.planned_minutes),
      actualMinutes: optionalNumber(row.actual_minutes),
      startedAt: String(row.started_at),
      endedAt: optionalString(row.ended_at),
      segments,
      activityEvidence: parseNullable<Record<string, unknown>>(row.activity_evidence_json),
      musicContext: parseNullable<Record<string, unknown>>(row.music_context_json),
      adjustmentLog: parseJson<TimerAdjustment[]>(row.adjustment_log_json, [])
    };
  }

  private insertSegment(sessionId: string, type: FocusSegment["type"], startedAt: string, note?: string): void {
    this.sqlite
      .prepare(
        `INSERT INTO focus_segments (id, session_id, type, started_at, ended_at, duration_seconds, note)
         VALUES (@id, @sessionId, @type, @startedAt, NULL, NULL, @note)`
      )
      .run({ id: randomUUID(), sessionId, type, startedAt, note });
  }

  private closeOpenSegment(sessionId: string, endedAt = new Date().toISOString()): void {
    const rows = this.sqlite
      .prepare("SELECT * FROM focus_segments WHERE session_id = ? AND ended_at IS NULL")
      .all(sessionId) as Row[];
    for (const row of rows) {
      const durationSeconds = Math.max(0, Math.round((Date.parse(endedAt) - Date.parse(String(row.started_at))) / 1000));
      this.sqlite
        .prepare("UPDATE focus_segments SET ended_at = ?, duration_seconds = ? WHERE id = ?")
        .run(endedAt, durationSeconds, row.id);
    }
  }

  private sumSegmentsSeconds(sessionId: string): number {
    const row = this.sqlite
      .prepare("SELECT COALESCE(SUM(duration_seconds), 0) AS total FROM focus_segments WHERE session_id = ?")
      .get(sessionId) as { total: number };
    return Number(row.total ?? 0);
  }

  private appendAdjustment(
    sessionId: string,
    reason: string,
    input: {
      source?: TimerAdjustment["source"];
      before?: Record<string, unknown>;
      after?: Record<string, unknown>;
      changes: Record<string, unknown>;
    }
  ): void {
    const session = this.getSession(sessionId);
    const adjustmentLog = [
      ...session.adjustmentLog,
      {
        at: new Date().toISOString(),
        reason,
        source: input.source ?? "user",
        before: input.before,
        after: input.after,
        changes: input.changes
      }
    ];
    this.sqlite
      .prepare("UPDATE focus_sessions SET adjustment_log_json = ? WHERE id = ?")
      .run(JSON.stringify(adjustmentLog), sessionId);
  }
}

function changedFields(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const changes: Record<string, unknown> = { action: "adjust" };
  for (const [key, afterValue] of Object.entries(after)) {
    if (before[key] !== afterValue) {
      changes[key] = afterValue;
    }
  }
  return changes;
}

function mapProject(row: Row): Project {
  return {
    id: String(row.id),
    name: String(row.name),
    color: optionalString(row.color),
    icon: optionalString(row.icon),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTask(row: Row): WorkTask {
  return {
    id: String(row.id),
    title: String(row.title),
    projectId: optionalString(row.project_id),
    source: String(row.source) as TaskSource,
    status: String(row.status) as TaskStatus,
    tags: parseJson<string[]>(row.tags_json, []),
    context: parseNullable<WorkTaskContext>(row.context_json),
    timerPolicyId: optionalString(row.timer_policy_id),
    estimateMinutes: optionalNumber(row.estimate_minutes),
    plannedDate: optionalString(row.planned_date),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTimerPolicy(row: Row): TimerPolicy {
  return {
    id: String(row.id),
    name: String(row.name),
    mode: String(row.mode) as TimerMode,
    config: parseJson<TimerPolicyConfig>(row.config_json, {
      defaultFocusMinutes: 50,
      defaultBreakMinutes: 10,
      allowExtend: true,
      allowShorten: true,
      allowSkipBreak: true,
      allowManualAdjustment: true
    }),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapSegment(row: Row): FocusSegment {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    type: String(row.type) as FocusSegment["type"],
    startedAt: String(row.started_at),
    endedAt: optionalString(row.ended_at),
    durationSeconds: optionalNumber(row.duration_seconds),
    note: optionalString(row.note)
  };
}

function mapDailyReview(row: Row): DailyReview {
  return {
    id: String(row.id),
    date: String(row.date),
    summary: optionalString(row.summary),
    review: parseJson<Record<string, unknown>>(row.review_json, {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapWidgetSettings(row: Row): WidgetSettings {
  return {
    id: String(row.id),
    enabled: Number(row.enabled) === 1,
    modes: parseJson<WidgetSettings["modes"]>(row.modes_json, []),
    refreshIntervalSeconds: optionalNumber(row.refresh_interval_seconds),
    size: parseNullable<WidgetSettings["size"]>(row.size_json),
    position: parseNullable<WidgetSettings["position"]>(row.position_json),
    options: parseNullable<Record<string, unknown>>(row.options_json),
    updatedAt: String(row.updated_at)
  };
}

function defaultSettings(updatedAt: string): WorkstationSettings {
  return {
    defaultMode: "study",
    modes: {
      study: defaultMode("deep-study", "deep-focus"),
      coding: defaultMode("coding", "coding"),
      writing: defaultMode("deep-study", "writing"),
      music: defaultMode("music-cinema", "music"),
      review: defaultMode("review-paper", "ambient"),
      rest: defaultMode("rest-soft", "relaxed")
    },
    activitywatch: {
      enabled: true,
      baseUrl: "http://127.0.0.1:5600",
      watchers: { window: true, afk: true, web: true },
      afkCorrection: { enabled: true, thresholdMinutes: 5 },
      showEvidenceInReview: true
    },
    activityStats: {
      tokeiRepo: "",
      githubUsername: "",
      refreshIntervalMinutes: 5,
      cacheEnabled: true,
      includeInReview: true,
      linkToCurrentProject: true
    },
    music: {
      enabled: true,
      provider: "mineradio",
      enableLyrics: false,
      enableDesktopLyrics: false,
      playlistTrackIds: [],
      moodRules: {}
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
      modeThemes: {},
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

function defaultMode(theme: string, musicMood: string): WorkstationSettings["modes"]["study"] {
  return {
    theme,
    timerPolicyId: "elastic-50-10",
    musicMood,
    widgets: [],
    activityWatchCorrection: true,
    activityStatsEnabled: true
  };
}

function deepMerge(target: unknown, source: unknown): unknown {
  if (!isPlainObject(target) || !isPlainObject(source)) {
    return source === undefined ? target : source;
  }
  const output: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined) {
      continue;
    }
    output[key] = isPlainObject(value) && isPlainObject(output[key]) ? deepMerge(output[key], value) : value;
  }
  return output;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed.toISOString().slice(0, 10);
}

function optionalString(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function optionalNumber(value: unknown): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

function stringifyNullable(value: unknown): string | null {
  return value === undefined || value === null ? null : JSON.stringify(value);
}

function parseNullable<T>(value: unknown): T | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  return parseJson<T>(value, undefined as T);
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") {
    return fallback;
  }
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeMusicTrackIds(value: unknown): string[] {
  const trackIds = Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];

  if (sameTrackIds(trackIds, LEGACY_PLACEHOLDER_MUSIC_TRACK_IDS)) {
    return [];
  }

  return [...new Set(trackIds)];
}

function sameTrackIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}
