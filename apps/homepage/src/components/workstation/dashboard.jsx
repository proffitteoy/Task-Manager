import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";

import BlogBackground from "components/blog-background/BlogBackground";
import WorkstationMusicPlayer from "components/workstation/music-player";

const TABS = [
  { id: "overview", label: "首页" },
  { id: "planner", label: "日程计划" },
  { id: "timer", label: "弹性计时" },
  { id: "stats", label: "开发统计" },
  { id: "activity", label: "电脑活动" },
  { id: "music", label: "音乐" },
  { id: "review", label: "每日复盘" },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

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

const DAILY_PLAN_MINUTES = 9 * 60;

export default function WorkstationDashboard() {
  const { data, error, isLoading, mutate } = useSWR("/api/workstation/widgets/workstation", fetchJson, {
    refreshInterval: 8_000,
  });
  const { data: resources } = useSWR("/api/workstation/system-resources", fetchJson, { refreshInterval: 3_000 });
  const [activeTab, setActiveTab] = useState("overview");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskProjectId, setTaskProjectId] = useState("");
  const [taskTags, setTaskTags] = useState("");
  const [resourceHistory, setResourceHistory] = useState({ cpu: [], memory: [], gpu: [] });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [tick, setTick] = useState(() => Date.now());

  const tasks = data?.tasks ?? [];
  const currentDate = todayKey();
  const todayTasks = useMemo(
    () => tasks.filter((task) => !task.plannedDate || task.plannedDate === currentDate),
    [currentDate, tasks]
  );
  const projects = data?.projects ?? [];
  const timer = data?.timer ?? { running: false, paused: false };
  const summary = data?.summary ?? {};
  const review = data?.review ?? null;
  const settings = data?.settings ?? {};

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

  useEffect(() => {
    if (!resources?.fetchedAt) return;
    setResourceHistory((current) => ({
      cpu: appendPoint(current.cpu, resources.cpu?.usagePercent),
      memory: appendPoint(current.memory, resources.memory?.usagePercent),
      gpu: appendPoint(current.gpu, resources.gpu?.usagePercent),
    }));
  }, [resources]);

  const taskStats = useMemo(() => {
    const stats = { todo: 0, doing: 0, done: 0, blocked: 0 };
    for (const task of todayTasks) {
      if (task.status in stats) stats[task.status] += 1;
    }
    return stats;
  }, [todayTasks]);

  const activeTask = tasks.find((task) => task.id === timer.session?.taskId);
  const activeProject = projects.find((project) => project.id === timer.session?.projectId);
  const nextTask = todayTasks.find((task) => task.status === "doing") ?? todayTasks.find((task) => task.status === "todo");
  const elapsedMinutes = timer.session ? sessionMinutes(timer.session, tick) : 0;

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
          projectId: taskProjectId || undefined,
          plannedDate: todayKey(),
          tags: parseTags(taskTags),
        }),
      "任务已加入今天。"
    );
    setTaskTitle("");
    setTaskTags("");
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

  function startProjectFocus(projectId) {
    return run(
      "timer",
      () => postJson("/api/workstation/timer/start", { projectId }),
      "已按板块启动专注。"
    );
  }

  function updateTask(taskId, payload) {
    return run(`task-${taskId}`, () => patchJson(`/api/workstation/tasks/${encodeURIComponent(taskId)}`, payload), "任务已更新。");
  }

  function deleteTask(taskId) {
    return run(`task-${taskId}`, () => deleteJson(`/api/workstation/tasks/${encodeURIComponent(taskId)}`), "任务已删除。");
  }

  function pauseOrResume() {
    return run(
      "timer",
      () => postJson(timer.paused ? "/api/workstation/timer/resume" : "/api/workstation/timer/pause", {}),
      timer.paused ? "计时已继续。" : "计时已暂停。"
    );
  }

  function stopFocus() {
    return run("timer", () => postJson("/api/workstation/timer/stop", { reason: "用户结束专注" }), "");
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
          projects={projects}
          taskTitle={taskTitle}
          taskProjectId={taskProjectId}
          taskTags={taskTags}
          tasks={todayTasks}
          timer={timer}
          onCreateTask={createTask}
          onStartFocus={startFocus}
          onDeleteTask={deleteTask}
          onTaskProjectChange={setTaskProjectId}
          onTaskTagsChange={setTaskTags}
          onTaskTitleChange={setTaskTitle}
          onUpdateTask={updateTask}
        />
      </section>
    ),
    timer: (
      <section className="workstation-tab-grid">
        <TimerPanel
          activeTask={activeTask}
          activeProject={activeProject}
          busy={busy}
          elapsedMinutes={elapsedMinutes}
          projects={projects}
          settings={settings}
          summary={summary}
          tasks={todayTasks}
          timer={timer}
          onPauseOrResume={pauseOrResume}
          onStartProjectFocus={startProjectFocus}
          onStartFocus={startFocus}
          onStopFocus={stopFocus}
        />
      </section>
    ),
    stats: (
      <section className="workstation-tab-grid">
        <StatsPanel summary={summary} />
      </section>
    ),
    activity: (
      <section className="workstation-tab-grid">
        <ComputerActivityPanel activity={computerActivityValue(summary)} history={resourceHistory} resources={resources} />
      </section>
    ),
    music: (
      <section className="workstation-music-tab">
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
            <p className="workstation-eyebrow">本地优先 · 科研开发全流程记录</p>
            <h1>科研开发工作站</h1>
            <p className="workstation-hero-copy">统一管理任务、分板块专注、开发活动与每日复盘，核心数据默认保存在本机。</p>
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
          <a href="/settings/workstation">工作站设置</a>
        </footer>
      </section>
    </main>
  );
}

