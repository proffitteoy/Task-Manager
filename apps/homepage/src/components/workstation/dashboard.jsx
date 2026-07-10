import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import BlogBackground from "components/blog-background/BlogBackground";
import WorkstationMusicPlayer from "components/workstation/music-player";

const TABS = [
  { id: "overview", label: "首页", caption: "今日入口" },
  { id: "planner", label: "日程计划", caption: "任务队列" },
  { id: "timer", label: "弹性计时", caption: "专注记录" },
  { id: "stats", label: "Token/GitHub", caption: "开发统计" },
  { id: "activity", label: "电脑活动", caption: "ActivityWatch" },
  { id: "music", label: "音乐", caption: "Mineradio" },
  { id: "review", label: "每日复盘", caption: "闭环输出" },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

const MODE_LABELS = {
  study: "学习",
  coding: "开发",
  writing: "写作",
  music: "音乐",
  review: "复盘",
  rest: "休息",
};

const STATUS_LABELS = {
  todo: "待办",
  doing: "进行中",
  done: "已完成",
  blocked: "阻塞",
};

const ACTIVITY_MODES = [
  { id: "daily", label: "每日" },
  { id: "weekly", label: "每周" },
  { id: "cumulative", label: "累计" },
];

export default function WorkstationDashboard() {
  const { data, error, isLoading, mutate } = useSWR("/api/workstation/widgets/workstation", fetchJson, {
    refreshInterval: 8_000,
  });
  const [activeTab, setActiveTab] = useState("overview");
  const [taskTitle, setTaskTitle] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [tick, setTick] = useState(() => Date.now());

  const tasks = data?.tasks ?? [];
  const timer = data?.timer ?? { running: false, paused: false };
  const summary = data?.summary ?? {};
  const activity = data?.activity ?? {};
  const music = data?.music ?? {};
  const status = data?.status ?? {};
  const review = data?.review ?? null;
  const settings = data?.settings ?? {};
  const currentMode = status.mode ?? settings.defaultMode ?? "study";

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    localStorage.setItem("theme-mode", "light");
    localStorage.setItem("blog-theme", "light");
  }, []);

  useEffect(() => {
    const syncTabFromHash = () => {
      setActiveTab(initialTab());
    };

    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);

    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  useEffect(() => {
    if (!timer.session) return undefined;
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer.session]);

  const taskStats = useMemo(() => {
    const stats = { todo: 0, doing: 0, done: 0, blocked: 0 };
    for (const task of tasks) {
      if (task.status in stats) stats[task.status] += 1;
    }
    return stats;
  }, [tasks]);

  const activeTask = tasks.find((task) => task.id === timer.session?.taskId);
  const nextTask = tasks.find((task) => task.status === "doing") ?? tasks.find((task) => task.status === "todo");
  const elapsedMinutes = timer.session ? sessionMinutes(timer.session, tick) : 0;
  const topApps = Array.isArray(summary.topApps) ? summary.topApps.slice(0, 10) : [];
  const connectionEntries = useMemo(
    () => buildConnectionEntries({ activity, music, settings, status, summary }),
    [activity, music, settings, status, summary]
  );

  async function run(label, action, doneMessage) {
    setBusy(label);
    setNotice("");
    try {
      await action();
      await mutate();
      setNotice(doneMessage);
    } catch (requestError) {
      setNotice(errorMessage(requestError));
    } finally {
      setBusy("");
    }
  }

  async function createTask(event) {
    event.preventDefault();
    const title = taskTitle.trim();
    if (!title) return;
    await run(
      "create-task",
      () =>
        postJson("/api/workstation/tasks", {
          title,
          plannedDate: todayKey(),
          tags: [],
        }),
      "任务已加入今天。"
    );
    setTaskTitle("");
  }

  function selectTab(tabId) {
    setActiveTab(tabId);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", tabId === "overview" ? window.location.pathname : `#${tabId}`);
    }
  }

  function startFocus(taskId) {
    return run(
      "timer",
      () => postJson(taskId ? `/api/workstation/tasks/${encodeURIComponent(taskId)}/start-focus` : "/api/workstation/timer/start", {}),
      taskId ? "已从任务启动专注。" : "已启动无任务专注。"
    );
  }

  function pauseOrResume() {
    return run(
      "timer",
      () => postJson(timer.paused ? "/api/workstation/timer/resume" : "/api/workstation/timer/pause", {}),
      timer.paused ? "计时已继续。" : "计时已暂停。"
    );
  }

  function stopFocus() {
    return run("timer", () => postJson("/api/workstation/timer/stop", { reason: "首页结束本轮专注" }), "本轮专注已归档。");
  }

  function closeDay() {
    return run("review", () => postJson("/api/workstation/review/close-day", {}), "今日复盘已生成。");
  }

  const panels = {
    planner: (
      <section className="workstation-tab-grid">
        <TaskPanel
          busy={busy}
          isLoading={isLoading}
          nextTask={nextTask}
          taskStats={taskStats}
          taskTitle={taskTitle}
          tasks={tasks}
          timer={timer}
          onCreateTask={createTask}
          onStartFocus={startFocus}
          onTaskTitleChange={setTaskTitle}
        />
      </section>
    ),
    timer: (
      <section className="workstation-tab-grid workstation-tab-grid-two">
        <TimerPanel
          activeTask={activeTask}
          busy={busy}
          elapsedMinutes={elapsedMinutes}
          timer={timer}
          onPauseOrResume={pauseOrResume}
          onStartFocus={startFocus}
          onStopFocus={stopFocus}
        />
        <TaskPanel
          busy={busy}
          compact
          isLoading={isLoading}
          nextTask={nextTask}
          taskStats={taskStats}
          taskTitle={taskTitle}
          tasks={tasks}
          timer={timer}
          onCreateTask={createTask}
          onStartFocus={startFocus}
          onTaskTitleChange={setTaskTitle}
        />
      </section>
    ),
    stats: (
      <section className="workstation-tab-grid">
        <StatsPanel settings={settings} summary={summary} />
      </section>
    ),
    activity: (
      <section className="workstation-tab-grid">
        <ActivityPanel activity={activity} settings={settings} summary={summary} topApps={topApps} />
      </section>
    ),
    music: (
      <section className="workstation-tab-grid">
        <WorkstationMusicPlayer embedded showSettingsLink={false} />
      </section>
    ),
    review: (
      <section className="workstation-tab-grid">
        <ReviewPanel busy={busy} review={review} summary={summary} onCloseDay={closeDay} />
      </section>
    ),
  };

