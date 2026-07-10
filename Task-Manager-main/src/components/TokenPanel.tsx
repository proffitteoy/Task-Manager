import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import {
  buildActivityStats,
  buildYearHeatmap,
  modeLabel,
  normalizeDays,
  type ActivityDatum,
  type ActivityMode,
  type ActivityStats,
  type HeatmapCell,
  type HeatmapMonth,
  type HeatmapResult,
} from "../lib/activity";
import {
  buildTokenDashboard,
  formatMoney,
  formatTokens,
  RANGE_LABEL,
  type RangeKey,
  type TokenDashboard,
  type TokenMetrics,
  type ToolUsage,
} from "../lib/tokei";

type LoadState = "loading" | "ready" | "error";

const TOKEN_ACTIVITY_CACHE_KEY = "time-manager.token-activity.v1";
const GITHUB_ACTIVITY_CACHE_KEY = "time-manager.github-activity.v1";

interface GitHubCommitDay {
  date: string;
  count: number;
  repos: number;
}

interface GitHubRepoUsage {
  name: string;
  path: string;
  commits: number;
  activeDays: number;
}

interface GitHubCommitDashboard {
  fetchedAt: number;
  since: string;
  username: string;
  source: string;
  roots: string[];
  repos: GitHubRepoUsage[];
  days: GitHubCommitDay[];
  total: number;
  activeDays: number;
  peak: { date: string; count: number };
  currentStreak: number;
  longestStreak: number;
  errors: string[];
}

const MODES: ActivityMode[] = ["daily", "weekly", "cumulative"];

type ActivityTone = "token" | "github";

interface ActivityYearGroup {
  year: number;
  stats: ActivityStats;
  heatmap: HeatmapResult;
}

interface ActivityDataset {
  id: ActivityTone;
  label: string;
  caption: string;
  unit: string;
  days: ActivityDatum[];
  tone: ActivityTone;
  formatValue: (value: number) => string;
  yearAside: (group: ActivityYearGroup) => ReactNode;
  footer?: (mode: ActivityMode) => ReactNode;
}

