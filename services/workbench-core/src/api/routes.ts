import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import type { WorkstationStatus } from "@cw/contracts";

import type { WorkbenchConfig } from "../config.js";
import type { EventBus } from "../events/bus.js";
import type { ActivityStatsAdapter } from "../adapters/activityStats.js";
import type { ActivityWatchAdapter } from "../adapters/activitywatch.js";
import type { MusicAdapter } from "../adapters/music.js";
import { today, type WorkbenchRepository } from "../modules/repository.js";

export interface RouteContext {
  config: WorkbenchConfig;
  repository: WorkbenchRepository;
  activityStats: ActivityStatsAdapter;
  activityWatch: ActivityWatchAdapter;
  music: MusicAdapter;
  events: EventBus;
}

interface DashboardExternalSnapshot {
  activityWatch: Record<string, unknown>;
  github: Record<string, unknown>;
  music: Record<string, unknown>;
  refreshedAt: number;
  tokei: Record<string, unknown>;
}

interface DashboardExternalState {
  date: string;
  pending?: Promise<DashboardExternalSnapshot>;
  snapshot?: DashboardExternalSnapshot;
}

const DASHBOARD_EXTERNAL_TTL_MS = 30_000;
const dashboardExternalStates = new WeakMap<RouteContext, DashboardExternalState>();

