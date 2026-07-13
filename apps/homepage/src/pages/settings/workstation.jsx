import Head from "next/head";
import { serverSideTranslations } from "next-i18next/pages/serverSideTranslations";
import { useEffect, useState } from "react";
import useSWR from "swr";

const SECTIONS = [
  ["overview", "概览"],
  ["music", "音乐"],
  ["activity", "ActivityWatch"],
  ["stats", "统计"],
];

export async function getStaticProps() {
  return {
    props: {
      ...(await serverSideTranslations("zh-Hans")),
    },
  };
}

export default function WorkstationSettingsPage() {
  const [section, setSection] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const { data: settings, error, mutate } = useSWR("/api/workstation/settings/workstation", fetchJson);
  const { data: status } = useSWR("/api/workstation/workstation/status", fetchJson);

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.classList.add("light");
    localStorage.setItem("theme-mode", "light");
  }, []);

  async function run(action, doneMessage = "已保存") {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await mutate();
      setMessage(doneMessage);
    } catch (requestError) {
      setMessage(requestError instanceof Error ? requestError.message : String(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8">
      <Head>
        <title>工作站设置</title>
      </Head>

      <section className="mx-auto max-w-6xl">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.24em] text-indigo-500">SETTINGS</p>
          <div className="mt-3 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black md:text-5xl">工作站设置</h1>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
                配置仅写入本机数据目录。开源发行包不会预置个人账号、本机路径或私人歌单。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700" href="/music">
                打开音乐页
              </a>
              <a className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700" href="/workstation">
                返回工作站
              </a>
            </div>
          </div>
          {message ? <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-700">{message}</p> : null}
        </header>

        <div className="mt-6 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
            {SECTIONS.map(([id, label]) => (
              <button
                key={id}
                className={`mb-2 block w-full rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  section === id ? "bg-indigo-500 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
                onClick={() => setSection(id)}
                type="button"
              >
                {label}
              </button>
            ))}
          </nav>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {!settings ? (
              <EmptyState text={error ? "无法连接 workbench-core 设置接口。" : "正在加载设置。"} />
            ) : section === "overview" ? (
              <OverviewSection settings={settings} status={status} />
            ) : section === "music" ? (
              <MusicSection
                busy={busy}
                data={settings.music}
                onSave={(payload) => run(() => patchJson("/api/workstation/settings/workstation", { music: payload }), "音乐设置已保存")}
              />
            ) : section === "activity" ? (
              <ActivitySection
                busy={busy}
                data={settings.activitywatch}
                onSave={(payload) => run(() => patchJson("/api/workstation/settings/workstation", { activitywatch: payload }), "ActivityWatch 设置已保存")}
              />
            ) : (
              <StatsSection
                busy={busy}
                data={settings.activityStats}
                onSave={(payload) => run(() => patchJson("/api/workstation/settings/workstation", { activityStats: payload }), "统计设置已保存")}
              />
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function OverviewSection({ settings, status }) {
  return (
    <div>
      <SectionHeader
        title="概览"
        description="查看当前本地配置状态。空白账号、路径和歌单表示尚未配置。"
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="核心服务" value={status?.core?.ok ? "已连接" : "未连接"} />
        <MetricCard title="默认模式" value={settings.defaultMode} />
        <MetricCard title="音乐源" value={settings.music.provider} />
        <MetricCard title="歌单曲数" value={settings.music.playlistTrackIds.length} />
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MetricCard title="ActivityWatch" value={settings.activitywatch.enabled ? settings.activitywatch.baseUrl : "已关闭"} />
        <MetricCard title="GitHub 用户" value={settings.activityStats.githubUsername || "-"} />
      </div>
    </div>
  );
}

function MusicSection({ data, busy, onSave }) {
  const [draft, setDraft] = useState({
    enabled: data.enabled,
    enableLyrics: data.enableLyrics,
    provider: data.provider,
    serviceUrl: data.serviceUrl ?? "",
    playlistText: formatTrackIds(data.playlistTrackIds),
  });

  useEffect(() => {
    setDraft({
      enabled: data.enabled,
      enableLyrics: data.enableLyrics,
      provider: data.provider,
      serviceUrl: data.serviceUrl ?? "",
      playlistText: formatTrackIds(data.playlistTrackIds),
    });
  }, [data]);

  const parsedTrackIds = parseTrackIdsInput(draft.playlistText);

  return (
    <div>
      <SectionHeader
        title="音乐"
        description="配置本地播放器使用的歌曲。发行版本不附带任何个人歌单。"
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <Card>
          <div className="flex flex-wrap gap-2">
            <ToggleButton
              checked={draft.enabled}
              disabled={busy}
              label="启用音乐"
              onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
            />
            <ToggleButton
              checked={draft.enableLyrics}
              disabled={busy}
              label="启用歌词"
              onClick={() => setDraft((current) => ({ ...current, enableLyrics: !current.enableLyrics }))}
            />
          </div>

          {draft.provider === "remote" ? (
            <div className="mt-4">
              <FieldLabel label="远程服务地址">
                <input
                  className={INPUT_CLASS}
                  disabled={busy}
                  placeholder="http://127.0.0.1:3901"
                  value={draft.serviceUrl}
                  onChange={(event) => setDraft((current) => ({ ...current, serviceUrl: event.target.value }))}
                />
              </FieldLabel>
            </div>
          ) : null}

          <div className="mt-4">
            <FieldLabel label="歌曲 ID 列表">
              <textarea
                className={`${INPUT_CLASS} min-h-[220px] py-3 leading-7`}
                disabled={busy}
                placeholder="输入歌曲 ID，每行一个"
                value={draft.playlistText}
                onChange={(event) => setDraft((current) => ({ ...current, playlistText: event.target.value }))}
              />
            </FieldLabel>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={PRIMARY_BUTTON_CLASS}
              disabled={busy}
              onClick={() =>
                onSave({
                  enabled: draft.enabled,
                  enableLyrics: draft.enableLyrics,
                  serviceUrl: draft.provider === "remote" ? draft.serviceUrl.trim() : data.serviceUrl,
                  playlistTrackIds: parsedTrackIds,
                })
              }
              type="button"
            >
              保存音乐设置
            </button>
          </div>
        </Card>

        <Card>
          <p className="text-sm font-semibold text-slate-500">当前说明</p>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-slate-700">
            <li>当前提供方：{draft.provider}</li>
            <li>当前解析到 {parsedTrackIds.length} 首候选歌曲</li>
            <li>歌曲 ID 只保存在本地工作站数据库中</li>
            <li>留空时播放器不会自动加载维护者的个人歌单</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

function ActivitySection({ data, busy, onSave }) {
  const [draft, setDraft] = useState({
    enabled: data.enabled,
    baseUrl: data.baseUrl,
  });

  useEffect(() => {
    setDraft({
      enabled: data.enabled,
      baseUrl: data.baseUrl,
    });
  }, [data]);

  return (
    <div>
      <SectionHeader
        title="ActivityWatch"
        description="这里只留连接必需项。watcher、AFK 细节先不往页面上摊。"
      />

      <Card>
        <div className="flex flex-wrap gap-2">
          <ToggleButton
            checked={draft.enabled}
            disabled={busy}
            label="启用 ActivityWatch"
            onClick={() => setDraft((current) => ({ ...current, enabled: !current.enabled }))}
          />
        </div>

        <div className="mt-4">
          <FieldLabel label="aw-server 地址">
            <input
              className={INPUT_CLASS}
              disabled={busy}
              value={draft.baseUrl}
              onChange={(event) => setDraft((current) => ({ ...current, baseUrl: event.target.value }))}
            />
          </FieldLabel>
        </div>

        <button
          className={`${PRIMARY_BUTTON_CLASS} mt-4`}
          disabled={busy}
          onClick={() => onSave({ enabled: draft.enabled, baseUrl: draft.baseUrl.trim() })}
          type="button"
        >
          保存 ActivityWatch 设置
        </button>
      </Card>
    </div>
  );
}

function StatsSection({ data, busy, onSave }) {
  const [draft, setDraft] = useState({
    tokeiRepo: data.tokeiRepo,
    githubUsername: data.githubUsername,
  });

  useEffect(() => {
    setDraft({
      tokeiRepo: data.tokeiRepo,
      githubUsername: data.githubUsername,
    });
  }, [data]);

  return (
    <div>
      <SectionHeader
        title="统计"
        description="按需配置本地 Token collector 和公开 GitHub 用户名；发行版本默认留空。"
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-2">
          <FieldLabel label="Tokei 仓库路径">
            <input
              className={INPUT_CLASS}
              disabled={busy}
              placeholder="例如 D:\\tools\\tokei"
              value={draft.tokeiRepo}
              onChange={(event) => setDraft((current) => ({ ...current, tokeiRepo: event.target.value }))}
            />
          </FieldLabel>

          <FieldLabel label="GitHub 用户名">
            <input
              className={INPUT_CLASS}
              disabled={busy}
              placeholder="例如 octocat"
              value={draft.githubUsername}
              onChange={(event) => setDraft((current) => ({ ...current, githubUsername: event.target.value }))}
            />
          </FieldLabel>
        </div>

        <button
          className={`${PRIMARY_BUTTON_CLASS} mt-4`}
          disabled={busy}
          onClick={() => onSave({ tokeiRepo: draft.tokeiRepo.trim(), githubUsername: draft.githubUsername.trim() })}
          type="button"
        >
          保存统计设置
        </button>
      </Card>
    </div>
  );
}

function SectionHeader({ title, description }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-500">/settings/workstation</p>
      <h2 className="mt-1 text-2xl font-black">{title}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-600">{description}</p>
    </div>
  );
}

function MetricCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 break-words text-xl font-black text-slate-900">{value}</p>
    </div>
  );
}

function Card({ children }) {
  return <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">{children}</div>;
}

function FieldLabel({ label, children }) {
  return (
    <label className="block text-sm font-semibold text-slate-700">
      {label}
      <div className="mt-2">{children}</div>
    </label>
  );
}

function ToggleButton({ checked, label, disabled, onClick }) {
  return (
    <button
      className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${checked ? "bg-indigo-500 text-white" : "bg-white text-slate-700"} disabled:opacity-50`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}：{checked ? "开" : "关"}
    </button>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-2xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">{text}</div>;
}

const INPUT_CLASS =
  "block w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";

const PRIMARY_BUTTON_CLASS =
  "rounded-2xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-600 disabled:opacity-50";

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function patchJson(url, payload) {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function parseTrackIdsInput(value) {
  return [...new Set(String(value ?? "").split(/[\s,，]+/).map((item) => item.trim()).filter(Boolean))];
}

function formatTrackIds(trackIds) {
  return Array.isArray(trackIds) ? trackIds.join("\n") : "";
}