export function TokenPanel() {
  const [cachedActivity] = useState(() => readActivityCache());
  const [token, setToken] = useState<TokenDashboard | null>(
    () => cachedActivity.token
  );
  const [github, setGithub] = useState<GitHubCommitDashboard | null>(
    () => cachedActivity.github
  );
  const [activityMode, setActivityMode] = useState<ActivityMode>("daily");
  const [activeSource, setActiveSource] = useState<ActivityTone>("token");
  const [status, setStatus] = useState<LoadState>(
    () => (cachedActivity.token || cachedActivity.github ? "ready" : "loading")
  );
  const hasVisibleData = useRef(Boolean(cachedActivity.token || cachedActivity.github));
  const [refreshing, setRefreshing] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const refresh = useCallback(async (forceFresh = false) => {
    setRefreshing(true);
    setErrors([]);
    setStatus((current) => (current === "ready" ? "ready" : "loading"));
    const freshQuery = forceFresh ? `?fresh=${Date.now()}` : "";

    const [tokenResult, githubResult] = await Promise.allSettled([
      fetchJson(`/api/tokei/usage${freshQuery}`),
      fetchJson(`/api/github/commits${freshQuery}`),
    ]);
    const nextErrors: string[] = [];

    if (tokenResult.status === "fulfilled") {
      const nextToken = buildTokenDashboard(tokenResult.value);
      setToken(nextToken);
      writeCache(TOKEN_ACTIVITY_CACHE_KEY, nextToken);
      hasVisibleData.current = true;
    } else {
      nextErrors.push(`Tokei: ${errorMessage(tokenResult.reason)}`);
    }

    if (githubResult.status === "fulfilled") {
      const nextGithub = githubResult.value as GitHubCommitDashboard;
      setGithub(nextGithub);
      writeCache(GITHUB_ACTIVITY_CACHE_KEY, nextGithub);
      hasVisibleData.current = true;
    } else {
      nextErrors.push(`GitHub: ${errorMessage(githubResult.reason)}`);
    }

    const canShowData =
      tokenResult.status === "fulfilled" ||
      githubResult.status === "fulfilled" ||
      hasVisibleData.current;

    setErrors(nextErrors);
    setStatus(nextErrors.length >= 2 && !canShowData ? "error" : "ready");
    setRefreshing(false);
  }, []);

  useEffect(() => {
    refresh(false);
    const id = window.setInterval(() => refresh(false), 90_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const tokenDays = useMemo<ActivityDatum[]>(
    () =>
      token?.daily.map((day) => ({
        date: day.date,
        value: day.tokens,
      })) ?? [],
    [token]
  );
  const githubDays = useMemo<ActivityDatum[]>(
    () =>
      github?.days.map((day) => ({
        date: day.date,
        value: day.count,
      })) ?? [],
    [github]
  );
  const tokenCostByYear = useMemo(
    () => buildTokenCostByYear(token?.daily ?? []),
    [token]
  );
  const activityDatasets = useMemo<ActivityDataset[]>(() => {
    const datasets: ActivityDataset[] = [];

    if (token) {
      datasets.push({
        id: "token",
        label: "Token",
        caption: "使用量与成本",
        unit: "token",
        days: tokenDays,
        tone: "token",
        formatValue: formatTokens,
        yearAside: (group) => (
          <TokenYearAside
            group={group}
            cost={tokenCostByYear.get(group.year) ?? 0}
          />
        ),
        footer: (mode) =>
          token.tools.length > 0 ? (
            <ToolSummary tools={token.tools} mode={mode} />
          ) : null,
      });
    }

    if (github) {
      datasets.push({
        id: "github",
        label: "GitHub",
        caption: `@${github.username}`,
        unit: "次贡献",
        days: githubDays,
        tone: "github",
        formatValue: (value) => `${Math.round(value)}`,
        yearAside: (group) => (
          <GitHubYearAside group={group} username={github.username} />
        ),
        footer: () =>
          github.errors.length > 0 ? (
            <GitHubErrorNotice count={github.errors.length} />
          ) : null,
      });
    }

    return datasets;
  }, [github, githubDays, token, tokenCostByYear, tokenDays]);
  const activeDataset =
    activityDatasets.find((dataset) => dataset.id === activeSource) ??
    activityDatasets[0] ??
    null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="space-y-6"
    >
      <section className="panel ledger-shadow rounded-xl border hairline p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-[11px] uppercase text-faint">
              <span>活动统计</span>
              <span className="h-px w-8 bg-hair" />
              <span className="font-mono">Tokei + GitHub</span>
            </div>
            <h2 className="mt-2 font-display text-2xl text-parchment">
              Token 与 GitHub 活动
            </h2>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-faint">
              汇总近一年 token 使用和 GitHub 贡献，可按日、按周或累计查看；需要最新情况时重新读取当前数据。
            </p>
          </div>
          <button
            onClick={() => refresh(true)}
            disabled={refreshing}
            className="rounded-md border border-[var(--color-sage)] px-4 py-2 font-display text-[13px] text-sage transition-colors hover:bg-white/70 disabled:cursor-wait disabled:opacity-60"
          >
            {refreshing ? "获取中" : "获取当前数据"}
          </button>
        </div>

        <ProfileStats
          token={token}
          github={github}
        />
      </section>

      {status === "loading" && !token && !github && <LoadingPanel />}

      {errors.length > 0 && (
        <div className="space-y-2">
          {errors.map((error) => (
            <div
              key={error}
              className="rounded-lg border border-[rgba(217,79,72,0.35)] bg-[rgba(217,79,72,0.08)] px-4 py-3 text-[13px] leading-relaxed text-debt"
            >
              {error}
            </div>
          ))}
        </div>
      )}

      {activeDataset && (
        <ActivitySection
          dataset={activeDataset}
          datasets={activityDatasets}
          activeSource={activeDataset.id}
          onSourceChange={setActiveSource}
          mode={activityMode}
          onModeChange={setActivityMode}
        />
      )}
    </motion.div>
  );
}

function ProfileStats({
  token,
  github,
}: {
  token: TokenDashboard | null;
  github: GitHubCommitDashboard | null;
}) {
  const stats = [
    {
      label: "Token 获取时间",
      value: token ? formatDateTime(token.fetchedAt) : "-",
    },
    {
      label: "GitHub 获取时间",
      value: github ? formatDateTime(github.fetchedAt) : "-",
    },
    {
      label: "Token 工具",
      value: token ? `${token.tools.length}` : "-",
    },
    {
      label: "GitHub 仓库",
      value: github ? `${github.repos.length}` : "-",
    },
  ];

  return (
    <div className="mt-5 grid overflow-hidden rounded-xl border hairline bg-white/55 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((item) => (
        <div
          key={item.label}
          className="border-b hairline px-4 py-3 sm:border-b-0 sm:border-r last:border-r-0"
        >
          <div className="tnum font-mono text-[1.35rem] leading-none text-parchment">
            {item.value}
          </div>
          <div className="mt-1 truncate text-[12px] text-faint">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function ActivitySection({
  dataset,
  datasets,
  activeSource,
  onSourceChange,
  mode,
  onModeChange,
}: {
  dataset: ActivityDataset;
  datasets: ActivityDataset[];
  activeSource: ActivityTone;
  onSourceChange: (source: ActivityTone) => void;
  mode: ActivityMode;
  onModeChange: (mode: ActivityMode) => void;
}) {
  const years = useMemo(() => buildActivityYears(dataset.days), [dataset.days]);
  const [selectedYear, setSelectedYear] = useState(
    () => years[0] ?? new Date().getFullYear()
  );

  useEffect(() => {
    if (!years.includes(selectedYear)) {
      setSelectedYear(years[0] ?? new Date().getFullYear());
    }
  }, [selectedYear, years]);

  const selectedGroup = useMemo(
    () => buildYearGroup(dataset.days, mode, selectedYear),
    [dataset.days, mode, selectedYear]
  );
  const footer = dataset.footer?.(mode);

  return (
    <section className="panel ledger-shadow rounded-xl border hairline p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-xl text-parchment">活动地图</h3>
          <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-faint">
            切换数据源与每日、每周、累计口径，查看活动强度变化。
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {datasets.length > 1 && (
            <SourceSwitcher
              sources={datasets}
              value={activeSource}
              onChange={onSourceChange}
            />
          )}
          <SegmentedMode value={mode} onChange={onModeChange} />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_84px] lg:items-start">
        <div className="min-w-0">
          <div className="mb-4">
            {dataset.yearAside(selectedGroup)}
          </div>
          <Heatmap
            cells={selectedGroup.heatmap.cells}
            months={selectedGroup.heatmap.months}
            max={selectedGroup.heatmap.max}
            tone={dataset.tone}
            unit={dataset.unit}
            formatValue={dataset.formatValue}
          />
        </div>
        <YearSwitcher
          years={years}
          value={selectedYear}
          onChange={setSelectedYear}
        />
      </div>
      {footer && <div className="mt-5">{footer}</div>}
    </section>
  );
}

function Heatmap({
  cells,
  months,
  max,
  tone,
  unit,
  formatValue,
}: {
  cells: HeatmapCell[];
  months: HeatmapMonth[];
  max: number;
  tone: "token" | "github";
  unit: string;
  formatValue: (value: number) => string;
}) {
  const columns = Math.max(1, ...cells.map((cell) => cell.week + 1));

  return (
    <div className="min-w-0 overflow-x-auto pb-2">
      <div className="grid w-max grid-cols-[24px_auto] gap-x-2">
        <div
          aria-hidden="true"
          className="grid gap-[5px] text-[10px] leading-[11px] text-faint"
          style={{ gridTemplateRows: "repeat(7, 11px)" }}
        >
          <span className="row-start-2">一</span>
          <span className="row-start-4">三</span>
          <span className="row-start-6">五</span>
        </div>
        <div>
          <div
            className="grid gap-[5px]"
            style={{
              gridTemplateRows: "repeat(7, 11px)",
              gridAutoFlow: "column",
              gridAutoColumns: "11px",
              width: `${columns * 16}px`,
            }}
          >
            {cells.map((cell) => (
              <span
                key={cell.date}
                title={`${cell.date}: ${formatValue(cell.raw)} ${unit}`}
                className="block rounded-[3px]"
                style={{
                  gridColumn: cell.week + 1,
                  gridRow: cell.weekday + 1,
                  background: heatColor(cell.value, max, tone),
                }}
              />
            ))}
          </div>
          <div
            className="mt-3 grid gap-[5px] text-[11px] text-faint"
            style={{
              gridTemplateColumns: `repeat(${columns}, 11px)`,
              width: `${columns * 16}px`,
            }}
          >
            {months.map((month) => (
              <span
                key={`${month.label}-${month.week}`}
                className="whitespace-nowrap"
                style={{ gridColumn: month.week + 1 }}
              >
                {month.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-faint">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="h-[10px] w-[10px] rounded-[3px]"
            style={{ background: heatColor(level, 4, tone) }}
          />
        ))}
        <span>多</span>
      </div>
    </div>
  );
}

function SegmentedMode({
  value,
  onChange,
}: {
  value: ActivityMode;
  onChange: (mode: ActivityMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border hairline bg-white/58 p-1">
      {MODES.map((mode) => (
        <button
          key={mode}
          onClick={() => onChange(mode)}
          className={`rounded-md px-3 py-1.5 text-[12px] transition-colors ${
            value === mode
              ? "bg-parchment text-white"
              : "text-quill hover:bg-white/75"
          }`}
        >
          {modeLabel(mode)}
        </button>
      ))}
    </div>
  );
}

function SourceSwitcher({
  sources,
  value,
  onChange,
}: {
  sources: ActivityDataset[];
  value: ActivityTone;
  onChange: (source: ActivityTone) => void;
}) {
  return (
    <div
      className="inline-flex rounded-lg border hairline bg-white/58 p-1"
      aria-label="数据源"
    >
      {sources.map((source) => (
        <button
          key={source.id}
          type="button"
          onClick={() => onChange(source.id)}
          className={`rounded-md px-3 py-1.5 text-left transition-colors ${
            value === source.id
              ? "bg-sage text-white"
              : "text-quill hover:bg-white/75"
          }`}
        >
          <span className="block font-display text-[12px] leading-tight">
            {source.label}
          </span>
          <span
            className={`block text-[10px] leading-tight ${
              value === source.id ? "text-white/70" : "text-faint"
            }`}
          >
            {source.caption}
          </span>
        </button>
      ))}
    </div>
  );
}

function YearSwitcher({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number;
  onChange: (year: number) => void;
}) {
  return (
    <div
      className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:border-l lg:pb-0 lg:pl-3 hairline"
      aria-label="年份"
    >
      {years.map((year) => (
        <button
          key={year}
          type="button"
          onClick={() => onChange(year)}
          className={`tnum min-w-[64px] rounded-md px-3 py-1.5 text-center font-mono text-[13px] transition-colors lg:min-w-0 ${
            value === year
              ? "bg-parchment text-white"
              : "text-sage hover:bg-white/72"
          }`}
        >
          {year}
        </button>
      ))}
    </div>
  );
}

function TokenYearAside({
  group,
  cost,
}: {
  group: ActivityYearGroup;
  cost: number;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border hairline bg-white/50 px-4 py-3">
      <div>
        <div className="text-[12px] text-faint">{group.year} 年度 token</div>
        <div className="tnum mt-1 font-mono text-xl leading-none text-parchment">
          {formatTokens(group.stats.total)}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 text-right text-[12px] text-faint sm:grid-cols-4">
        <div>
          <div>成本</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {formatMoney(cost)}
          </div>
        </div>
        <div>
          <div>活跃</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {group.stats.activeDays} 天
          </div>
        </div>
        <div>
          <div>峰值</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {formatTokens(group.stats.peak.value)}
          </div>
        </div>
        <div>
          <div>最长连续</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {group.stats.longestStreak} 天
          </div>
        </div>
      </div>
    </div>
  );
}

function GitHubYearAside({
  group,
  username,
}: {
  group: ActivityYearGroup;
  username: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border hairline bg-white/50 px-4 py-3">
      <div>
        <div className="text-[12px] text-faint">
          {Math.round(group.stats.total).toLocaleString("zh-CN")} contributions
          in {group.year}
        </div>
        <div className="mt-1 truncate font-mono text-[12px] text-sage">
          @{username}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 text-right text-[12px] text-faint">
        <div>
          <div>活跃</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {group.stats.activeDays} 天
          </div>
        </div>
        <div>
          <div>峰值</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {Math.round(group.stats.peak.value)}
          </div>
        </div>
        <div>
          <div>最长连续</div>
          <div className="tnum mt-1 font-mono text-[14px] text-parchment">
            {group.stats.longestStreak} 天
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolSummary({
  tools,
  mode,
}: {
  tools: ToolUsage[];
  mode: ActivityMode;
}) {
  const range = rangeForMode(mode);
  const rangeLabel = RANGE_LABEL[range];
  const title = mode === "cumulative" ? "累计工具" : `${rangeLabel}工具`;
  const visibleTools = [...tools]
    .map((tool) => ({ tool, metrics: tool.ranges[range] }))
    .filter(({ metrics }) => hasRangeActivity(metrics))
    .sort(
      (a, b) =>
        b.metrics.tokens - a.metrics.tokens ||
        b.metrics.cost - a.metrics.cost ||
        b.metrics.sessions - a.metrics.sessions
    )
    .slice(0, 4);

  return (
    <div className="border-t hairline pt-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-[15px] text-parchment">{title}</h4>
        <span className="text-[11px] text-faint">
          按{rangeLabel} token 排序
        </span>
      </div>
      {visibleTools.length > 0 ? (
        <div className="grid gap-2 lg:grid-cols-2">
          {visibleTools.map(({ tool, metrics }) => (
            <ToolLine
              key={tool.id}
              tool={tool}
              metrics={metrics}
              rangeLabel={rangeLabel}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg bg-white/55 px-3 py-3 text-[12px] text-faint">
          暂无{rangeLabel}工具活动
        </div>
      )}
    </div>
  );
}

function GitHubErrorNotice({ count }: { count: number }) {
  return (
    <div className="rounded-lg border border-[rgba(184,137,30,0.34)] bg-[rgba(184,137,30,0.08)] px-3 py-2 text-[12px] text-quill">
      GitHub 数据中有 {count} 条异常记录
    </div>
  );
}

function ToolLine({
  tool,
  metrics,
  rangeLabel,
}: {
  tool: ToolUsage;
  metrics: TokenMetrics;
  rangeLabel: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/55 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="font-display text-[14px] text-parchment">{tool.name}</div>
        <div className="text-[11px] text-faint">
          {rangeLabel}成本 {formatMoney(metrics.cost)}
        </div>
        <TokenBreakdown metrics={metrics} />
      </div>
      <div className="tnum font-mono text-[13px] text-sage">
        {formatTokens(metrics.tokens)}
      </div>
    </div>
  );
}

function TokenBreakdown({ metrics }: { metrics: TokenMetrics }) {
  const parts = [
    { label: "in", value: metrics.input, color: "rgba(75, 158, 229, 0.62)" },
    { label: "cache", value: metrics.cache, color: "rgba(49, 127, 103, 0.56)" },
    {
      label: "out",
      value: metrics.output + metrics.reason,
      color: "rgba(184, 137, 30, 0.62)",
    },
  ];
  const total = parts.reduce((sum, part) => sum + part.value, 0);

  if (total <= 0) return null;

  return (
    <div className="mt-2">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[rgba(35,52,46,0.08)]">
        {parts.map((part) => (
          <span
            key={part.label}
            className="h-full"
            style={{
              width: `${(part.value / total) * 100}%`,
              background: part.color,
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-faint">
        {parts.map((part) => (
          <span key={part.label}>
            {part.label} {formatTokens(part.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function rangeForMode(mode: ActivityMode): RangeKey {
  if (mode === "weekly") return "week";
  if (mode === "cumulative") return "year";
  return "today";
}

function hasRangeActivity(metrics: TokenMetrics): boolean {
  return metrics.tokens > 0 || metrics.cost > 0 || metrics.sessions > 0;
}

function LoadingPanel() {
  return (
    <section className="panel ledger-shadow rounded-xl border hairline p-8 text-center">
      <div className="mx-auto h-2 w-28 overflow-hidden rounded-full bg-[rgba(35,52,46,0.1)]">
        <motion.span
          className="block h-full w-1/2 rounded-full bg-sage"
          animate={{ x: ["-100%", "220%"] }}
          transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut" }}
        />
      </div>
      <div className="mt-4 text-[13px] text-faint">正在读取活动数据</div>
    </section>
  );
}

function readActivityCache(): {
  token: TokenDashboard | null;
  github: GitHubCommitDashboard | null;
} {
  return {
    token: readCache(TOKEN_ACTIVITY_CACHE_KEY, isTokenDashboard),
    github: readCache(GITHUB_ACTIVITY_CACHE_KEY, isGitHubCommitDashboard),
  };
}

function readCache<T>(
  key: string,
  isValid: (value: unknown) => value is T
): T | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return isValid(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore quota or privacy-mode failures; fresh network data is already on screen.
  }
}

function isTokenDashboard(value: unknown): value is TokenDashboard {
  const record = asCacheRecord(value);
  return (
    Number.isFinite(record.fetchedAt) &&
    Array.isArray(record.daily) &&
    Array.isArray(record.tools) &&
    Array.isArray(record.errors)
  );
}

function isGitHubCommitDashboard(value: unknown): value is GitHubCommitDashboard {
  const record = asCacheRecord(value);
  return (
    Number.isFinite(record.fetchedAt) &&
    typeof record.username === "string" &&
    Array.isArray(record.days) &&
    Array.isArray(record.errors)
  );
}

function asCacheRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(await readError(response));
  return response.json();
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const body = JSON.parse(text) as { error?: string; detail?: string };
    return body.detail || body.error || response.statusText;
  } catch {
    return text || response.statusText;
  }
}

function buildActivityYears(days: ActivityDatum[]): number[] {
  const normalized = normalizeDays(days);
  const currentYear = new Date().getFullYear();
  const years = new Set<number>([currentYear]);

  for (const day of normalized) {
    const year = yearFromDate(day.date);
    if (year) years.add(year);
  }

  return [...years].sort((a, b) => b - a);
}

function buildYearGroup(
  days: ActivityDatum[],
  mode: ActivityMode,
  year: number
): ActivityYearGroup {
  const normalized = normalizeDays(days);
  const yearDays = normalized.filter((day) => yearFromDate(day.date) === year);
  return {
    year,
    stats: buildActivityStats(yearDays),
    heatmap: buildYearHeatmap(yearDays, mode, year),
  };
}

function buildTokenCostByYear(days: TokenDashboard["daily"]): Map<number, number> {
  const costs = new Map<number, number>();

  for (const day of days) {
    const year = yearFromDate(day.date);
    if (!year) continue;
    costs.set(year, (costs.get(year) ?? 0) + day.cost);
  }

  return costs;
}

function yearFromDate(date: string): number | null {
  const year = Number(date.slice(0, 4));
  return Number.isFinite(year) && year > 0 ? year : null;
}

function heatColor(value: number, max: number, tone: "token" | "github"): string {
  if (value <= 0 || max <= 0) return "rgba(35, 52, 46, 0.06)";
  const t = Math.min(1, value / max);
  const alpha = 0.14 + Math.ceil(t * 4) * 0.15;
  if (tone === "github") return `rgba(49, 127, 103, ${alpha})`;
  return `rgba(75, 158, 229, ${alpha})`;
}

function formatDateTime(value: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