function OverviewPanel({ busy, elapsedMinutes, nextTask, summary, timer, onSelectTab, onStartFocus }) {
  return (
    <section className="workstation-overview-shell">
      <article className="workstation-panel workstation-today-panel">
        <PanelHeader title={timer.session ? "当前专注" : "今日概览"} />
        <div className="workstation-focus-brief">
          <span>{timer.session ? (timer.paused ? "已暂停" : "专注中") : "准备开始"}</span>
          <strong>{timer.session ? formatMinutes(elapsedMinutes) : nextTask?.title ?? "今天还没有待办"}</strong>
          <small>{timer.session ? "专注记录将用于当日统计。" : nextTask ? "可以直接开始，也可以先调整任务板块与标签。" : "先在日程计划中添加一项任务。"}</small>
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
          <Metric label="今日 Token" value={formatCompact(summary.tokenTotal)} hint="开发活动" />
          <Metric label="今日提交" value={formatCompact(summary.githubContributionCount)} hint="GitHub" />
        </div>
      </article>
    </section>
  );
}

function TaskPanel({ busy, isLoading, nextTask, projects, taskStats, taskTitle, taskProjectId, taskTags, tasks, timer, onCreateTask, onDeleteTask, onStartFocus, onTaskProjectChange, onTaskTagsChange, onTaskTitleChange, onUpdateTask }) {
  const visibleTasks = tasks.slice(0, 20);
  return (
    <article className="workstation-panel workstation-panel-wide">
      <PanelHeader
        actionLabel={nextTask ? "启动下一项" : "无待办"}
        disabled={Boolean(timer.session || busy)}
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
        <select aria-label="任务板块" onChange={(event) => onTaskProjectChange(event.target.value)} value={taskProjectId}>
          <option value="">选择板块</option>
          {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
        </select>
        <input
          aria-label="任务标签"
          onChange={(event) => onTaskTagsChange(event.target.value)}
          placeholder="标签，用逗号分隔"
          value={taskTags}
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
          <TaskRow
            key={task.id}
            busy={busy}
            projects={projects}
            task={task}
            timer={timer}
            onDeleteTask={onDeleteTask}
            onStartFocus={onStartFocus}
            onUpdateTask={onUpdateTask}
          />
        ))}
        {!isLoading && tasks.length === 0 ? <EmptyLine text="今天还没有任务。先写下一项，再启动专注。" /> : null}
      </div>
    </article>
  );
}

