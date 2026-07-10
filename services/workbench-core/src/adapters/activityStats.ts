import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type { WorkbenchConfig } from "../config.js";
import { buildTokenDashboard } from "./tokenDashboard.js";

export class ActivityStatsAdapter {
  private githubCache: { at: number; username: string; payload: Record<string, unknown> } | undefined;
  private tokeiCache: { at: number; tokeiRepo: string; payload: Record<string, unknown> } | undefined;

  constructor(private readonly config: WorkbenchConfig) {}

  async tokeiUsage(forceFresh = false, settings: { tokeiRepo?: string; tokeiPython?: string } = {}): Promise<Record<string, unknown>> {
    const now = Date.now();
    const requestedRepo = settings.tokeiRepo || this.config.tokeiRepo;
    const source = resolveTokeiSource(requestedRepo);
    const cacheKey = `${requestedRepo}::${source?.repo ?? "missing"}`;
    if (!forceFresh && this.tokeiCache?.tokeiRepo === cacheKey && now - this.tokeiCache.at < 5 * 60_000) {
      return this.tokeiCache.payload;
    }

    if (!source) {
      const collector = join(requestedRepo, "usage.30s.py");
      const payload = {
        connected: false,
        source: "Task-Manager-main / Tokei collector",
        roots: [requestedRepo],
        requestedRoots: [requestedRepo],
        collector,
        error: `未找到 Tokei collector: ${collector}`,
        usage: null,
        daily: null
      };
      this.tokeiCache = { at: now, tokeiRepo: cacheKey, payload };
      return payload;
    }

    try {
      const [usage, daily] = await Promise.all([
        this.runCollector(source.collector, ["--json"], source.repo, settings.tokeiPython),
        this.runCollector(source.collector, ["--daily-costs", "--period", "365d"], source.repo, settings.tokeiPython)
      ]);
      const raw = {
        ...JSON.parse(usage),
        _daily: JSON.parse(daily)
      };
      const payload = {
        connected: true,
        fetchedAt: now,
        source: "Task-Manager-main / Tokei collector",
        roots: [source.repo],
        requestedRoots: [requestedRepo],
        collector: source.collector,
        fallback: source.repo !== requestedRepo,
        usage: raw,
        raw,
        dashboard: buildTokenDashboard(raw, now)
      };
      this.tokeiCache = { at: now, tokeiRepo: cacheKey, payload };
      return payload;
    } catch (error) {
      const payload = {
        connected: false,
        source: "Task-Manager-main / Tokei collector",
        roots: [source.repo],
        requestedRoots: [requestedRepo],
        collector: source.collector,
        fallback: source.repo !== requestedRepo,
        error: errorMessage(error),
        usage: null,
        daily: null
      };
      this.tokeiCache = { at: now, tokeiRepo: cacheKey, payload };
      return payload;
    }
  }