export async function registerRoutes(app: FastifyInstance, context: RouteContext): Promise<void> {
  app.get("/health", async () => ({ ok: true, version: "1.1.1" }));

  app.get("/api/workstation/status", async () => workstationStatus(context));
  app.get("/api/widgets/workstation", async () => widgetsPayload(context));

  app.get("/api/projects", async () => ({ projects: context.repository.listProjects() }));
  app.post("/api/projects", async (request) => {
    const body = objectBody(request);
    const project = context.repository.createProject({
      name: stringField(body, "name", "未命名项目"),
      color: optionalString(body.color),
      icon: optionalString(body.icon)
    });
    context.events.publish("project.created", { projectId: project.id });
    return { project };
  });

  app.get("/api/settings/workstation", async () => context.repository.getWorkstationSettings());
  app.patch("/api/settings/workstation", async (request) => {
    const settings = context.repository.updateWorkstationSettings(objectBody(request) as never);
    invalidateExternalCaches(context);
    context.events.publish("settings.workstation.updated", {});
    return settings;
  });

  app.get("/api/settings/widgets", async () => ({ widgets: context.repository.listWidgetSettings() }));
  app.patch("/api/settings/widgets/:id", async (request) => {
    const widgetId = stringField(request.params as Record<string, unknown>, "id");
    const widget = context.repository.updateWidgetSettings(widgetId, objectBody(request) as never);
    context.events.publish("settings.widget.updated", { widgetId });
    return { widget };
  });
  app.post("/api/settings/widgets/reorder", async (request) => {
    const body = objectBody(request);
    const items = Array.isArray(body.widgets)
      ? body.widgets.filter((item): item is { id: string; position: { x: number; y: number } } => {
          if (!isObject(item) || !isObject(item.position)) return false;
          return typeof item.id === "string" && typeof item.position.x === "number" && typeof item.position.y === "number";
        })
      : [];
    const widgets = context.repository.reorderWidgetSettings(items);
    context.events.publish("settings.widgets.reordered", {});
    return { widgets };
  });

  app.get("/api/settings/timer-policies", async () => ({ timerPolicies: context.repository.listTimerPolicies() }));
  app.post("/api/settings/timer-policies", async (request) => {
    const body = objectBody(request);
    const timerPolicy = context.repository.createTimerPolicy({
      id: optionalString(body.id),
      name: stringField(body, "name", "新计时策略"),
      mode: stringField(body, "mode", "elastic-block") as never,
      config: isObject(body.config)
        ? (body.config as never)
        : {
            defaultFocusMinutes: 50,
            defaultBreakMinutes: 10,
            allowExtend: true,
            allowShorten: true,
            allowSkipBreak: true,
            allowManualAdjustment: true
          }
    });
    context.events.publish("settings.timer-policy.created", { timerPolicyId: timerPolicy.id });
    return { timerPolicy };
  });
  app.patch("/api/settings/timer-policies/:id", async (request) => {
    const timerPolicyId = stringField(request.params as Record<string, unknown>, "id");
    const timerPolicy = context.repository.updateTimerPolicy(timerPolicyId, objectBody(request) as never);
    context.events.publish("settings.timer-policy.updated", { timerPolicyId });
    return { timerPolicy };
  });
  app.delete("/api/settings/timer-policies/:id", async (request) => {
    const timerPolicyId = stringField(request.params as Record<string, unknown>, "id");
    context.repository.deleteTimerPolicy(timerPolicyId);
    context.events.publish("settings.timer-policy.deleted", { timerPolicyId });
    return { ok: true };
  });

  app.get("/api/settings/export", async () => context.repository.exportData());
  app.post("/api/settings/import", async (request) => {
    const body = objectBody(request);
    const preview = body.preview !== false && body.confirm !== true;
    const settings = preview
      ? context.repository.getWorkstationSettings()
      : isObject(body.settings)
        ? context.repository.updateWorkstationSettings(body.settings as never)
        : context.repository.getWorkstationSettings();
    if (!preview) {
      invalidateExternalCaches(context);
      context.events.publish("settings.imported", {});
    }
    return {
      ok: true,
      preview,
      settings,
      unsupported: ["projects", "tasks", "sessions"].filter((key) => key in body),
      message: preview ? "导入预览完成；传入 confirm=true 后才会写入当前支持的 settings。" : "导入已写入当前支持的 settings。"
    };
  });
  app.post("/api/settings/reset-cache", async () => {
    invalidateExternalCaches(context);
    context.events.publish("settings.cache.reset", {});
    return { ok: true, message: "已清理工作站外部数据缓存" };
  });
  app.post("/api/settings/delete-all-data", async (request) => {
    const body = objectBody(request);
    if (body.confirm !== "DELETE ALL DATA") {
      throw new Error("Missing confirmation phrase");
    }
    context.repository.deleteAllData();
    invalidateExternalCaches(context);
    context.events.publish("settings.data.deleted", {});
    return { ok: true };
  });

  app.get("/api/tasks", async () => ({ tasks: context.repository.listTasks() }));
  app.post("/api/tasks", async (request) => {
    const body = objectBody(request);
    const task = context.repository.createTask({
      title: stringField(body, "title", "未命名任务"),
      projectId: optionalString(body.projectId),
      source: optionalString(body.source) as never,
      status: optionalString(body.status) as never,
      tags: stringArray(body.tags),
      context: isObject(body.context) ? body.context : undefined,
      timerPolicyId: optionalString(body.timerPolicyId),
      estimateMinutes: optionalNumber(body.estimateMinutes),
      plannedDate: optionalString(body.plannedDate)
    });
    context.events.publish("task.created", { taskId: task.id });
    return { task };
  });

  app.patch("/api/tasks", async (request) => {
    const body = objectBody(request);
    const taskId = stringField(body, "id");
    const task = context.repository.updateTask(taskId, body as never);
    context.events.publish("task.updated", { taskId: task.id });
    return { task };
  });

  app.patch("/api/tasks/:id", async (request) => {
    const taskId = stringField(request.params as Record<string, unknown>, "id");
    const task = context.repository.updateTask(taskId, objectBody(request) as never);
    context.events.publish("task.updated", { taskId: task.id });
    return { task };
  });

  app.delete("/api/tasks/:id", async (request) => {
    const taskId = stringField(request.params as Record<string, unknown>, "id");
    context.repository.deleteTask(taskId);
    context.events.publish("task.deleted", { taskId });
    return { ok: true };
  });

  app.post("/api/tasks/:id/start-focus", async (request) => {
    const taskId = stringField(request.params as Record<string, unknown>, "id");
    const body = objectBody(request);
    const session = context.repository.startTimer({
      taskId,
      policyId: optionalString(body.policyId),
      plannedMinutes: optionalNumber(body.plannedMinutes),
      musicContext: isObject(body.musicContext) ? body.musicContext : undefined
    });
    context.events.publish("task.started", { taskId, sessionId: session.id });
    context.events.publish("timer.started", { sessionId: session.id });
    return { session };
  });

  app.get("/api/timer/current", async () => context.repository.getCurrentTimer());

  app.post("/api/timer/start", async (request) => {
    const body = objectBody(request);
    const session = context.repository.startTimer({
      taskId: optionalString(body.taskId),
      projectId: optionalString(body.projectId),
      policyId: optionalString(body.policyId),
      plannedMinutes: optionalNumber(body.plannedMinutes),
      musicContext: isObject(body.musicContext) ? body.musicContext : undefined
    });
    context.events.publish("timer.started", { sessionId: session.id });
    return { session };
  });

  app.post("/api/timer/pause", async () => {
    const session = context.repository.pauseTimer();
    context.events.publish("timer.paused", { sessionId: session.id });
    return { session };
  });

  app.post("/api/timer/resume", async () => {
    const session = context.repository.resumeTimer();
    context.events.publish("timer.resumed", { sessionId: session.id });
    return { session };
  });

  app.post("/api/timer/stop", async (request) => {
    const body = objectBody(request);
    const session = context.repository.stopTimer({
      reason: optionalString(body.reason),
      activityEvidence: isObject(body.activityEvidence) ? body.activityEvidence : undefined
    });
    context.events.publish("timer.stopped", { sessionId: session.id });
    return { session };
  });

  app.post("/api/timer/split", async (request) => {
    const body = objectBody(request);
    const session = context.repository.splitTimer({
      sessionId: optionalString(body.sessionId),
      note: optionalString(body.note),
      durationSeconds: optionalNumber(body.durationSeconds)
    });
    context.events.publish("timer.segment.completed", { sessionId: session.id });
    return { session };
  });

  app.post("/api/timer/adjust", async (request) => {
    const body = objectBody(request);
    const session = context.repository.adjustTimer({
      sessionId: optionalString(body.sessionId),
      taskId: optionalString(body.taskId),
      projectId: optionalString(body.projectId),
      plannedMinutes: optionalNumber(body.plannedMinutes),
      actualMinutes: optionalNumber(body.actualMinutes),
      reason: optionalString(body.reason)
    });
    context.events.publish("timer.adjusted", { sessionId: session.id });
    return { session };
  });

  app.get("/api/activitywatch/current", async () => activityWatchCurrent(context));
  app.get("/api/activitywatch/today", async () => activityWatchToday(context));
  app.get("/api/activitywatch/summary", async () => activityWatchSummary(context));

  app.get("/api/tokei/usage", async () => {
    const settings = context.repository.getWorkstationSettings().activityStats;
    return context.activityStats.tokeiUsage(false, {
      tokeiRepo: settings.tokeiRepo,
      tokeiPython: settings.tokeiPython
    });
  });
  app.get("/api/github/contributions", async (request) => {
    const query = request.query as { fresh?: string } | undefined;
    return context.activityStats.githubContributions(query?.fresh === "1", context.repository.getWorkstationSettings().activityStats.githubUsername);
  });

  app.get("/api/activity/summary", async () => activitySummary(context, today()));

  app.get("/api/music/current", async () => context.music.current(context.repository.getWorkstationSettings().music));
  app.get("/api/music/playlist", async () => context.music.playlist(context.repository.getWorkstationSettings().music));
  app.get("/api/music/search", async (request) => {
    const query = request.query as { q?: string } | undefined;
    return context.music.search(query?.q ?? "", context.repository.getWorkstationSettings().music);
  });
  app.get("/api/music/tracks", async (request) => {
    const query = request.query as { ids?: string } | undefined;
    const ids = String(query?.ids ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    return context.music.tracksByIds(ids, context.repository.getWorkstationSettings().music);
  });
  app.post("/api/music/play", async (request) => {
    const body = objectBody(request);
    const state = await context.music.play(isObject(body.track) ? (body.track as never) : undefined, context.repository.getWorkstationSettings().music);
    context.events.publish("music.track.changed", { track: state.current ?? null });
    return state;
  });
  app.post("/api/music/pause", async () => {
    const state = await context.music.pause();
    context.events.publish("music.paused", {});
    return state;
  });
  app.post("/api/music/next", async () => {
    const state = await context.music.next(context.repository.getWorkstationSettings().music);
    context.events.publish("music.track.changed", { track: state.current ?? null });
    return state;
  });
  app.post("/api/music/mood", async (request) => {
    const body = objectBody(request);
    const state = await context.music.mood(stringField(body, "mood", "deep-focus"));
    context.events.publish("music.mood.changed", { mood: state.mood });
    return state;
  });

  app.get("/api/review/today", async () => {
    const date = today();
    return context.repository.getDailyReview(date) ?? buildReview(context, date);
  });
  app.post("/api/review/close-day", async (request) => {
    const body = objectBody(request);
    const date = optionalString(body.date) ?? today();
    const review = await buildReview(context, date);
    const saved = context.repository.upsertDailyReview(date, String(review.summary ?? "今日复盘已生成"), review);
    context.events.publish("review.closed", { date });
    return saved;
  });

  app.get("/api/events", (_request, reply) => {
    streamEvents(reply, context.events);
  });
}

function workstationStatus(context: RouteContext): WorkstationStatus {
  const settings = context.repository.getWorkstationSettings();
  return {
    enabled: true,
    mode: settings.defaultMode,
    core: {
      ok: true,
      version: "1.1.1",
      databasePath: context.config.databasePath
    },
    modules: {
      tasks: true,
      timer: true,
      activitywatch: settings.activitywatch.enabled,
      music: settings.music.enabled,
      activityStats: true,
      review: true
    }
  };
}

async function widgetsPayload(context: RouteContext): Promise<Record<string, unknown>> {
  const date = today();
  context.repository.carryOverIncompleteTasks(date);
  const external = readDashboardExternalSnapshot(context, date);
  const summary = buildActivitySummary(context, date, external.snapshot);
  const activity = isObject(external.snapshot.activityWatch.current)
    ? external.snapshot.activityWatch.current
    : {
        connected: external.snapshot.activityWatch.connected === true,
        loading: external.snapshot.activityWatch.loading === true,
        baseUrl: context.repository.getWorkstationSettings().activitywatch.baseUrl
      };
  return {
    status: workstationStatus(context),
    projects: context.repository.listProjects(),
    timerPolicies: context.repository.listTimerPolicies(),
    tasks: context.repository.listTasks(),
    timer: context.repository.getCurrentTimer(),
    activity,
    music: external.snapshot.music,
    summary,
    review: context.repository.getDailyReview(date),
    settings: context.repository.getWorkstationSettings(),
    widgetSettings: context.repository.listWidgetSettings(),
    externalData: {
      loading: external.loading,
      stale: external.stale,
      refreshedAt: external.snapshot.refreshedAt || undefined
    }
  };
}

async function activitySummary(context: RouteContext, date: string): Promise<Record<string, unknown>> {
  const external = await refreshDashboardExternalSnapshot(context, date);
  return buildActivitySummary(context, date, external);
}

function buildActivitySummary(
  context: RouteContext,
  date: string,
  external: DashboardExternalSnapshot
): Record<string, unknown> {
  const sessions = context.repository.listTodaySessions(date);
  const tasks = context.repository.listTasks();
  const { activityWatch, github, tokei } = external;
  const focusMinutes = sessions.reduce((total, session) => total + (session.actualMinutes ?? 0), 0);
  const effectiveFocusMinutes = sessions.reduce((total, session) => {
    const evidence = session.activityEvidence as { effectiveMinutes?: number } | undefined;
    return total + (typeof evidence?.effectiveMinutes === "number" ? evidence.effectiveMinutes : (session.actualMinutes ?? 0));
  }, 0);
  const githubToday = githubContributionForDate(github, date);
  const tokenTotal = tokenTotalFromTokei(tokei);
  const tokenCumulative = cumulativeTokenTotal(tokei);
  const errors = [
    connectedError("ActivityWatch", activityWatch),
    connectedError("Tokei", tokei),
    connectedError("GitHub", github)
  ].filter(Boolean);
  const topApps = Array.isArray((activityWatch as { topApps?: unknown }).topApps)
    ? (activityWatch as { topApps: unknown[] }).topApps
    : [];
  const computerActivity = {
    connected: activityWatch.connected === true,
    loading: activityWatch.loading === true,
    date: optionalString(activityWatch.date) ?? date,
    trackedMinutes: optionalNumber(activityWatch.trackedMinutes) ?? 0,
    topApps,
    topWindows: Array.isArray(activityWatch.topWindows) ? activityWatch.topWindows : [],
    topDomains: Array.isArray(activityWatch.topDomains) ? activityWatch.topDomains : [],
    hourlyActivity: Array.isArray(activityWatch.hourlyActivity) ? activityWatch.hourlyActivity : [],
    timeline: Array.isArray(activityWatch.timeline) ? activityWatch.timeline : [],
    error: optionalString(activityWatch.error)
  };

  const projectById = new Map(context.repository.listProjects().map((project) => [project.id, project]));
  const projectMinutes = new Map<string, number>();
  for (const session of sessions) {
    if (!session.projectId) continue;
    projectMinutes.set(session.projectId, (projectMinutes.get(session.projectId) ?? 0) + (session.actualMinutes ?? 0));
  }
  const topProjects = [...projectMinutes.entries()]
    .map(([projectId, minutes]) => ({ projectId, name: projectById.get(projectId)?.name ?? "未命名板块", minutes }))
    .sort((left, right) => right.minutes - left.minutes);

  return {
    date,
    focusMinutes,
    effectiveFocusMinutes,
    afkMinutes: Number((activityWatch as { afkMinutes?: number }).afkMinutes ?? 0),
    tokenTotal,
    tokenCumulative,
    githubContributionCount: githubToday,
    topApps,
    computerActivity,
    topProjects,
    musicMinutes: 0,
    taskCompletedCount: tasks.filter((task) => task.status === "done" && task.plannedDate === date).length,
    sessionCount: sessions.length,
    errors,
    tokenDashboard: isObject(tokei.dashboard) ? tokei.dashboard : null,
    tokenSource: {
      roots: Array.isArray(tokei.roots) ? tokei.roots : [],
      collector: isObject(tokei) ? optionalString(tokei.collector) : undefined,
      source: isObject(tokei) ? optionalString(tokei.source) : undefined
    },
    github,
    moduleStatus: {
      activityWatch: moduleStatus(activityWatch),
      tokei: moduleStatus(tokei),
      github: moduleStatus(github)
    }
  };
}

function readDashboardExternalSnapshot(
  context: RouteContext,
  date: string
): { loading: boolean; snapshot: DashboardExternalSnapshot; stale: boolean } {
  const state = dashboardExternalState(context, date);
  const snapshot = state.snapshot ?? initialDashboardExternalSnapshot(context);
  const stale = snapshot.refreshedAt === 0 || Date.now() - snapshot.refreshedAt >= DASHBOARD_EXTERNAL_TTL_MS;
  if (stale && !state.pending) {
    void refreshDashboardExternalSnapshot(context, date);
  }
  return {
    loading: Boolean(state.pending) || snapshot.refreshedAt === 0,
    snapshot,
    stale
  };
}

function refreshDashboardExternalSnapshot(
  context: RouteContext,
  date: string,
  force = false
): Promise<DashboardExternalSnapshot> {
  const state = dashboardExternalState(context, date);
  if (state.pending) return state.pending;
  if (
    !force
    && state.snapshot
    && Date.now() - state.snapshot.refreshedAt < DASHBOARD_EXTERNAL_TTL_MS
  ) {
    return Promise.resolve(state.snapshot);
  }

  const settings = context.repository.getWorkstationSettings();
  let pending: Promise<DashboardExternalSnapshot>;
  pending = Promise.allSettled([
    activityWatchSummary(context),
    context.activityStats.tokeiUsage(false, {
      tokeiRepo: settings.activityStats.tokeiRepo,
      tokeiPython: settings.activityStats.tokeiPython
    }),
    context.activityStats.githubContributions(false, settings.activityStats.githubUsername),
    context.music.current(settings.music)
  ]).then(([activityWatch, tokei, github, music]) => {
    const tokeiPayload = settledRecord(tokei, "Tokei");
    const githubPayload = settledRecord(github, "GitHub");
    const snapshot: DashboardExternalSnapshot = {
      activityWatch: settledRecord(activityWatch, "ActivityWatch"),
      github: settings.activityStats.githubUsername
        ? githubPayload
        : { ...githubPayload, disabled: true },
      music: settledRecord(music, "音乐服务"),
      refreshedAt: Date.now(),
      tokei: settings.activityStats.tokeiRepo
        ? tokeiPayload
        : { ...tokeiPayload, disabled: true }
    };
    state.snapshot = snapshot;
    return snapshot;
  }).finally(() => {
    if (state.pending === pending) state.pending = undefined;
  });
  state.pending = pending;
  return pending;
}

function dashboardExternalState(context: RouteContext, date: string): DashboardExternalState {
  const existing = dashboardExternalStates.get(context);
  if (existing?.date === date) return existing;
  const created: DashboardExternalState = { date };
  dashboardExternalStates.set(context, created);
  return created;
}

function initialDashboardExternalSnapshot(context: RouteContext): DashboardExternalSnapshot {
  const settings = context.repository.getWorkstationSettings();
  const musicState = context.repository.getMusicState();
  const activityWatch = settings.activitywatch.enabled
    ? {
        connected: false,
        loading: true,
        baseUrl: settings.activitywatch.baseUrl,
        topApps: [],
        topWindows: [],
        topDomains: [],
        hourlyActivity: [],
        timeline: []
      }
    : {
        connected: false,
        disabled: true,
        baseUrl: settings.activitywatch.baseUrl,
        topApps: [],
        topWindows: [],
        topDomains: [],
        hourlyActivity: [],
        timeline: []
      };
  const tokei = settings.activityStats.tokeiRepo
    ? { connected: false, loading: true, roots: [] }
    : { connected: false, disabled: true, roots: [] };
  const github = settings.activityStats.githubUsername
    ? { connected: false, loading: true, username: settings.activityStats.githubUsername, days: [] }
    : { connected: false, disabled: true, username: "", days: [] };

  return {
    activityWatch,
    github,
    music: {
      ...musicState,
      connected: settings.music.enabled !== false,
      loading: Boolean(settings.music.serviceUrl),
      provider: settings.music.enabled === false ? "disabled" : settings.music.provider
    },
    refreshedAt: 0,
    tokei
  };
}

function settledRecord(
  result: PromiseSettledResult<object>,
  source: string
): Record<string, unknown> {
  if (result.status === "fulfilled") return { ...result.value };
  return {
    connected: false,
    error: `${source} 后台刷新失败：${errorMessage(result.reason)}`
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function invalidateExternalCaches(context: RouteContext): void {
  dashboardExternalStates.delete(context);
  context.activityWatch.resetCache();
  context.activityStats.resetCache();
}

async function buildReview(context: RouteContext, date: string): Promise<Record<string, unknown>> {
  const tasks = context.repository.listTasks();
  const sessions = context.repository.listTodaySessions(date);
  const external = await refreshDashboardExternalSnapshot(context, date);
  const summary = buildActivitySummary(context, date, external);
  const music = external.music;
  const todaysTasks = tasks.filter((task) => task.plannedDate === date);
  const reviewTasks = todaysTasks.length > 0 ? todaysTasks : tasks;
  const doneTasks = reviewTasks.filter((task) => task.status === "done");
  const focusMinutes = sessions.reduce((total, session) => total + (session.actualMinutes ?? 0), 0);
  return {
    date,
    summary: `完成 ${doneTasks.length}/${reviewTasks.length} 个任务，记录 ${focusMinutes} 分钟专注。`,
    focusMinutes,
    tasks: {
      total: reviewTasks.length,
      done: doneTasks.length,
      doing: reviewTasks.filter((task) => task.status === "doing").length
    },
    sessions,
    activitySummary: {
      date: summary.date,
      focusMinutes: summary.focusMinutes,
      effectiveFocusMinutes: summary.effectiveFocusMinutes,
      afkMinutes: summary.afkMinutes,
      tokenTotal: summary.tokenTotal,
      githubContributionCount: summary.githubContributionCount,
      topApps: summary.topApps,
      errors: summary.errors
    },
    music,
    issues: (summary.errors as string[] | undefined) ?? [],
    coreStatus: {
      tasks: true,
      timer: true,
      review: true,
      enhancedModulesOk: ((summary.errors as string[] | undefined) ?? []).length === 0
    },
    tomorrowSuggestions: ["保留弹性计时，优先处理未完成任务。"]
  };
}

async function activityWatchCurrent(context: RouteContext): Promise<Record<string, unknown>> {
  const settings = context.repository.getWorkstationSettings().activitywatch;
  if (!settings.enabled) {
    return {
      connected: false,
      disabled: true,
      baseUrl: settings.baseUrl,
      error: "ActivityWatch 已在工作站设置中禁用"
    };
  }
  return context.activityWatch.current(settings.baseUrl);
}

async function activityWatchToday(context: RouteContext): Promise<Record<string, unknown>> {
  const settings = context.repository.getWorkstationSettings().activitywatch;
  if (!settings.enabled) {
    return {
      connected: false,
      disabled: true,
      date: today(),
      events: [],
      error: "ActivityWatch 已在工作站设置中禁用"
    };
  }
  return context.activityWatch.today(settings.baseUrl);
}

async function activityWatchSummary(context: RouteContext): Promise<Record<string, unknown>> {
  const settings = context.repository.getWorkstationSettings().activitywatch;
  if (!settings.enabled) {
    return {
      connected: false,
      disabled: true,
      topApps: [],
      afkMinutes: 0,
      error: "ActivityWatch 已在工作站设置中禁用"
    };
  }
  return context.activityWatch.summary(settings.baseUrl);
}

function streamEvents(reply: FastifyReply, events: EventBus): void {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  const unsubscribe = events.subscribe((event) => {
    reply.raw.write(`event: ${event.type}\n`);
    reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  reply.raw.on("close", unsubscribe);
}

function objectBody(request: FastifyRequest): Record<string, unknown> {
  return isObject(request.body) ? request.body : {};
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stringField(value: Record<string, unknown>, key: string, fallback?: string): string {
  const field = value[key];
  if (typeof field === "string" && field.length > 0) {
    return field;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`Missing string field: ${key}`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : undefined;
}

function connectedError(name: string, payload: unknown): string | undefined {
  if (
    !isObject(payload)
    || payload.connected !== false
    || payload.loading === true
    || payload.disabled === true
  ) {
    return undefined;
  }
  const detail = optionalString(payload.error);
  if (name === "ActivityWatch") {
    return `未检测到 ActivityWatch：${detail ?? "aw-server 不可用"}`;
  }
  if (name === "Tokei") {
    return `暂时无法读取 token 统计：${detail ?? "请检查 Tokei 路径和 Python 配置"}`;
  }
  if (name === "GitHub") {
    return `暂时无法读取 GitHub 活动：${detail ?? "请检查用户名或网络状态"}`;
  }
  return `${name} 暂时不可用：${detail ?? "核心任务和计时器不受影响"}`;
}

function moduleStatus(payload: unknown): Record<string, unknown> {
  if (!isObject(payload)) {
    return { connected: false };
  }
  return {
    connected: payload.connected !== false,
    disabled: payload.disabled === true,
    loading: payload.loading === true,
    fetchedAt: payload.fetchedAt,
    error: payload.connected === false ? payload.error : undefined,
    baseUrl: payload.baseUrl,
    roots: payload.roots,
    collector: payload.collector,
    username: payload.username,
    source: payload.source
  };
}

function githubContributionForDate(payload: Record<string, unknown>, date: string): number {
  const days = Array.isArray(payload.days) ? payload.days : [];
  const found = days.find((day) => isObject(day) && day.date === date);
  return isObject(found) ? Number(found.count ?? 0) : 0;
}

function tokenTotalFromTokei(payload: Record<string, unknown>): number | undefined {
  const dashboard = payload.dashboard;
  if (isObject(dashboard)) {
    const ranges = dashboard.ranges;
    if (isObject(ranges) && isObject(ranges.today) && typeof ranges.today.tokens === "number") {
      return ranges.today.tokens;
    }
  }
  const usage = payload.usage;
  if (!isObject(usage)) {
    return undefined;
  }
  const candidates = [usage.total_tokens, usage.totalTokens, usage.tokens, usage.total];
  const numeric = candidates.find((candidate) => typeof candidate === "number");
  return typeof numeric === "number" ? numeric : undefined;
}

function cumulativeTokenTotal(payload: Record<string, unknown>): number | undefined {
  const dashboard = payload.dashboard;
  if (!isObject(dashboard) || !Array.isArray(dashboard.daily)) return undefined;
  return dashboard.daily.reduce((total, item) => total + (isObject(item) ? Number(item.tokens ?? 0) : 0), 0);
}