function TaskRow({ busy, projects, task, timer, onDeleteTask, onStartFocus, onUpdateTask }) {
  const [tagDraft, setTagDraft] = useState((task.tags ?? []).join(", "));
  useEffect(() => setTagDraft((task.tags ?? []).join(", ")), [task.tags]);
  const project = projects.find((item) => item.id === task.projectId);
  return (
    <div className="workstation-task-row">
      <div className="workstation-task-copy">
        <strong>{task.title}</strong>
        <div className="workstation-task-meta">
          <span>{STATUS_LABELS[task.status] ?? task.status}</span>
          {project ? <span style={{ borderColor: project.color, color: project.color }}>{project.name}</span> : <span>未分板块</span>}
          {(task.tags ?? []).map((tag) => <span key={tag}>#{tag}</span>)}
        </div>
      </div>
      <div className="workstation-task-editors">
        <select
          aria-label={`${task.title}所属板块`}
          onChange={(event) => onUpdateTask(task.id, { projectId: event.target.value || null })}
          value={task.projectId ?? ""}
        >
          <option value="">未分板块</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <input
          aria-label={`${task.title}标签`}
          onBlur={() => onUpdateTask(task.id, { tags: parseTags(tagDraft) })}
          onChange={(event) => setTagDraft(event.target.value)}
          placeholder="添加标签"
          value={tagDraft}
        />
      </div>
      <div className="workstation-task-actions">
        <button disabled={Boolean(timer.session || busy)} onClick={() => onStartFocus(task.id)} type="button">开始</button>
        <button className="is-danger" disabled={Boolean(busy)} onClick={() => onDeleteTask(task.id)} type="button">删除</button>
      </div>
    </div>
  );
}

function TimerPanel({ activeTask, activeProject, busy, elapsedMinutes, projects, settings, summary, tasks, timer, onPauseOrResume, onStartProjectFocus, onStartFocus, onStopFocus }) {
  const preferences = settings.tasks?.projectPreferences ?? [];
  const minutesByProject = new Map((summary.topProjects ?? []).map((item) => [item.projectId, Number(item.minutes ?? 0)]));
  const totalFocusMinutes = projects.reduce((total, project) => total + (minutesByProject.get(project.id) ?? 0), 0);
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const planProgress = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  return (
    <div className="workstation-timer-ledger">
      <section className="workstation-timer-portfolio">
        <header className="workstation-timer-heading">
          <div>
            <h2>今日分类计划</h2>
            <p>每个分类可设置任务并独立计时</p>
          </div>
          <div>
            <span>基础计划完成度</span>
            <strong>{planProgress}%</strong>
          </div>
        </header>

        <article className="workstation-allocation-card">
          <header><strong>时间配比</strong><span>9h 日计划 · 已分配 {preferences.reduce((total, item) => total + Number(item.allocationPercent ?? 0), 0)}%</span></header>
          <div>
            {projects.map((project) => {
              const preference = preferences.find((item) => item.id === project.id);
              return (
                <span key={project.id} title={`${project.name} ${preference?.allocationPercent ?? 0}%`}>
                  <i style={{ background: project.color ?? "#475467" }} />
                  <b>{project.name}</b>
                  <em>{preference?.allocationPercent ?? 0}%</em>
                </span>
              );
            })}
          </div>
        </article>

        <div className="workstation-project-ledger">
          {projects.map((project, index) => {
            const preference = preferences.find((item) => item.id === project.id);
            const projectTasks = tasks.filter((task) => task.projectId === project.id);
            const openTasks = projectTasks.filter((task) => task.status !== "done");
            const investedMinutes = minutesByProject.get(project.id) ?? 0;
            const allocationPercent = Number(preference?.allocationPercent ?? 0);
            const targetMinutes = Math.max(1, Math.round(DAILY_PLAN_MINUTES * allocationPercent / 100));
            const progress = Math.min(100, Math.round((investedMinutes / targetMinutes) * 100));
            const isTiming = timer.session?.projectId === project.id;
            return (
              <article className={isTiming ? "is-timing" : ""} key={project.id} style={{ "--project-color": project.color ?? "#475467" }}>
                <i className="workstation-project-ledger-accent" />
                <header>
                  <div>
                    <p><span>{String(index + 1).padStart(2, "0")}</span><em>分类计时</em>{isTiming ? <b>● 计时中</b> : null}</p>
                    <h3>{project.icon} {project.name}</h3>
                    <small>{preference?.description ?? "本地任务板块"}</small>
                  </div>
                  <div className="workstation-project-invested">
                    <span>今日</span>
                    <strong>{formatTimerHours(investedMinutes)}</strong>
                    <small>/ {formatTimerHours(targetMinutes)} · 配比 {allocationPercent}%</small>
                  </div>
                </header>
                <div className="workstation-project-task-summary">
                  <div><span>今日任务</span><strong>{projectTasks.length === 0 ? "暂无任务" : `${projectTasks.length - openTasks.length}/${projectTasks.length} 已完成`}</strong></div>
                  <button disabled={Boolean(timer.session || busy)} onClick={() => openTasks[0] ? onStartFocus(openTasks[0].id) : onStartProjectFocus(project.id)} type="button">
                    {openTasks[0] ? "开始下一项" : "开始计时"}
                  </button>
                </div>
                <ul>
                  {projectTasks.slice(0, 4).map((task) => <li className={task.status === "done" ? "is-done" : ""} key={task.id}><i />{task.title}</li>)}
                  {projectTasks.length === 0 ? <li className="is-empty">可在“日程计划”中添加{project.name}任务</li> : null}
                </ul>
                <div className="workstation-project-progress"><i style={{ width: `${progress}%` }} /></div>
                <footer><span>{progress}% 今日配额</span><span>{openTasks.length} 项待推进</span></footer>
              </article>
            );
          })}
        </div>
      </section>

      <aside className="workstation-timer-sidebar">
        <article className={`workstation-focus-dock ${timer.session ? "is-active" : ""}`}>
          <header><i /><span>{timer.session ? (timer.paused ? "专注已暂停" : "专注进行中") : "等待开始"}</span><b>{activeProject?.name ?? "弹性计时"}</b></header>
          <p>{activeTask?.title ?? activeProject?.name ?? "从左侧分类选择任务并开始计时"}</p>
          <span>本轮</span>
          <strong>{formatElapsedTimer(elapsedMinutes)}</strong>
          <small>今日累计 {formatMinutes(totalFocusMinutes)}</small>
          {timer.breakReminder?.level && timer.breakReminder.level !== "none" ? (
            <div className="workstation-inline-notice" role="status"><strong>{timer.breakReminder.level === "hard" ? "该休息了" : "休息提醒"}</strong><span>{timer.breakReminder.message}</span></div>
          ) : null}
          <div>
            {timer.session ? (
              <><button disabled={busy === "timer"} onClick={onPauseOrResume} type="button">{timer.paused ? "继续" : "暂停"}</button><button disabled={busy === "timer"} onClick={onStopFocus} type="button">结束本轮</button></>
            ) : <button disabled={busy === "timer"} onClick={() => onStartFocus()} type="button">无分类计时</button>}
          </div>
        </article>

        <article className="workstation-timer-agenda">
          <header><h3>今日时间安排</h3><span>按分类执行</span></header>
          <ol>
            {projects.map((project) => {
              const preference = preferences.find((item) => item.id === project.id);
              const projectTasks = tasks.filter((task) => task.projectId === project.id && task.status !== "done");
              return (
                <li key={project.id} style={{ "--project-color": project.color ?? "#475467" }}>
                  <i /><span>{preference?.allocationPercent ?? 0}% 配额</span><strong>{project.name}</strong><small>{projectTasks[0]?.title ?? "暂无待办，可直接按分类计时"}</small>
                </li>
              );
            })}
          </ol>
        </article>
      </aside>
    </div>
  );
}

function ComputerActivityPanel({ activity, history, resources }) {
  const gpuMemoryPercent = resources?.gpu?.memoryTotalMb
    ? (Number(resources.gpu.memoryUsedMb ?? 0) / Number(resources.gpu.memoryTotalMb)) * 100
    : null;
  const topApps = Array.isArray(activity.topApps) ? activity.topApps : [];
  const topWindows = Array.isArray(activity.topWindows) ? activity.topWindows : [];
  const topDomains = Array.isArray(activity.topDomains) ? activity.topDomains : [];
  const timeline = Array.isArray(activity.timeline) ? activity.timeline : [];
  const hourlyActivity = Array.isArray(activity.hourlyActivity) ? activity.hourlyActivity : [];

  return (
    <article className="workstation-panel workstation-panel-wide workstation-panel-tall">
      <PanelHeader title="电脑活动" />
      <section className="workstation-activity-section">
        <div className="workstation-section-heading">
          <div><span>应用活动</span><strong>{formatMinutes(activity.trackedMinutes)}</strong></div>
          <p>当天窗口与网页事件仅在本机读取，不写入工作站数据库。</p>
        </div>
        {activity.connected ? (
          <div className="workstation-computer-activity-grid">
            <ActivityTimeline events={timeline} />
            <HourlyActivityChart values={hourlyActivity} />
            <ActivityDistribution items={topApps} />
            <RankedActivityCard items={topApps} title="应用排行" />
            <RankedActivityCard items={topWindows} title="窗口排行" />
            <RankedActivityCard items={topDomains} title="网页域名" />
          </div>
        ) : (
          <EmptyLine text="未连接 ActivityWatch；连接后会显示应用排行、窗口、网页域名与当天时间线。" />
        )}
      </section>

      <section className="workstation-activity-section workstation-system-section">
        <div className="workstation-section-heading">
          <div><span>系统资源</span><strong>最近 3 分钟</strong></div>
          <p>CPU、内存与显卡指标只保留在当前浏览器会话。</p>
        </div>
      <div className="workstation-resource-grid">
        <ResourceCard
          color="#ef4444"
          detail={resources?.cpu ? `用户 ${formatPercent(resources.cpu.userPercent)} · 系统 ${formatPercent(resources.cpu.systemPercent)}` : "等待采样"}
          history={history.cpu}
          label="CPU"
          value={resources?.cpu?.usagePercent}
        />
        <ResourceCard
          color="#eab308"
          detail={resources?.memory ? `${formatBytes(resources.memory.usedBytes)} / ${formatBytes(resources.memory.totalBytes)}` : "等待采样"}
          history={history.memory}
          label="内存"
          value={resources?.memory?.usagePercent}
        />
        <ResourceCard
          color="#22c55e"
          detail={resources?.gpu ? `${resources.gpu.model}${resources.gpu.temperatureC !== null ? ` · ${Math.round(resources.gpu.temperatureC)}°C` : ""}` : "驱动未提供 GPU 指标"}
          history={history.gpu}
          label="GPU"
          value={resources?.gpu?.usagePercent}
        />
        <ResourceCard
          color="#06b6d4"
          detail={resources?.gpu?.memoryTotalMb ? `${formatCompact(resources.gpu.memoryUsedMb)} / ${formatCompact(resources.gpu.memoryTotalMb)} MB` : "驱动未提供显存指标"}
          history={[]}
          label="显存"
          value={gpuMemoryPercent}
        />
      </div>
      {resources?.errors?.length ? <ErrorList errors={resources.errors} /> : null}
      </section>
    </article>
  );
}

function ActivityTimeline({ events }) {
  const segments = events.map((event, index) => {
    const timestamp = Date.parse(event.timestamp);
    const date = new Date(timestamp);
    if (!Number.isFinite(timestamp)) return null;
    const startMinutes = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
    const left = Math.max(0, Math.min(100, (startMinutes / 1440) * 100));
    const width = Math.max(0.28, Math.min(100 - left, (Number(event.duration ?? 0) / 86_400) * 100));
    return {
      ...event,
      id: `${event.timestamp}-${event.app}-${index}`,
      color: activityColor(event.app),
      left,
      width,
    };
  }).filter(Boolean);
  return (
    <article className="workstation-activity-card workstation-timeline-card">
      <header><strong>当天时间线</strong><span>{segments.length} 段活动</span></header>
      <div className="workstation-timeline" role="img" aria-label="当天应用活动时间线">
        {segments.map((segment) => (
          <span
            key={segment.id}
            title={`${formatClock(segment.timestamp)} · ${segment.app}${segment.title ? ` · ${segment.title}` : ""}`}
            style={{ background: segment.color, left: `${segment.left}%`, width: `${segment.width}%` }}
          />
        ))}
      </div>
      <div className="workstation-timeline-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
    </article>
  );
}

function HourlyActivityChart({ values }) {
  const normalized = Array.from({ length: 24 }, (_, hour) => {
    const item = values.find((entry) => Number(entry.hour) === hour);
    return { hour, minutes: Math.max(0, Number(item?.minutes ?? 0)) };
  });
  const max = Math.max(1, ...normalized.map((item) => item.minutes));
  return (
    <article className="workstation-activity-card workstation-hourly-card">
      <header><strong>每小时活动</strong><span>分钟</span></header>
      <div className="workstation-hourly-bars">
        {normalized.map((item) => (
          <span key={item.hour} title={`${String(item.hour).padStart(2, "0")}:00 · ${formatMinutes(item.minutes)}`}>
            <i style={{ height: `${Math.max(item.minutes > 0 ? 5 : 1, (item.minutes / max) * 100)}%` }} />
          </span>
        ))}
      </div>
      <div className="workstation-hourly-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
    </article>
  );
}

function ActivityDistribution({ items }) {
  const visible = items.slice(0, 6);
  const total = visible.reduce((sum, item) => sum + Math.max(0, Number(item.minutes ?? 0)), 0);
  let cursor = 0;
  const stops = visible.map((item) => {
    const start = cursor;
    cursor += total > 0 ? (Number(item.minutes ?? 0) / total) * 100 : 0;
    return `${activityColor(item.name)} ${start}% ${cursor}%`;
  });
  const background = stops.length > 0 ? `conic-gradient(${stops.join(",")})` : "var(--ws-line-soft)";
  return (
    <article className="workstation-activity-card workstation-distribution-card">
      <header><strong>应用分布</strong><span>前 {visible.length || 0} 项</span></header>
      <div className="workstation-distribution-body">
        <div className="workstation-donut" style={{ background }}><span>{formatMinutes(total)}</span></div>
        <div className="workstation-donut-legend">
          {visible.map((item) => <span key={item.name}><i style={{ background: activityColor(item.name) }} />{item.name}</span>)}
        </div>
      </div>
    </article>
  );
}

function RankedActivityCard({ items, title }) {
  const visible = items.slice(0, 6);
  const max = Math.max(1, ...visible.map((item) => Number(item.minutes ?? 0)));
  return (
    <article className="workstation-activity-card workstation-ranking-card">
      <header><strong>{title}</strong><span>{visible.length} 项</span></header>
      <div>
        {visible.length > 0 ? visible.map((item, index) => (
          <p key={`${item.name}-${index}`} title={item.name}>
            <span>{item.name}</span><strong>{formatMinutes(item.minutes)}</strong>
            <i style={{ background: activityColor(item.name), width: `${Math.max(3, (Number(item.minutes ?? 0) / max) * 100)}%` }} />
          </p>
        )) : <small>暂无数据</small>}
      </div>
    </article>
  );
}

function ResourceCard({ color, detail, history, label, value }) {
  const normalized = value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Math.max(0, Math.min(100, Number(value)))
    : null;
  return (
    <article style={{ "--resource-color": color }}>
      <header><span>{label}</span><strong>{normalized === null ? "不可用" : `${Math.round(normalized)}%`}</strong></header>
      <ResourceChart color={color} values={history} />
      <p>{detail ?? (normalized === null ? "等待采样" : "实时利用率")}</p>
    </article>
  );
}

function ResourceChart({ color, values }) {
  const points = values.length > 1
    ? values.map((value, index) => `${(index / (values.length - 1)) * 100},${40 - (Number(value) / 100) * 36}`).join(" ")
    : "0,40 100,40";
  return (
    <svg aria-hidden="true" className="workstation-resource-chart" preserveAspectRatio="none" viewBox="0 0 100 40">
      <path d="M0 40H100" stroke="rgba(15,23,42,.08)" />
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function StatsPanel({ summary }) {
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

  useEffect(() => {
    if (!years.includes(year) && years.length > 0) setYear(years[0]);
  }, [year, years]);

  return (
    <article className="workstation-panel workstation-panel-wide workstation-panel-tall">
      <PanelHeader title="开发统计" />
      <div className="workstation-evidence workstation-evidence-four">
        <div><span>今日 Token</span><strong>{formatCompact(summary.tokenTotal)}</strong></div>
        <div><span>今日提交</span><strong>{formatCompact(summary.githubContributionCount)}</strong></div>
        <div><span>总 Token</span><strong>{formatCompact(summary.tokenCumulative)}</strong></div>
        <div><span>总提交</span><strong>{formatCompact(github.total)}</strong></div>
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
      <PanelHeader actionLabel="生成复盘" disabled={busy === "review"} onAction={onCloseDay} title="每日复盘" />
      <div className="workstation-review">
        <p>{review?.summary ?? "复盘汇总任务、分板块专注、开发统计与音乐状态。"}</p>
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

async function patchJson(url, payload) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function deleteJson(url) {
  const response = await fetch(url, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
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

function todayKey() {
  return localDateKey(new Date());
}

function formatTimerHours(minutes) {
  const value = Math.max(0, Number(minutes ?? 0)) / 60;
  return `${value.toFixed(value >= 10 ? 0 : 1)}h`;
}

function formatElapsedTimer(minutes) {
  const totalSeconds = Math.max(0, Math.round(Number(minutes ?? 0) * 60));
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  return `${hours}:${mins}`;
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function initialTab() {
  if (typeof window === "undefined") return "overview";
  const tab = String(window.location?.hash ?? "").replace(/^#/, "");
  return TAB_IDS.has(tab) ? tab : "overview";
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function computerActivityValue(summary) {
  const activity = objectValue(summary.computerActivity);
  const moduleStatus = objectValue(objectValue(summary.moduleStatus).activityWatch);
  return {
    ...activity,
    connected: activity.connected === true || moduleStatus.connected === true,
    topApps: Array.isArray(activity.topApps) ? activity.topApps : Array.isArray(summary.topApps) ? summary.topApps : [],
  };
}

function parseTags(value) {
  return [...new Set(String(value ?? "").split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean))];
}

function appendPoint(values, value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return values;
  return [...values, numeric].slice(-60);
}

function formatBytes(value) {
  const bytes = Number(value ?? 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 GB";
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : "-";
}

function formatClock(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

function activityColor(value) {
  const palette = ["#2f766d", "#d97745", "#4579a8", "#bb4d67", "#7b68a6", "#779246", "#a06c3b", "#368598"];
  const text = String(value ?? "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) hash = (hash * 31 + text.charCodeAt(index)) | 0;
  return palette[Math.abs(hash) % palette.length];
}
