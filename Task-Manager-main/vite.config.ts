import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const TOKEI_REPO = process.env.TOKEI_REPO || "F:\\tokei";
const TOKEI_PYTHON = process.env.TOKEI_PYTHON;
const TOKEI_TIMEOUT_MS = 45_000;
const TOKEI_MAX_BUFFER = 24 * 1024 * 1024;
const ACTIVITY_DAYS = 365;
const GITHUB_CACHE_MS = 5 * 60_000;
const GITHUB_USERNAME = process.env.GITHUB_USERNAME || "proffitteoy";
const GITHUB_TIMEOUT_MS = 20_000;

let githubCache: { at: number; payload: GitHubCommitPayload } | null = null;

export default defineConfig({
  plugins: [react(), tailwindcss(), localActivityPlugin()],
});

function localActivityPlugin(): Plugin {
  return {
    name: "time-manager-local-activity",
    configureServer(server) {
      mountLocalActivityMiddleware(server);
    },
    configurePreviewServer(server) {
      mountLocalActivityMiddleware(server);
    },
  };
}

function mountLocalActivityMiddleware(server: any) {
  server.middlewares.use("/api/tokei/usage", (request: unknown, response: any) => {
    const method = (request as { method?: string }).method;
    if (method && method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    runTokeiCollectorBundle()
      .then((payload) => sendJson(response, 200, payload))
      .catch((error: unknown) =>
        sendJson(response, 500, {
          error: "Tokei collector failed",
          detail: errorMessage(error),
        })
      );
  });

  server.middlewares.use("/api/github/commits", (request: unknown, response: any) => {
    const method = (request as { method?: string }).method;
    if (method && method !== "GET") {
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }

    runGitHubCommitCollector(hasFreshQuery(request))
      .then((payload) => sendJson(response, 200, payload))
      .catch((error: unknown) =>
        sendJson(response, 500, {
          error: "GitHub commit collector failed",
          detail: errorMessage(error),
        })
      );
  });
}

function hasFreshQuery(request: unknown): boolean {
  const url = (request as { url?: string }).url ?? "";
  try {
    return new URL(url, "http://localhost").searchParams.has("fresh");
  } catch {
    return false;
  }
}

async function runTokeiCollectorBundle(): Promise<Record<string, unknown>> {
  const usage = await runTokeiCollector(["--json"]);
  const daily = await runTokeiCollector(["--daily-costs", "--period", "365d"]);

  return {
    ...JSON.parse(usage),
    _daily: JSON.parse(daily),
  };
}

async function runTokeiCollector(args: string[]): Promise<string> {
  const collector = join(TOKEI_REPO, "usage.30s.py");
  if (!existsSync(collector)) {
    throw new Error(`未找到 Tokei collector: ${collector}`);
  }

  const attempts = pythonAttempts(collector, args);
  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      const output = await execText(attempt.command, attempt.args, {
        cwd: TOKEI_REPO,
        maxBuffer: TOKEI_MAX_BUFFER,
        timeout: TOKEI_TIMEOUT_MS,
      });
      JSON.parse(output);
      return output;
    } catch (error) {
      errors.push(`${attempt.command}: ${errorMessage(error)}`);
    }
  }

  throw new Error(errors.join(" | "));
}

function pythonAttempts(
  collector: string,
  args: string[]
): { command: string; args: string[] }[] {
  if (TOKEI_PYTHON) {
    return [{ command: TOKEI_PYTHON, args: [collector, ...args] }];
  }

  if (process.platform === "win32") {
    return [
      { command: "py.exe", args: ["-3", collector, ...args] },
      { command: "python.exe", args: [collector, ...args] },
      { command: "python", args: [collector, ...args] },
    ];
  }

  return [
    { command: "python3", args: [collector, ...args] },
    { command: "python", args: [collector, ...args] },
  ];
}

