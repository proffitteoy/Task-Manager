import type { WorkbenchConfig } from "../config.js";

interface ActivityWatchEvent {
  timestamp?: string;
  duration?: number;
  data?: Record<string, unknown>;
}

export class ActivityWatchAdapter {
  constructor(private readonly config: WorkbenchConfig) {}

  async current(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    try {
      const buckets = await this.fetchBuckets(baseUrl);
      const windowBucket = findBucket(buckets, "aw-watcher-window");
      const afkBucket = findBucket(buckets, "aw-watcher-afk");
      const [windowEvent, afkEvent] = await Promise.all([
        windowBucket ? this.fetchLastEvent(baseUrl, windowBucket) : undefined,
        afkBucket ? this.fetchLastEvent(baseUrl, afkBucket) : undefined
      ]);

      return {
        connected: true,
        baseUrl,
        window: windowEvent?.data ?? null,
        afk: afkEvent?.data ?? null,
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        baseUrl,
        error: errorMessage(error),
        fetchedAt: new Date().toISOString()
      };
    }
  }

  async today(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    try {
      const buckets = await this.fetchBuckets(baseUrl);
      const windowBucket = findBucket(buckets, "aw-watcher-window");
      const afkBucket = findBucket(buckets, "aw-watcher-afk");
      const [windowEvents, afkEvents] = await Promise.all([
        windowBucket ? this.fetchEventsForToday(baseUrl, windowBucket) : [],
        afkBucket ? this.fetchEventsForToday(baseUrl, afkBucket) : []
      ]);
      return {
        connected: true,
        date: new Date().toISOString().slice(0, 10),
        events: [...windowEvents, ...afkEvents].sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? ""))),
        buckets: {
          window: windowBucket,
          afk: afkBucket
        },
        fetchedAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        connected: false,
        date: new Date().toISOString().slice(0, 10),
        events: [],
        error: errorMessage(error),
        fetchedAt: new Date().toISOString()
      };
    }
  }

  async summary(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    const [current, today] = await Promise.all([this.current(baseUrl), this.today(baseUrl)]);
    const events = Array.isArray(today.events) ? (today.events as ActivityWatchEvent[]) : [];
    const appMinutes = new Map<string, number>();
    let afkMinutes = 0;

    for (const event of events) {
      const durationMinutes = Math.max(0, Number(event.duration ?? 0) / 60);
      const data = event.data ?? {};
      const app = typeof data.app === "string" && data.app ? data.app : undefined;
      const status = typeof data.status === "string" ? data.status : undefined;
      if (app) appMinutes.set(app, (appMinutes.get(app) ?? 0) + durationMinutes);
      if (status === "afk") afkMinutes += durationMinutes;
    }

    return {
      connected: current.connected === true && today.connected === true,
      topApps: [...appMinutes.entries()]
        .map(([name, minutes]) => ({ name, minutes: Math.round(minutes) }))
        .sort((a, b) => b.minutes - a.minutes)
        .slice(0, 8),
      afkMinutes: Math.round(afkMinutes),
      current,
      error: current.connected === false ? current.error : today.connected === false ? today.error : undefined
    };
  }

  private async fetchBuckets(baseUrl: string): Promise<Record<string, unknown>> {
    const response = await timedFetch(`${baseUrl}/api/0/buckets`);
    if (!response.ok) {
      throw new Error(`ActivityWatch returned ${response.status}`);
    }
    return (await response.json()) as Record<string, unknown>;
  }

  private async fetchLastEvent(baseUrl: string, bucketId: string): Promise<ActivityWatchEvent | undefined> {
    const end = new Date();
    const start = new Date(end.getTime() - 15 * 60 * 1000);
    const recent = await this.fetchEvents(baseUrl, bucketId, start.toISOString(), end.toISOString(), 50);
    if (recent.length > 0) {
      return recent.at(-1);
    }

    const today = await this.fetchEventsForToday(baseUrl, bucketId);
    return today.at(-1);
  }

  private async fetchEventsForToday(baseUrl: string, bucketId: string): Promise<ActivityWatchEvent[]> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return this.fetchEvents(baseUrl, bucketId, start.toISOString(), end.toISOString(), 500);
  }

  private async fetchEvents(baseUrl: string, bucketId: string, start: string, end: string, limit: number): Promise<ActivityWatchEvent[]> {
    const url = new URL(`${baseUrl}/api/0/buckets/${encodeURIComponent(bucketId)}/events`);
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    url.searchParams.set("limit", String(limit));
    const response = await timedFetch(url.toString());
    if (!response.ok) {
      throw new Error(`ActivityWatch events returned ${response.status}`);
    }
    return (await response.json()) as ActivityWatchEvent[];
  }
}

function findBucket(buckets: Record<string, unknown>, prefix: string): string | undefined {
  return Object.keys(buckets).find((bucketId) => bucketId.startsWith(prefix));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function timedFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
