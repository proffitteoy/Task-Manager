import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityStatsAdapter } from "../adapters/activityStats.js";
import { ActivityWatchAdapter } from "../adapters/activitywatch.js";
import { MusicAdapter } from "../adapters/music.js";
import { createApp, type WorkbenchApp } from "../server.js";

let workbench: WorkbenchApp;

const LEGACY_PLACEHOLDER_TRACK_IDS = ["29764576", "185511"];

beforeEach(async () => {
  const directory = mkdtempSync(join(tmpdir(), "workbench-core-"));
  workbench = await createApp({
    databaseUrl: `file:${join(directory, "test.sqlite")}`,
    activityWatchUrl: "http://127.0.0.1:1",
    tokeiRepo: join(directory, "missing-tokei"),
    githubUsername: "missing-user",
    githubTimeoutMs: 20
  });
});

afterEach(async () => {
  await workbench.app.close();
  vi.restoreAllMocks();
});

describe("workbench-core MVP", () => {
  it("creates tasks and starts/stops a focus session", async () => {
    const createTask = await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "读泛函分析第 5.1 节",
        tags: ["math"],
        estimateMinutes: 50
      }
    });
    expect(createTask.statusCode).toBe(200);
    const taskId = createTask.json().task.id;

    const start = await workbench.app.inject({
      method: "POST",
      url: `/api/tasks/${taskId}/start-focus`
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().session.taskId).toBe(taskId);

    const split = await workbench.app.inject({
      method: "POST",
      url: "/api/timer/split",
      payload: { note: "拆分到阅读材料", durationSeconds: 60 }
    });
    expect(split.statusCode).toBe(200);
    expect(split.json().session.adjustmentLog.length).toBeGreaterThan(0);
    const splitAdjustment = split.json().session.adjustmentLog.at(-1);
    expect(splitAdjustment.source).toBe("user");
    expect(splitAdjustment.before.segmentCount).toBeGreaterThanOrEqual(1);
    expect(splitAdjustment.after.segmentCount).toBe(splitAdjustment.before.segmentCount + 1);

    const adjust = await workbench.app.inject({
      method: "POST",
      url: "/api/timer/adjust",
      payload: { reason: "补充归属", plannedMinutes: 45 }
    });
    expect(adjust.statusCode).toBe(200);
    const adjustment = adjust.json().session.adjustmentLog.at(-1);
    expect(adjustment.reason).toBe("补充归属");
    expect(adjustment.source).toBe("user");
    expect(adjustment.before.plannedMinutes).toBe(50);
    expect(adjustment.after.plannedMinutes).toBe(45);

    const stop = await workbench.app.inject({
      method: "POST",
      url: "/api/timer/stop",
      payload: { reason: "完成章节" }
    });
    expect(stop.statusCode).toBe(200);
    expect(stop.json().session.endedAt).toBeTruthy();
  });

  it("keeps ActivityWatch and Tokei failures non-blocking", async () => {
    const activity = await workbench.app.inject("/api/activitywatch/current");
    expect(activity.statusCode).toBe(200);
    expect(activity.json().connected).toBe(false);

    const tokei = await workbench.app.inject("/api/tokei/usage");
    expect(tokei.statusCode).toBe(200);
    expect(tokei.json().connected).toBe(false);

    const summary = await workbench.app.inject("/api/activity/summary");
    expect(summary.statusCode).toBe(200);
    expect(summary.json().errors.some((item: string) => item.startsWith("未检测到 ActivityWatch："))).toBe(true);
    expect(summary.json().sources).toBeUndefined();
  });

  it("returns the first dashboard payload without waiting for optional external sources", async () => {
    let releaseActivityWatch: ((value: Record<string, unknown>) => void) | undefined;
    const slowActivityWatch = new Promise<Record<string, unknown>>((resolve) => {
      releaseActivityWatch = resolve;
    });
    vi.spyOn(ActivityWatchAdapter.prototype, "summary").mockReturnValue(slowActivityWatch);
    vi.spyOn(ActivityStatsAdapter.prototype, "tokeiUsage").mockResolvedValue({ connected: false });
    vi.spyOn(ActivityStatsAdapter.prototype, "githubContributions").mockResolvedValue({ connected: false });
    vi.spyOn(MusicAdapter.prototype, "current").mockResolvedValue({
      connected: false,
      mood: "focus",
      playing: false,
      provider: "mock",
      queue: [],
      updatedAt: new Date().toISOString()
    });

    const startedAt = performance.now();
    const dashboard = await workbench.app.inject("/api/widgets/workstation");
    const elapsedMs = performance.now() - startedAt;

    expect(dashboard.statusCode).toBe(200);
    expect(elapsedMs).toBeLessThan(200);
    expect(dashboard.json().externalData).toEqual(
      expect.objectContaining({ loading: true, stale: true })
    );

    releaseActivityWatch?.({ connected: false });
    await new Promise((resolve) => setImmediate(resolve));
    const refreshed = await workbench.app.inject("/api/widgets/workstation");
    expect(refreshed.json().externalData.loading).toBe(false);
    expect(refreshed.json().externalData.stale).toBe(false);
  });

  it("serves the latest successful Tokei snapshot without running the collector", async () => {
    const settings = (await workbench.app.inject("/api/settings/workstation")).json();
    const payload = {
      connected: true,
      fetchedAt: Date.now(),
      source: "Tokei collector",
      roots: [settings.activityStats.tokeiRepo],
      requestedRoots: [settings.activityStats.tokeiRepo],
      collector: join(settings.activityStats.tokeiRepo, "usage.30s.py"),
      dashboard: {
        ranges: { today: { tokens: 42 } },
        daily: [{ date: new Date().toISOString().slice(0, 10), tokens: 42, cost: 0 }],
        tools: []
      }
    };
    workbench.database.sqlite
      .prepare(
        `INSERT INTO activity_snapshots
          (id, source, date, payload_json, created_at)
         VALUES (?, 'tokei', ?, ?, ?)`
      )
      .run("latest:tokei", new Date().toISOString().slice(0, 10), JSON.stringify(payload), new Date().toISOString());
    const collector = vi.spyOn(ActivityStatsAdapter.prototype, "tokeiUsage");

    const response = await workbench.app.inject("/api/tokei/usage");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ connected: true, stale: false, refreshing: false }));
    expect(response.json().dashboard.ranges.today.tokens).toBe(42);
    expect(collector).not.toHaveBeenCalled();
  });

  it("persists a successful background Tokei refresh for the next startup", async () => {
    const settings = (await workbench.app.inject("/api/settings/workstation")).json();
    vi.spyOn(ActivityWatchAdapter.prototype, "summary").mockResolvedValue({ connected: false });
    vi.spyOn(ActivityStatsAdapter.prototype, "tokeiUsage").mockResolvedValue({
      connected: true,
      fetchedAt: 123,
      source: "Tokei collector",
      roots: [settings.activityStats.tokeiRepo],
      requestedRoots: [settings.activityStats.tokeiRepo],
      dashboard: { ranges: { today: { tokens: 7 } }, daily: [], tools: [] }
    });
    vi.spyOn(ActivityStatsAdapter.prototype, "githubContributions").mockResolvedValue({ connected: false });
    vi.spyOn(MusicAdapter.prototype, "current").mockResolvedValue({
      connected: false,
      mood: "focus",
      playing: false,
      provider: "mock",
      queue: [],
      updatedAt: new Date().toISOString()
    });

    await workbench.app.inject("/api/widgets/workstation");
    await new Promise((resolve) => setImmediate(resolve));

    const row = workbench.database.sqlite
      .prepare("SELECT payload_json FROM activity_snapshots WHERE id = 'latest:tokei'")
      .get() as { payload_json: string } | undefined;
    expect(row).toBeTruthy();
    expect(JSON.parse(row?.payload_json ?? "{}").dashboard.ranges.today.tokens).toBe(7);
  });

  it("reuses the dashboard external snapshot until reset-cache invalidates it", async () => {
    const activityWatch = vi
      .spyOn(ActivityWatchAdapter.prototype, "summary")
      .mockResolvedValue({ connected: true, trackedMinutes: 1 });
    vi.spyOn(ActivityStatsAdapter.prototype, "tokeiUsage").mockResolvedValue({ connected: false });
    vi.spyOn(ActivityStatsAdapter.prototype, "githubContributions").mockResolvedValue({ connected: false });
    vi.spyOn(MusicAdapter.prototype, "current").mockResolvedValue({
      connected: true,
      mood: "focus",
      playing: false,
      provider: "mock",
      queue: [],
      updatedAt: new Date().toISOString()
    });

    await workbench.app.inject("/api/widgets/workstation");
    await new Promise((resolve) => setImmediate(resolve));
    await workbench.app.inject("/api/widgets/workstation");
    expect(activityWatch).toHaveBeenCalledTimes(1);

    const reset = await workbench.app.inject({
      method: "POST",
      url: "/api/settings/reset-cache"
    });
    expect(reset.statusCode).toBe(200);

    await workbench.app.inject("/api/widgets/workstation");
    await new Promise((resolve) => setImmediate(resolve));
    expect(activityWatch).toHaveBeenCalledTimes(2);
  });

  it("generates a daily review from available local data", async () => {
    await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "写 MVP 文档", status: "done" }
    });

    const review = await workbench.app.inject({
      method: "POST",
      url: "/api/review/close-day"
    });
    expect(review.statusCode).toBe(200);
    expect(review.json().review.tasks.total).toBeGreaterThan(0);
  });

  it("carries unfinished planned tasks into the current day", async () => {
    const previousTodo = await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "昨天未完成", status: "todo", plannedDate: "2000-01-01" }
    });
    const previousDone = await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "昨天已完成", status: "done", plannedDate: "2000-01-01" }
    });

    const dashboard = await workbench.app.inject("/api/widgets/workstation");
    expect(dashboard.statusCode).toBe(200);

    const tasks = (await workbench.app.inject("/api/tasks")).json().tasks as Array<{
      id: string;
      plannedDate?: string;
    }>;
    const currentDate = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());

    expect(tasks.find((task) => task.id === previousTodo.json().task.id)?.plannedDate).toBe(currentDate);
    expect(tasks.find((task) => task.id === previousDone.json().task.id)?.plannedDate).toBe("2000-01-01");
  });

  it("supports mock music controls", async () => {
    const clearedPlaylist = await workbench.app.inject({
      method: "PATCH",
      url: "/api/settings/workstation",
      payload: {
        music: {
          playlistTrackIds: []
        }
      }
    });
    expect(clearedPlaylist.statusCode).toBe(200);

    const current = await workbench.app.inject("/api/music/current");
    expect(current.statusCode).toBe(200);
    expect(current.json().provider).toBe("mineradio");
    expect(current.json().connected).toBe(true);

    const playlist = await workbench.app.inject("/api/music/playlist");
    expect(playlist.statusCode).toBe(200);
    expect(playlist.json().trackIds).toEqual([]);

    const play = await workbench.app.inject({
      method: "POST",
      url: "/api/music/play"
    });
    expect(play.statusCode).toBe(200);
    expect(play.json().playing).toBe(true);

    const mood = await workbench.app.inject({
      method: "POST",
      url: "/api/music/mood",
      payload: { mood: "coding" }
    });
    expect(mood.json().mood).toBe("coding");
  });

  it("updates workstation settings and widget settings", async () => {
    const settings = await workbench.app.inject("/api/settings/workstation");
    expect(settings.statusCode).toBe(200);
    expect(settings.json().defaultMode).toBe("study");

    const updated = await workbench.app.inject({
      method: "PATCH",
      url: "/api/settings/workstation",
      payload: {
        defaultMode: "coding",
        activitywatch: {
          baseUrl: "http://127.0.0.1:5601"
        }
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().defaultMode).toBe("coding");
    expect(updated.json().activitywatch.baseUrl).toBe("http://127.0.0.1:5601");
    expect(updated.json().music.playlistTrackIds).toEqual([]);

    const widgets = await workbench.app.inject("/api/settings/widgets");
    const firstWidgetId = widgets.json().widgets[0].id;
    const widget = await workbench.app.inject({
      method: "PATCH",
      url: `/api/settings/widgets/${encodeURIComponent(firstWidgetId)}`,
      payload: {
        enabled: false,
        modes: ["review"]
      }
    });
    expect(widget.statusCode).toBe(200);
    expect(widget.json().widget.enabled).toBe(false);
    expect(widget.json().widget.modes).toEqual(["review"]);
  });

  it("uses saved settings for adapters", async () => {
    const updated = await workbench.app.inject({
      method: "PATCH",
      url: "/api/settings/workstation",
      payload: {
        activitywatch: {
          baseUrl: "http://127.0.0.1:5601"
        },
        activityStats: {
          tokeiRepo: join(tmpdir(), "missing-tokei-from-settings"),
          githubUsername: "settings-user"
        },
        music: {
          enabled: false
        }
      }
    });
    expect(updated.statusCode).toBe(200);

    const activity = await workbench.app.inject("/api/activitywatch/current");
    expect(activity.statusCode).toBe(200);
    expect(activity.json().baseUrl).toBe("http://127.0.0.1:5601");

    const tokei = await workbench.app.inject("/api/tokei/usage");
    expect(tokei.json().error).toContain("missing-tokei-from-settings");

    const github = await workbench.app.inject("/api/github/contributions");
    expect(github.json().username).toBe("settings-user");

    const music = await workbench.app.inject("/api/music/current");
    expect(music.json().provider).toBe("disabled");
  });

  it("removes legacy placeholder playlist ids without publishing personal defaults", async () => {
    const saved = await workbench.app.inject({
      method: "PATCH",
      url: "/api/settings/workstation",
      payload: {
        music: {
          playlistTrackIds: LEGACY_PLACEHOLDER_TRACK_IDS
        }
      }
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json().music.playlistTrackIds).toEqual([]);
  });

  it("seeds six planning boards and supports deleting tasks", async () => {
    const projects = await workbench.app.inject("/api/projects");
    expect(projects.statusCode).toBe(200);
    expect(projects.json().projects.map((project: { id: string }) => project.id)).toEqual([
      "math",
      "kaoyan",
      "basic",
      "tech",
      "research",
      "buffer"
    ]);

    const created = await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: { title: "验证码绕过", projectId: "tech", tags: ["认证", "调试"] }
    });
    const taskId = created.json().task.id;
    const deleted = await workbench.app.inject({ method: "DELETE", url: `/api/tasks/${taskId}` });
    expect(deleted.statusCode).toBe(200);
    expect((await workbench.app.inject("/api/tasks")).json().tasks).toEqual([]);
  });

  it("creates indexes for dashboard and review queries", async () => {
    const rows = workbench.database.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all() as Array<{ name: string }>;
    const indexes = rows.map((row) => row.name);

    expect(indexes).toContain("idx_tasks_status");
    expect(indexes).toContain("idx_tasks_planned_date");
    expect(indexes).toContain("idx_focus_sessions_started_at");
    expect(indexes).toContain("idx_focus_segments_session_id");
  });

  it("creates and protects timer policies used by tasks", async () => {
    const created = await workbench.app.inject({
      method: "POST",
      url: "/api/settings/timer-policies",
      payload: {
        id: "test-policy",
        name: "测试策略",
        mode: "count-up",
        config: {
          defaultFocusMinutes: 25,
          defaultBreakMinutes: 5,
          allowExtend: true,
          allowShorten: true,
          allowSkipBreak: true,
          allowManualAdjustment: true
        }
      }
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().timerPolicy.id).toBe("test-policy");

    await workbench.app.inject({
      method: "POST",
      url: "/api/tasks",
      payload: {
        title: "绑定策略任务",
        timerPolicyId: "test-policy"
      }
    });

    const deleted = await workbench.app.inject({
      method: "DELETE",
      url: "/api/settings/timer-policies/test-policy"
    });
    expect(deleted.statusCode).toBe(500);
  });
});