return (
    <main className="workstation-home">
      <BlogBackground />
      <section className="workstation-dashboard">
        <header className="workstation-hero">
          <div>
            <p className="workstation-eyebrow">本地优先 · 全流程工作站</p>
            <h1>认知工作站</h1>
            <p className="workstation-hero-copy">今天只保留入口和真实状态；具体工作进入各自板块。</p>
          </div>
          <div className="workstation-mode-card">
            <span>当前模式</span>
            <strong>{labelOf(MODE_LABELS, currentMode)}</strong>
            <small>{status.core?.ok ? "核心服务已连接" : "等待核心服务"}</small>
          </div>
        </header>

        <nav className="workstation-tabs" aria-label="工作站板块" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              aria-controls={`workstation-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? "is-active" : ""}
              id={`workstation-tab-${tab.id}`}
              onClick={() => selectTab(tab.id)}
              role="tab"
              type="button"
            >
              <span>{tab.label}</span>
              <small>{tab.caption}</small>
            </button>
          ))}
        </nav>

        {notice ? <div className="workstation-inline-notice">{notice}</div> : null}

        {error ? (
          <section className="workstation-panel workstation-core-empty">
            <p>暂时无法连接 workbench-core。</p>
            <small>请启动 `pnpm dev:core`，然后刷新首页。</small>
          </section>
        ) : null}

        <section
          aria-labelledby={`workstation-tab-${activeTab}`}
          className="workstation-tab-panel"
          id={`workstation-panel-${activeTab}`}
          role="tabpanel"
        >
          <div className={activeTab === "overview" ? "" : "hidden"}>
            <OverviewPanel
              busy={busy}
              connectionEntries={connectionEntries}
              elapsedMinutes={elapsedMinutes}
              nextTask={nextTask}
              summary={summary}
              timer={timer}
              onSelectTab={selectTab}
              onStartFocus={startFocus}
            />
          </div>
          {Object.entries(panels).map(([tabId, content]) => (
            <div key={tabId} className={activeTab === tabId ? "" : "hidden"}>
              {content}
            </div>
          ))}
        </section>

        <footer className="workstation-footer">
          <div>
            {connectionEntries.map((entry) => (
              <span key={entry.id} className={entry.connected ? "is-enabled" : "is-warning"}>
                {entry.label}
              </span>
            ))}
          </div>
          <a href="/settings/workstation">工作站设置</a>
        </footer>
      </section>
    </main>
  );
}

function OverviewPanel({ busy, connectionEntries, elapsedMinutes, nextTask, summary, timer, onSelectTab, onStartFocus }) {
  const connectedCount = connectionEntries.filter((entry) => entry.connected).length;
  return (
    <section className="workstation-overview-shell">
      <article className="workstation-panel workstation-today-panel">
        <PanelHeader eyebrow="今日入口" title={timer.session ? "当前专注" : "下一步"} />
        <div className="workstation-focus-brief">
          <span>{timer.session ? (timer.paused ? "已暂停" : "专注中") : "准备开始"}</span>
          <strong>{timer.session ? formatMinutes(elapsedMinutes) : nextTask?.title ?? "今天还没有待办"}</strong>
          <small>{timer.session ? "本轮记录会进入每日复盘。" : nextTask ? "从下一项开始，或者进入日程计划调整队列。" : "先写下一项任务，再启动计时。"}</small>
        </div>
        <div className="workstation-overview-actions">
          <button disabled={Boolean(timer.session || busy || !nextTask)} onClick={() => nextTask && onStartFocus(nextTask.id)} type="button">
            启动下一项
          </button>
          <button onClick={() => onSelectTab("planner")} type="button">
            日程计划
          </button>
          <button onClick={() => onSelectTab("timer")} type="button">
            弹性计时
          </button>
        </div>
        <div className="workstation-overview-metrics">
          <Metric label="今日专注" value={formatMinutes(summary.focusMinutes)} hint={`有效 ${formatMinutes(summary.effectiveFocusMinutes)}`} />
          <Metric label="今日 Token" value={formatCompact(summary.tokenTotal)} hint="本地 Collector" />
          <Metric label="GitHub 今日" value={formatCompact(summary.githubContributionCount)} hint="贡献记录" />
        </div>
      </article>

      <article className="workstation-panel workstation-health-panel">
        <PanelHeader eyebrow="真实连接状态" title={`${connectedCount}/${connectionEntries.length} 已连接`} />
        <div className="workstation-connection-list">
          {connectionEntries.map((entry) => (
            <ConnectionRow key={entry.id} entry={entry} onSelectTab={onSelectTab} />
          ))}
        </div>
      </article>
    </section>
  );
}

function TaskPanel({ busy, compact = false, isLoading, nextTask, taskStats, taskTitle, tasks, timer, onCreateTask, onStartFocus, onTaskTitleChange }) {
  const visibleTasks = compact ? tasks.slice(0, 4) : tasks.slice(0, 12);
  return (
    <article className={`workstation-panel ${compact ? "" : "workstation-panel-wide"}`}>
      <PanelHeader
        actionLabel={nextTask ? "启动下一项" : "无待办"}
        disabled={Boolean(timer.session || busy)}
        eyebrow="时间分配与任务队列"
        onAction={nextTask ? () => onStartFocus(nextTask.id) : undefined}
        title="任务与日程"
      />
      <form className="workstation-task-form" onSubmit={onCreateTask}>
        <input
          aria-label="新任务标题"
          onChange={(event) => onTaskTitleChange(event.target.value)}
          placeholder="写下今天要推进的任务"
          value={taskTitle}
        />
        <button disabled={busy === "create-task" || !taskTitle.trim()} type="submit">
          加入今天
        </button>
      </form>
      <div className="workstation-task-stats">
        {Object.entries(taskStats).map(([statusKey, count]) => (
          <span key={statusKey}>
            {STATUS_LABELS[statusKey]} <strong>{count}</strong>
          </span>
        ))}
      </div>
      <div className="workstation-task-list">
        {visibleTasks.map((task) => (
          <div className="workstation-task-row" key={task.id}>
            <div>
              <strong>{task.title}</strong>
              <small>
                {STATUS_LABELS[task.status] ?? task.status}
                {task.estimateMinutes ? ` · 预计 ${task.estimateMinutes} 分钟` : ""}
              </small>
            </div>
            <button disabled={Boolean(timer.session || busy)} onClick={() => onStartFocus(task.id)} type="button">
              开始
            </button>
          </div>
        ))}
        {!isLoading && tasks.length === 0 ? <EmptyLine text="今天还没有任务。先写下一项，再启动专注。" /> : null}
      </div>
    </article>
  );
}

function TimerPanel({ activeTask, busy, elapsedMinutes, timer, onPauseOrResume, onStartFocus, onStopFocus }) {
  return (
    <article className="workstation-panel workstation-timer-panel workstation-panel-tall">
      <PanelHeader eyebrow="弹性规则与休息提醒" title="弹性专注计时" />
      <div className="workstation-timer-face">
        <span>{timer.session ? (timer.paused ? "已暂停" : "专注中") : "未启动"}</span>
        <strong>{formatMinutes(elapsedMinutes)}</strong>
        <small>{activeTask?.title ?? "可无任务启动，结束后再归档"}</small>
      </div>
      {timer.breakReminder?.level && timer.breakReminder.level !== "none" ? (
        <div className="workstation-inline-notice" role="status">
          <strong>{timer.breakReminder.level === "hard" ? "该休息了" : "休息提醒"}</strong>
          <span>{timer.breakReminder.message}</span>
        </div>
      ) : null}
      <div className="workstation-actions">
        {timer.session ? (
          <>
            <button disabled={busy === "timer"} onClick={onPauseOrResume} type="button">
              {timer.paused ? "继续" : "暂停"}
            </button>
            <button disabled={busy === "timer"} onClick={onStopFocus} type="button">
              结束
            </button>
          </>
        ) : (
          <button disabled={busy === "timer"} onClick={() => onStartFocus()} type="button">
            直接开始
          </button>
        )}
      </div>
    </article>
  );
}

function ActivityPanel({ activity, settings, summary, topApps }) {
  const status = summary.moduleStatus?.activityWatch ?? {};
  const windowData = objectValue(activity.window);
  const afkData = objectValue(activity.afk);
  const appName = stringValue(windowData.app) || "未读取到当前应用";
  const title = stringValue(windowData.title) || stringValue(windowData.window);
  const afkStatus = stringValue(afkData.status);
  const activityUrl = activity.baseUrl ?? status.baseUrl ?? settings.activitywatch?.baseUrl;
  return (
    <article className="workstation-panel workstation-panel-wide workstation-panel-tall">
      <PanelHeader eyebrow="ActivityWatch · 电脑活动" title="电脑活动" />
      <div className="workstation-status-line">
        <span className={activity.connected === true ? "is-ok" : "is-warn"} />
        <strong>{activity.connected === true ? "已连接 ActivityWatch" : "未连接 ActivityWatch"}</strong>
        <small>{activity.connected === true ? `${appName}${title ? ` · ${title}` : ""}` : activity.error ?? status.error ?? "aw-server 未返回数据"}</small>
      </div>
      <div className="workstation-diagnostics">
        <Diagnostic label="aw-server" value={activity.baseUrl ?? status.baseUrl ?? settings.activitywatch?.baseUrl ?? "-"} />
        <Diagnostic label="AFK 状态" value={afkStatus || "暂无"} />
        <Diagnostic label="有效专注" value={formatMinutes(summary.effectiveFocusMinutes)} />
        <Diagnostic label="AFK 时间" value={formatMinutes(summary.afkMinutes)} />
      </div>
      {activityUrl ? (
        <div className="workstation-actions">
          <a className="workstation-inline-link" href={activityUrl} rel="noreferrer" target="_blank">
            打开 ActivityWatch
          </a>
        </div>
      ) : null}
      <div className="workstation-mini-list workstation-app-list">
        {topApps.map((app, index) => (
          <div key={`${app.name ?? index}-${index}`}>
            <span>{app.name ?? app.app ?? `应用 ${index + 1}`}</span>
            <strong>{formatMinutes(Number(app.minutes ?? app.durationMinutes ?? 0))}</strong>
          </div>
        ))}
        {topApps.length === 0 ? <EmptyLine text="暂无今日应用排行。请确认 ActivityWatch watcher 已启动。" /> : null}
      </div>
    </article>
  );
}

function StatsPanel({ settings, summary }) {
  const [activeSource, setActiveSource] = useState("token");
  const [mode, setMode] = useState("daily");
  const tokenDashboard = objectValue(summary.tokenDashboard);
  const github = objectValue(summary.github);
  const datasets = useMemo(() => buildActivityDatasets(tokenDashboard, github), [github, tokenDashboard]);
  const activeDataset = datasets.find((item) => item.id === activeSource) ?? datasets[0] ?? null;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const years = useMemo(() => buildActivityYears(activeDataset?.days ?? []), [activeDataset]);
  const activeYear = years.includes(year) ? year : years[0] ?? new Date().getFullYear();
  const heatmap = useMemo(() => buildYearHeatmap(activeDataset?.days ?? [], mode, activeYear), [activeDataset, activeYear, mode]);
  const tokenStatus = summary.moduleStatus?.tokei ?? {};
  const githubStatus = summary.moduleStatus?.github ?? {};

  useEffect(() => {
    if (!years.includes(year) && years.length > 0) setYear(years[0]);
  }, [year, years]);

  return (
    <article className="workstation-panel workstation-panel-wide workstation-panel-tall">
      <PanelHeader eyebrow="本地开发活动统计" title="Token 与 GitHub" />
      <div className="workstation-diagnostics">
        <Diagnostic label="Token 源" value={firstValue(summary.tokenSource?.roots) ?? settings.activityStats?.tokeiRepo ?? "-"} />
        <Diagnostic label="Collector" value={summary.tokenSource?.collector ?? tokenStatus.collector ?? "未找到 usage.30s.py"} />
        <Diagnostic label="GitHub 用户" value={github.username ?? githubStatus.username ?? settings.activityStats?.githubUsername ?? "-"} />
        <Diagnostic label="今日贡献" value={formatCompact(summary.githubContributionCount)} />
      </div>

      <div className="workstation-evidence">
        <div>
          <span>今日 Token</span>
          <strong>{formatCompact(summary.tokenTotal)}</strong>
        </div>
        <div>
          <span>今年 GitHub</span>
          <strong>{formatCompact(github.total)}</strong>
        </div>
      </div>

      {activeDataset ? (
        <>
          <div className="workstation-activity-toolbar">
            <SegmentedControl items={datasets} labelKey="label" value={activeDataset.id} onChange={setActiveSource} />
            <SegmentedControl items={ACTIVITY_MODES} value={mode} onChange={setMode} />
            <SegmentedControl items={years.map((item) => ({ id: item, label: String(item) }))} value={activeYear} onChange={setYear} />
          </div>
          <div className="workstation-heatmap-wrap">
            <div className="workstation-year-aside">
              <span>{activeYear}</span>
              <strong>{activeDataset.format(heatmap.stats.total)}</strong>
              <small>活跃 {heatmap.stats.activeDays} 天 · 峰值 {activeDataset.format(heatmap.stats.peak.value)}</small>
            </div>
            <Heatmap cells={heatmap.cells} max={heatmap.max} months={heatmap.months} tone={activeDataset.id} unit={activeDataset.unit} format={activeDataset.format} />
          </div>
        </>
      ) : (
        <EmptyLine text="还没有读到 Tokei Collector 或 GitHub 活动数据。" />
      )}

      <ErrorList errors={summary.errors ?? []} />
    </article>
  );
}

function ReviewPanel({ busy, review, summary, onCloseDay }) {
  return (
    <article className="workstation-panel workstation-panel-wide">
      <PanelHeader actionLabel="生成复盘" disabled={busy === "review"} eyebrow="闭环输出" onAction={onCloseDay} title="每日复盘" />
      <div className="workstation-review">
        <p>{review?.summary ?? "复盘会汇总任务、计时、ActivityWatch、Token/GitHub 与音乐状态。"}</p>
        <div className="workstation-review-grid">
          <span>完成任务：{summary.taskCompletedCount ?? 0}</span>
          <span>专注记录：{summary.sessionCount ?? 0}</span>
          <span>音乐分钟：{formatMinutes(summary.musicMinutes)}</span>
        </div>
        <ErrorList errors={review?.review?.issues ?? summary.errors ?? []} />
      </div>
    </article>
  );
}

function PanelHeader({ title, eyebrow, actionLabel, onAction, disabled }) {
  return (
    <header className="workstation-panel-header">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {actionLabel ? (
        <button disabled={disabled || !onAction} onClick={onAction} type="button">
          {actionLabel}
        </button>
      ) : null}
    </header>
  );
}

function Metric({ label, value, hint }) {
  return (
    <div className="workstation-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

function Diagnostic({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong title={String(value ?? "-")}>{value ?? "-"}</strong>
    </div>
  );
}

function ConnectionRow({ entry, onSelectTab }) {
  return (
    <button className="workstation-connection-row" onClick={() => onSelectTab(entry.tab)} type="button">
      <span className={entry.connected ? "is-ok" : "is-warn"} />
      <strong>{entry.label}</strong>
      <small>{entry.detail}</small>
    </button>
  );
}

function SegmentedControl({ items, value, onChange, labelKey = "label" }) {
  return (
    <div className="workstation-segmented">
      {items.map((item) => (
        <button key={item.id} className={item.id === value ? "is-active" : ""} onClick={() => onChange(item.id)} type="button">
          {item[labelKey]}
        </button>
      ))}
    </div>
  );
}

function Heatmap({ cells, max, months, tone, unit, format }) {
  const columns = Math.max(1, ...cells.map((cell) => cell.week + 1));
  return (
    <div className="workstation-heatmap">
      <div className="workstation-weekdays" aria-hidden="true">
        <span>一</span>
        <span>三</span>
        <span>五</span>
      </div>
      <div className="workstation-heatmap-body">
        <div className="workstation-heatmap-cells" style={{ gridTemplateColumns: `repeat(${columns}, 11px)` }}>
          {cells.map((cell) => (
            <span
              key={cell.date}
              title={`${cell.date}: ${format(cell.raw)} ${unit}`}
              style={{
                gridColumn: cell.week + 1,
                gridRow: cell.weekday + 1,
                background: heatColor(cell.value, max, tone),
              }}
            />
          ))}
        </div>
        <div className="workstation-heatmap-months" style={{ gridTemplateColumns: `repeat(${columns}, 11px)` }}>
          {months.map((month) => (
            <span key={`${month.label}-${month.week}`} style={{ gridColumn: month.week + 1 }}>
              {month.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ErrorList({ errors }) {
  if (!Array.isArray(errors) || errors.length === 0) return null;
  return (
    <div className="workstation-error-list">
      {errors.slice(0, 5).map((item) => (
        <p key={item}>{item}</p>
      ))}
    </div>
  );
}

function EmptyLine({ text }) {
  return <p className="workstation-empty-line">{text}</p>;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) {
    throw new Error(await readError(response));
  }
  return response.json();
}

async function readError(response) {
  const text = await response.text();
  try {
    const body = JSON.parse(text);
    return body.detail || body.error || response.statusText;
  } catch {
    return text || response.statusText;
  }
}

function buildConnectionEntries({ activity, music, settings, status, summary }) {
  const activityStatus = summary.moduleStatus?.activityWatch ?? {};
  const tokeiStatus = summary.moduleStatus?.tokei ?? {};
  const githubStatus = summary.moduleStatus?.github ?? {};
  return [
    {
      id: "core",
      label: "核心服务",
      tab: "overview",
      connected: status.core?.ok === true,
      detail: status.core?.ok ? "任务、计时、复盘可用" : "workbench-core 未连接",
    },
    {
      id: "activitywatch",
      label: "电脑活动",
      tab: "activity",
      connected: activity.connected === true && activityStatus.connected !== false,
      detail: activity.connected === true ? currentActivityLabel(activity) : activity.error ?? activityStatus.error ?? settings.activitywatch?.baseUrl ?? "ActivityWatch 未连接",
    },
    {
      id: "tokei",
      label: "Token",
      tab: "stats",
      connected: tokeiStatus.connected === true,
      detail: tokeiStatus.connected === true ? firstValue(tokeiStatus.roots) ?? "Tokei 已连接" : tokeiStatus.error ?? "未读取到 usage.30s.py",
    },
    {
      id: "github",
      label: "GitHub",
      tab: "stats",
      connected: githubStatus.connected === true,
      detail: githubStatus.connected === true ? `@${githubStatus.username ?? settings.activityStats?.githubUsername ?? "-"}` : githubStatus.error ?? "GitHub 贡献未连接",
    },
    {
      id: "music",
      label: "音乐",
      tab: "music",
      connected: music.connected === true,
      detail: music.connected === true ? music.provider ?? "播放器已连接" : music.error ?? "未连接 Mineradio 服务",
    },
  ];
}

function buildActivityDatasets(tokenDashboard, github) {
  const tokenDaily = Array.isArray(tokenDashboard.daily)
    ? tokenDashboard.daily.map((day) => ({ date: day.date, value: Number(day.tokens ?? 0) }))
    : [];
  const githubDaily = Array.isArray(github.days)
    ? github.days.map((day) => ({ date: day.date, value: Number(day.count ?? 0) }))
    : [];
  const datasets = [];
  if (tokenDaily.length > 0) {
    datasets.push({
      id: "token",
      label: "Token",
      unit: "token",
      days: tokenDaily,
      format: formatCompact,
    });
  }
  if (githubDaily.length > 0) {
    datasets.push({
      id: "github",
      label: "GitHub",
      unit: "次贡献",
      days: githubDaily,
      format: (value) => String(Math.round(Number(value ?? 0))),
    });
  }
  return datasets;
}

function buildActivityYears(days) {
  const current = new Date().getFullYear();
  const years = new Set([current]);
  for (const day of days) {
    const year = Number(String(day.date).slice(0, 4));
    if (Number.isFinite(year) && year > 0) years.add(year);
  }
  return [...years].sort((a, b) => b - a);
}

function buildYearHeatmap(days, mode, year) {
  const values = new Map(days.map((day) => [day.date, Number(day.value ?? 0)]));
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);
  const firstMonday = new Date(start);
  firstMonday.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const cells = [];
  const months = [];
  let cumulative = 0;
  let max = 0;
  for (const cursor = new Date(firstMonday); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const date = localDateKey(cursor);
    const raw = cursor.getFullYear() === year ? values.get(date) ?? 0 : 0;
    if (cursor.getFullYear() === year) cumulative += raw;
    const week = Math.floor((cursor - firstMonday) / 604_800_000);
    const weekday = (cursor.getDay() + 6) % 7;
    const value = mode === "cumulative" ? cumulative : mode === "weekly" ? weeklyValue(values, cursor, year) : raw;
    max = Math.max(max, value);
    cells.push({ date, raw, value, week, weekday });
    if (cursor.getDate() === 1 && cursor.getFullYear() === year) {
      months.push({ label: `${cursor.getMonth() + 1}月`, week });
    }
  }
  const activeDays = days.filter((day) => String(day.date).startsWith(`${year}-`) && Number(day.value ?? 0) > 0).length;
  const peak = days
    .filter((day) => String(day.date).startsWith(`${year}-`))
    .reduce((best, day) => (Number(day.value ?? 0) > best.value ? { date: day.date, value: Number(day.value ?? 0) } : best), { date: "", value: 0 });
  return {
    cells,
    max,
    months,
    stats: {
      total: days.filter((day) => String(day.date).startsWith(`${year}-`)).reduce((sum, day) => sum + Number(day.value ?? 0), 0),
      activeDays,
      peak,
    },
  };
}

function weeklyValue(values, date, year) {
  let total = 0;
  const start = new Date(date);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  for (let offset = 0; offset < 7; offset += 1) {
    const cursor = new Date(start);
    cursor.setDate(start.getDate() + offset);
    if (cursor.getFullYear() === year) total += values.get(localDateKey(cursor)) ?? 0;
  }
  return total;
}

function heatColor(value, max, tone) {
  if (!value || !max) return "rgba(30, 41, 59, 0.08)";
  const alpha = 0.16 + Math.ceil(Math.min(1, value / max) * 4) * 0.16;
  return tone === "github" ? `rgba(22, 163, 74, ${alpha})` : `rgba(79, 70, 229, ${alpha})`;
}

function currentActivityLabel(activity) {
  const windowData = objectValue(activity.window);
  return stringValue(windowData.app) || stringValue(windowData.title) || "ActivityWatch 已连接";
}

function sessionMinutes(session, now) {
  if (!session) return 0;
  const seconds = (session.segments ?? []).reduce((total, segment) => {
    if (typeof segment.durationSeconds === "number") return total + segment.durationSeconds;
    if (!segment.endedAt && segment.startedAt && segment.type === "focus") {
      return total + Math.max(0, Math.round((now - Date.parse(segment.startedAt)) / 1000));
    }
    return total;
  }, 0);
  return Math.max(0, Math.round(seconds / 60));
}

function formatMinutes(value) {
  const minutes = Number(value ?? 0);
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 分钟";
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function formatCompact(value) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return "-";
  return new Intl.NumberFormat("zh-CN", { notation: numeric >= 10000 ? "compact" : "standard" }).format(numeric);
}

function labelOf(labels, value) {
  return labels[value] ?? value ?? "-";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialTab() {
  if (typeof window === "undefined") return "overview";
  const tab = window.location.hash.replace(/^#/, "");
  return TAB_IDS.has(tab) ? tab : "overview";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}

function firstValue(value) {
  return Array.isArray(value) && value.length > 0 ? value[0] : undefined;
}
