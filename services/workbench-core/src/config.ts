import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export interface WorkbenchConfig {
  host: string;
  port: number;
  databaseUrl: string;
  databasePath: string;
  activityWatchUrl: string;
  musicServiceUrl?: string;
  tokeiRepo: string;
  tokeiPython?: string;
  githubUsername: string;
  githubTimeoutMs: number;
  tokeiTimeoutMs: number;
}

export function loadConfig(overrides: Partial<WorkbenchConfig> = {}): WorkbenchConfig {
  const databaseUrl = overrides.databaseUrl ?? process.env.DATABASE_URL ?? "file:./data/workbench.sqlite";
  const databasePath = overrides.databasePath ?? resolveDatabasePath(databaseUrl);
  mkdirSync(dirname(databasePath), { recursive: true });

  return {
    host: overrides.host ?? process.env.HOST ?? "127.0.0.1",
    port: overrides.port ?? Number(process.env.PORT ?? 3900),
    databaseUrl,
    databasePath,
    activityWatchUrl: overrides.activityWatchUrl ?? process.env.ACTIVITYWATCH_URL ?? "http://127.0.0.1:5600",
    musicServiceUrl: overrides.musicServiceUrl ?? process.env.MUSIC_SERVICE_URL,
    tokeiRepo: overrides.tokeiRepo ?? process.env.TOKEI_REPO ?? "F:\\tokei",
    tokeiPython: overrides.tokeiPython ?? process.env.TOKEI_PYTHON,
    githubUsername: overrides.githubUsername ?? process.env.GITHUB_USERNAME ?? "proffitteoy",
    githubTimeoutMs: overrides.githubTimeoutMs ?? Number(process.env.GITHUB_TIMEOUT_MS ?? 20_000),
    tokeiTimeoutMs: overrides.tokeiTimeoutMs ?? Number(process.env.TOKEI_TIMEOUT_MS ?? 45_000)
  };
}

function resolveDatabasePath(databaseUrl: string): string {
  const rawPath = databaseUrl.startsWith("file:") ? databaseUrl.slice("file:".length) : databaseUrl;
  return resolve(rawPath);
}
