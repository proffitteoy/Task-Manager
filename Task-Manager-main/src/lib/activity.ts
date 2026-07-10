export type ActivityMode = "daily" | "weekly" | "cumulative";

export interface ActivityDatum {
  date: string;
  value: number;
}

export interface ActivityStats {
  total: number;
  peak: ActivityDatum;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
}

export interface HeatmapCell {
  date: string;
  value: number;
  raw: number;
  week: number;
  weekday: number;
}

export interface HeatmapMonth {
  label: string;
  week: number;
}

export interface HeatmapResult {
  cells: HeatmapCell[];
  months: HeatmapMonth[];
  max: number;
}

const DAY_MS = 86_400_000;
const MONTH_LABEL = [
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];

export function buildActivityStats(
  days: ActivityDatum[],
  today = new Date()
): ActivityStats {
  const sorted = normalizeDays(days);
  const active = new Set(sorted.filter((day) => day.value > 0).map((day) => day.date));

  return {
    total: sorted.reduce((sum, day) => sum + day.value, 0),
    peak: sorted.reduce(
      (best, day) => (day.value > best.value ? day : best),
      { date: "", value: 0 }
    ),
    activeDays: active.size,
    currentStreak: currentStreak(active, today),
    longestStreak: longestStreak(active, today),
  };
}

export function buildHeatmap(
  days: ActivityDatum[],
  mode: ActivityMode,
  today = new Date()
): HeatmapResult {
  const end = startOfDay(today);
  const start = addDays(end, -364);

  return buildHeatmapRange(days, mode, start, end);
}

export function buildYearHeatmap(
  days: ActivityDatum[],
  mode: ActivityMode,
  year: number,
  today = new Date()
): HeatmapResult {
  const endOfYear = new Date(year, 11, 31);
  const currentYear = today.getFullYear();
  const end = year === currentYear ? startOfDay(today) : endOfYear;
  return buildHeatmapRange(days, mode, new Date(year, 0, 1), end);
}

function buildHeatmapRange(
  days: ActivityDatum[],
  mode: ActivityMode,
  startDate: Date,
  endDate: Date
): HeatmapResult {
  const start = startOfDay(startDate);
  const end = startOfDay(endDate);
  const alignedStart = addDays(start, -start.getDay());
  const values = new Map(normalizeDays(days).map((day) => [day.date, day.value]));
  const weekTotals = new Map<string, number>();
  let cumulative = 0;
  let max = 0;
  const cumulativeByDate = new Map<string, number>();

  for (let cursor = new Date(alignedStart); cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    const inRange = cursor >= start && cursor <= end;
    const raw = inRange ? values.get(key) ?? 0 : 0;
    if (inRange) cumulative += raw;
    cumulativeByDate.set(key, cumulative);

    const week = weekKey(cursor);
    weekTotals.set(week, (weekTotals.get(week) ?? 0) + raw);
  }

  const cells: HeatmapCell[] = [];
  let weekIndex = 0;
  let lastWeek = "";
  for (let cursor = new Date(alignedStart); cursor <= end; cursor = addDays(cursor, 1)) {
    const key = dateKey(cursor);
    const week = weekKey(cursor);
    if (lastWeek && week !== lastWeek) weekIndex += 1;
    lastWeek = week;

    const inRange = cursor >= start && cursor <= end;
    const raw = inRange ? values.get(key) ?? 0 : 0;
    const value =
      mode === "weekly"
        ? weekTotals.get(week) ?? 0
        : mode === "cumulative"
          ? cumulativeByDate.get(key) ?? 0
          : raw;
    max = Math.max(max, value);
    cells.push({
      date: key,
      value,
      raw,
      week: weekIndex,
      weekday: cursor.getDay(),
    });
  }

  return {
    cells,
    months: buildMonthLabels(cells, start),
    max,
  };
}

export function normalizeDays(days: ActivityDatum[]): ActivityDatum[] {
  const merged = new Map<string, number>();
  for (const day of days) {
    if (!day.date || !Number.isFinite(day.value)) continue;
    merged.set(day.date, (merged.get(day.date) ?? 0) + Math.max(0, day.value));
  }
  return [...merged.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function modeLabel(mode: ActivityMode): string {
  if (mode === "weekly") return "每周";
  if (mode === "cumulative") return "累计";
  return "每日";
}

function buildMonthLabels(cells: HeatmapCell[], start: Date): HeatmapMonth[] {
  const labels: HeatmapMonth[] = [];
  const seen = new Set<string>();

  for (const cell of cells) {
    const date = parseDateKey(cell.date);
    if (date < start) continue;
    if (date.getDate() > 7) continue;
    const month = `${date.getFullYear()}-${date.getMonth()}`;
    if (seen.has(month)) continue;
    seen.add(month);
    labels.push({
      label: MONTH_LABEL[date.getMonth()],
      week: cell.week,
    });
  }

  return labels;
}

function currentStreak(active: Set<string>, today: Date): number {
  const currentDay = startOfDay(today);
  const start = active.has(dateKey(currentDay))
    ? currentDay
    : addDays(currentDay, -1);
  let run = 0;
  for (let cursor = start; active.has(dateKey(cursor)); cursor = addDays(cursor, -1)) {
    run += 1;
  }
  return run;
}

function longestStreak(active: Set<string>, today: Date): number {
  let best = 0;
  let run = 0;
  const end = startOfDay(today);
  const start = addDays(end, -364);

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    if (active.has(dateKey(cursor))) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }

  return best;
}

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekKey(date: Date): string {
  const start = addDays(date, -date.getDay());
  return dateKey(start);
}

function parseDateKey(key: string): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