async function runGitHubCommitCollector(forceFresh = false): Promise<GitHubCommitPayload> {
  const now = Date.now();
  if (!forceFresh && githubCache && now - githubCache.at < GITHUB_CACHE_MS) {
    return githubCache.payload;
  }

  const since = new Date(now - (ACTIVITY_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const errors: string[] = [];
  let days: { date: string; count: number; repos: number }[] = [];
  let source = "github.com";

  try {
    days = await fetchGitHubContributionCalendar(GITHUB_USERNAME);
  } catch (error) {
    errors.push(`github.com: ${errorMessage(error)}`);
    try {
      days = await fetchContributionApiFallback(GITHUB_USERNAME);
      source = "github-contributions-api";
    } catch (fallbackError) {
      errors.push(`github-contributions-api: ${errorMessage(fallbackError)}`);
    }
  }

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const peak = days.reduce(
    (best, day) => (day.count > best.count ? { date: day.date, count: day.count } : best),
    { date: "", count: 0 }
  );

  const payload = {
    fetchedAt: now,
    since,
    username: GITHUB_USERNAME,
    source,
    roots: [`https://github.com/${GITHUB_USERNAME}`],
    repos: [],
    days,
    total,
    activeDays: days.filter((day) => day.count > 0).length,
    peak,
    currentStreak: streak(days, true),
    longestStreak: streak(days, false),
    errors,
  };

  githubCache = { at: now, payload };
  return payload;
}

async function fetchGitHubContributionCalendar(
  username: string
): Promise<{ date: string; count: number; repos: number }[]> {
  const url = `https://github.com/users/${encodeURIComponent(
    username
  )}/contributions`;
  const html = await fetchText(url);
  const days: { date: string; count: number; repos: number }[] = [];
  const pattern =
    /<td\b(?=[^>]*\bdata-date="(\d{4}-\d{2}-\d{2})")(?=[^>]*\bclass="[^"]*ContributionCalendar-day)[^>]*><\/td>\s*<tool-tip\b[^>]*>(.*?)<\/tool-tip>/gms;

  for (const match of html.matchAll(pattern)) {
    const date = match[1];
    const label = stripTags(match[2]);
    const countMatch = label.match(/(\d+)\s+contribution/i);
    days.push({
      date,
      count: countMatch ? Number(countMatch[1]) : 0,
      repos: 0,
    });
  }

  if (days.length === 0) {
    throw new Error("GitHub contribution calendar did not contain day cells");
  }

  return days.sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchContributionApiFallback(
  username: string
): Promise<{ date: string; count: number; repos: number }[]> {
  const url = `https://github-contributions-api.jogruber.de/v4/${encodeURIComponent(
    username
  )}?y=last`;
  const payload = JSON.parse(await fetchText(url)) as {
    contributions?: { date?: string; count?: number }[];
  };

  if (!Array.isArray(payload.contributions)) {
    throw new Error("fallback response did not include contributions");
  }

  return payload.contributions
    .map((day) => ({
      date: String(day.date ?? ""),
      count: Number(day.count ?? 0),
      repos: 0,
    }))
    .filter((day) => day.date)
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_TIMEOUT_MS);

  try {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": "time-manager-local-activity",
          Accept: "text/html,application/json",
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      if (process.platform !== "win32") throw error;
      return await fetchTextWithPowerShell(url);
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchTextWithPowerShell(url: string): Promise<string> {
  const escapedUrl = url.replace(/'/g, "''");
  const timeoutSeconds = Math.ceil(GITHUB_TIMEOUT_MS / 1000);
  const command = [
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()",
    "$headers = @{ 'User-Agent' = 'time-manager-local-activity'; 'Accept' = 'text/html,application/json' }",
    `(Invoke-WebRequest -Uri '${escapedUrl}' -UseBasicParsing -TimeoutSec ${timeoutSeconds} -Headers $headers).Content`,
  ].join("; ");

  return execText(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    {
      maxBuffer: 8 * 1024 * 1024,
      timeout: GITHUB_TIMEOUT_MS + 5_000,
    }
  );
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

function streak(days: { date: string; count: number }[], current: boolean): number {
  const active = new Set(days.filter((day) => day.count > 0).map((day) => day.date));
  if (active.size === 0) return 0;

  if (!current) {
    let best = 0;
    let run = 0;
    for (let offset = ACTIVITY_DAYS - 1; offset >= 0; offset -= 1) {
      const day = dateOffset(-offset);
      if (active.has(day)) {
        run += 1;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }
    return best;
  }

  let run = 0;
  for (let offset = 0; offset < ACTIVITY_DAYS; offset += 1) {
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

function execText(
  command: string,
  args: string[],
  options: { cwd?: string; maxBuffer?: number; timeout?: number }
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      args,
      {
        cwd: options.cwd,
        maxBuffer: options.maxBuffer,
        timeout: options.timeout,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const detail = stderr.trim() || error.message;
          reject(new Error(detail));
          return;
        }
        resolve(stdout.trim());
      }
    );
  });
}

function sendJson(
  response: {
    statusCode: number;
    setHeader: (name: string, value: string) => void;
    end: (body?: string) => void;
  },
  statusCode: number,
  body: string | object
) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(typeof body === "string" ? body : JSON.stringify(body));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface GitHubCommitPayload {
  fetchedAt: number;
  since: string;
  username: string;
  source: string;
  roots: string[];
  repos: never[];
  days: { date: string; count: number; repos: number }[];
  total: number;
  activeDays: number;
  peak: { date: string; count: number };
  currentStreak: number;
  longestStreak: number;
  errors: string[];
}
