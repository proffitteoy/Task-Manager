export const RANGE_KEYS = [
  "today",
  "yesterday",
  "week",
  "last_week",
  "month",
  "year",
] as const;

export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABEL: Record<RangeKey, string> = {
  today: "今日",
  yesterday: "昨日",
  week: "本周",
  last_week: "上周",
  month: "本月",
  year: "今年",
};

const TOOL_NAMES: Record<string, string> = {
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  grok: "Grok CLI",
  qoder: "Qoder",
  hermes: "Hermes",
  openclaw: "OpenClaw",
  pi: "Pi Agent",
  opencode: "OpenCode",
};

const TOOL_ORDER = Object.keys(TOOL_NAMES);

export interface TokenMetrics {
  tokens: number;
  input: number;
  output: number;
  cache: number;
  reason: number;
  cost: number;
  sessions: number;
  hit: number;
}

export interface DailyTokenUsage {
  date: string;
  tokens: number;
  cost: number;
}

export interface ToolUsage {
  id: string;
  name: string;
  ranges: Record<RangeKey, TokenMetrics>;
  total: TokenMetrics;
}

export interface TokenDashboard {
  fetchedAt: number;
  ranges: Record<RangeKey, TokenMetrics>;
  daily: DailyTokenUsage[];
  tools: ToolUsage[];
  errors: string[];
  pricing: {
    updatedAt: string;
    count: number;
  };
  claudeSessionTotal: number;
  codexQuota: {
    primary: number | null;
    weekly: number | null;
  };
}

export const emptyMetrics = (): TokenMetrics => ({
  tokens: 0,
  input: 0,
  output: 0,
  cache: 0,
  reason: 0,
  cost: 0,
  sessions: 0,
  hit: 0,
});

export function buildTokenDashboard(
  raw: unknown,
  fetchedAt = Date.now()
): TokenDashboard {
  const source = asRecord(raw);
  const tools = TOOL_ORDER.map((tool) => buildToolUsage(tool, source));
  const activeTools = tools
    .filter((tool) => hasActivity(tool.total))
    .sort(
      (a, b) =>
        b.ranges.week.tokens - a.ranges.week.tokens ||
        b.ranges.today.tokens - a.ranges.today.tokens ||
        b.total.tokens - a.total.tokens
    );

  return {
    fetchedAt,
    ranges: Object.fromEntries(
      RANGE_KEYS.map((range) => [
        range,
        combineMetrics(activeTools.map((tool) => tool.ranges[range])),
      ])
    ) as Record<RangeKey, TokenMetrics>,
    daily: dailyTokenUsage(source),
    tools: activeTools,
    errors: Object.entries(asRecord(source._errors)).map(
      ([tool, error]) => `${TOOL_NAMES[tool] ?? tool}: ${String(error)}`
    ),
    pricing: {
      updatedAt: stringValue(asRecord(source._pricing).updated_at),
      count: numberValue(asRecord(source._pricing).count),
    },
    claudeSessionTotal: numberValue(asRecord(source.claude).session_total),
    codexQuota: {
      primary: nullableNumber(asRecord(source.codex).p5),
      weekly: nullableNumber(asRecord(source.codex).pw),
    },
  };
}

function dailyTokenUsage(source: Record<string, unknown>): DailyTokenUsage[] {
  const daily = asRecord(source._daily).daily;
  if (!Array.isArray(daily)) return [];

  return daily
    .map((item) => {
      const row = asRecord(item);
      const date = stringValue(row.date);
      if (!date) return null;

      return {
        date,
        tokens: numberValue(row.tokens),
        cost: numberValue(row.total),
      };
    })
    .filter((item): item is DailyTokenUsage => Boolean(item))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${trimFixed(value / 1_000_000_000, 2)}B`;
  if (value >= 1_000_000) return `${trimFixed(value / 1_000_000, 2)}M`;
  if (value >= 1_000) return `${trimFixed(value / 1_000, 1)}K`;
  return Math.round(value).toLocaleString("zh-CN");
}

export function formatMoney(value: number): string {
  if (value <= 0) return "$0.00";
  if (value >= 1000) return `$${trimFixed(value, 0)}`;
  return `$${trimFixed(value, 2)}`;
}

function buildToolUsage(tool: string, source: Record<string, unknown>): ToolUsage {
  const ranges = Object.fromEntries(
    RANGE_KEYS.map((range) => [range, buildRangeMetrics(tool, range, source)])
  ) as Record<RangeKey, TokenMetrics>;

  return {
    id: tool,
    name: TOOL_NAMES[tool] ?? tool,
    ranges,
    total: combineMetrics(Object.values(ranges)),
  };
}

function buildRangeMetrics(
  tool: string,
  range: RangeKey,
  source: Record<string, unknown>
): TokenMetrics {
  const data = asRecord(asRecord(asRecord(source[tool]).ranges)[range]);
  const input = numberValue(data.in);
  const output = numberValue(data.out);
  const cached = numberValue(data.cached);
  const cache = cached || numberValue(data.cr) + numberValue(data.cw);
  const reason = numberValue(data.reason) + numberValue(data.thoughts);

  return {
    tokens: rangeTokenTotal(tool, data),
    input,
    output,
    cache,
    reason,
    cost: numberValue(data.cost),
    sessions:
      numberValue(data.sessions) ||
      numberValue(data.calls) ||
      numberValue(data.tasks),
    hit: numberValue(data.hit),
  };
}

function rangeTokenTotal(tool: string, data: Record<string, unknown>): number {
  if (tool === "grok") return numberValue(data.tokens);
  if (tool === "codex") {
    return numberValue(data.in) + numberValue(data.cached) + numberValue(data.out);
  }
  if (tool === "gemini") {
    return (
      numberValue(data.in) +
      numberValue(data.cached) +
      numberValue(data.out) +
      numberValue(data.thoughts)
    );
  }
  if (tool === "qoder") return numberValue(data.in) + numberValue(data.out);

  return (
    numberValue(data.in) +
    numberValue(data.out) +
    numberValue(data.cr) +
    numberValue(data.cw) +
    numberValue(data.reason)
  );
}

function combineMetrics(items: TokenMetrics[]): TokenMetrics {
  const total = items.reduce<TokenMetrics>(
    (acc, item) => ({
      tokens: acc.tokens + item.tokens,
      input: acc.input + item.input,
      output: acc.output + item.output,
      cache: acc.cache + item.cache,
      reason: acc.reason + item.reason,
      cost: acc.cost + item.cost,
      sessions: acc.sessions + item.sessions,
      hit: acc.hit,
    }),
    emptyMetrics()
  );
  const weighted = items.reduce(
    (sum, item) => sum + (item.tokens > 0 ? item.hit * item.tokens : 0),
    0
  );
  total.hit = total.tokens > 0 ? weighted / total.tokens : 0;
  return total;
}

function hasActivity(item: TokenMetrics): boolean {
  return item.tokens > 0 || item.cost > 0 || item.sessions > 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function numberValue(value: unknown): number {
  const next = Number(value ?? 0);
  return Number.isFinite(next) ? next : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function trimFixed(value: number, digits: number): string {
  return value.toFixed(digits).replace(/\.0+$|(\.\d*[1-9])0+$/, "$1");
}