  async githubContributions(forceFresh = false, username = this.config.githubUsername): Promise<Record<string, unknown>> {
    const now = Date.now();
    if (!forceFresh && this.githubCache?.username === username && now - this.githubCache.at < 5 * 60_000) {
      return this.githubCache.payload;
    }

    const errors: string[] = [];
    let days: Array<{ date: string; count: number; repos: number }> = [];
    let source = "github.com";
    try {
      days = await this.fetchGitHubCalendar(username);
    } catch (error) {
      errors.push(`github.com: ${errorMessage(error)}`);
      try {
        days = await this.fetchGitHubFallback(username);
        source = "github-contributions-api";
      } catch (fallbackError) {
        errors.push(`github-contributions-api: ${errorMessage(fallbackError)}`);
      }
    }

    const payload = {
      connected: days.length > 0,
      fetchedAt: now,
      since: new Date(now - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      username,
      source,
      roots: [`https://github.com/${username}`],
      repos: [],
      days,
      total: days.reduce((sum, day) => sum + day.count, 0),
      activeDays: days.filter((day) => day.count > 0).length,
      peak: days.reduce((best, day) => (day.count > best.count ? { date: day.date, count: day.count } : best), {
        date: "",
        count: 0
      }),
      currentStreak: streak(days, true),
      longestStreak: streak(days, false),
      errors
    };
    this.githubCache = { at: now, username, payload };
    return payload;
  }

  private async runCollector(collector: string, args: string[], tokeiRepo: string, tokeiPython?: string): Promise<string> {
    const candidates = tokeiPython
      ? [{ command: tokeiPython, args: [collector, ...args] }]
      : [
          { command: "py.exe", args: ["-3", collector, ...args] },
          { command: "python.exe", args: [collector, ...args] },
          { command: "python", args: [collector, ...args] }
        ];

    let lastError: unknown;
    for (const candidate of candidates) {
      try {
        return await execFileText(candidate.command, candidate.args, tokeiRepo, this.config.tokeiTimeoutMs);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async fetchGitHubCalendar(username: string): Promise<Array<{ date: string; count: number; repos: number }>> {
    const url = `https://github.com/users/${encodeURIComponent(username)}/contributions`;
    const html = await fetchText(url, this.config.githubTimeoutMs);
    const days: Array<{ date: string; count: number; repos: number }> = [];

    const tooltipPattern =
      /<td\b(?=[^>]*\bdata-date="(?<date>\d{4}-\d{2}-\d{2})")(?=[^>]*\bclass="[^"]*ContributionCalendar-day)[^>]*><\/td>\s*<tool-tip\b[^>]*>(?<label>.*?)<\/tool-tip>/gms;
    for (const match of html.matchAll(tooltipPattern)) {
      const date = match.groups?.date;
      const label = stripTags(match.groups?.label ?? "");
      const countMatch = label.match(/(\d+)\s+contribution/i);
      if (date) days.push({ date, count: countMatch ? Number(countMatch[1]) : 0, repos: 0 });
    }

    if (days.length === 0) {
      const dataPattern =
        /data-date="(?<date>\d{4}-\d{2}-\d{2})"[^>]*data-level="(?<level>\d+)"[^>]*(?:data-count="(?<count>\d+)")?/g;
      for (const match of html.matchAll(dataPattern)) {
        const date = match.groups?.date;
        if (date) {
          days.push({ date, count: Number(match.groups?.count ?? match.groups?.level ?? 0), repos: 0 });
        }
      }
    }

    if (days.length === 0) {
      throw new Error("GitHub contribution calendar did not contain day cells");
    }
    return days.sort((a, b) => a.date.localeCompare(b.date));
  }

  private async fetchGitHubFallback(username: string): Promise<Array<{ date: string; count: number; repos: number }>> {
    const url = `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(username)}?y=last`;
    const payload = (await fetchJson(url, this.config.githubTimeoutMs)) as {
      contributions?: Array<{ date?: string; count?: number }>;
    };
    if (!Array.isArray(payload.contributions)) {
      throw new Error("fallback response did not include contributions");
    }
    return payload.contributions
      .filter((day) => day.date)
      .map((day) => ({ date: String(day.date), count: Number(day.count ?? 0), repos: 0 }));
  }
}

function resolveTokeiSource(requestedRepo: string): { repo: string; collector: string } | undefined {
  const requestedCollector = join(requestedRepo, "usage.30s.py");
  if (existsSync(requestedCollector)) {
    return { repo: requestedRepo, collector: requestedCollector };
  }
  if (!requestedRepo.endsWith("Task-Manager-main")) {
    return undefined;
  }
  const fallbackRepo = "F:\\tokei";
  const fallbackCollector = join(fallbackRepo, "usage.30s.py");
  if (existsSync(fallbackCollector)) {
    return { repo: fallbackRepo, collector: fallbackCollector };
  }
  return undefined;
}

async function execFileText(command: string, args: string[], cwd: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout, maxBuffer: 24 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

async function fetchJson(url: string, timeout: number): Promise<unknown> {
  return JSON.parse(await fetchText(url, timeout)) as unknown;
}

async function fetchText(url: string, timeout: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "cognitive-homepage-workbench-core",
        Accept: "text/html,application/json"
      }
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .trim();
}

function streak(days: Array<{ date: string; count: number }>, current: boolean): number {
  const active = new Set(days.filter((day) => day.count > 0).map((day) => day.date));
  if (active.size === 0) return 0;

  if (!current) {
    let best = 0;
    let run = 0;
    for (const day of days) {
      if (active.has(day.date)) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    return best;
  }

  let run = 0;
  for (let offset = 0; offset < 365; offset += 1) {
    if (!active.has(dateOffset(-offset))) break;
    run += 1;
  }
  return run;
}

function dateOffset(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}
