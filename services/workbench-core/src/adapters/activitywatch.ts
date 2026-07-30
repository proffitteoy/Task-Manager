import type { WorkbenchConfig } from "../config.js";

interface ActivityWatchEvent {
  timestamp?: string;
  duration?: number;
  data?: Record<string, unknown>;
}

export class ActivityWatchAdapter {
  private readonly cache = new Map<
    string,
    { expiresAt: number; pending?: Promise<Record<string, unknown>>; value?: Record<string, unknown> }
  >();

  constructor(private readonly config: WorkbenchConfig) {}

  async current(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    return this.cached(`current:${baseUrl}`, 5_000, () => this.loadCurrent(baseUrl));
  }

  async today(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    return this.cached(`today:${baseUrl}`, 30_000, () => this.loadToday(baseUrl));
  }

  async summary(baseUrl = this.config.activityWatchUrl): Promise<Record<string, unknown>> {
    return this.cached(`summary:${baseUrl}`, 30_000, async () => {
      try {
        const buckets = await this.fetchBuckets(baseUrl);
        const [current, today] = await Promise.all([
          this.loadCurrent(baseUrl, buckets),
          this.loadToday(baseUrl, buckets)
        ]);
        return this.buildSummary(current, today);
      } catch (error) {
        return {
          connected: false,
          date: new Date().toISOString().slice(0, 10),
          trackedMinutes: 0,
          topApps: [],
          topWindows: [],
          topDomains: [],
          hourlyActivity: Array.from({ length: 24 }, (_, hour) => ({ hour, minutes: 0 })),
          timeline: [],
          afkMinutes: 0,
          current: {
            connected: false,
            baseUrl,
            error: errorMessage(error),
            fetchedAt: new Date().toISOString()
          },
          error: errorMessage(error)
        };
      }
    });
  }

  resetCache(): void {
    this.cache.clear();
  }

  private async loadCurrent(
    baseUrl: string,
    prefetchedBuckets?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      const buckets = prefetchedBuckets ?? await this.fetchBuckets(baseUrl);
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

  private async loadToday(
    baseUrl: string,
    prefetchedBuckets?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    try {
      const buckets = prefetchedBuckets ?? await this.fetchBuckets(baseUrl);
      const windowBucket = findBucket(buckets, "aw-watcher-window");
      const afkBucket = findBucket(buckets, "aw-watcher-afk");
      const webBuckets = findBuckets(buckets, "aw-watcher-web");
      const [windowEvents, afkEvents, webEventGroups] = await Promise.all([
        windowBucket ? this.fetchEventsForToday(baseUrl, windowBucket) : [],
        afkBucket ? this.fetchEventsForToday(baseUrl, afkBucket) : [],
        Promise.all(webBuckets.map((bucketId) => this.fetchEventsForToday(baseUrl, bucketId)))
      ]);
      const webEvents = webEventGroups.flat();
      return {
        connected: true,
        date: new Date().toISOString().slice(0, 10),
        events: [...windowEvents, ...afkEvents].sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? ""))),
        streams: {
          window: windowEvents,
          afk: afkEvents,
          web: webEvents
        },
        buckets: {
          window: windowBucket,
          afk: afkBucket,
          web: webBuckets
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

  private buildSummary(
    current: Record<string, unknown>,
    today: Record<string, unknown>
  ): Record<string, unknown> {
    const streams = isObject(today.streams) ? today.streams : {};
    const windowEvents = eventList(streams.window);
    const afkEvents = eventList(streams.afk);
    const webEvents = eventList(streams.web);
    const events = windowEvents.length > 0 || afkEvents.length > 0
      ? [...windowEvents, ...afkEvents]
      : eventList(today.events);
    const appMinutes = new Map<string, number>();
    const windowMinutes = new Map<string, number>();
    const domainMinutes = new Map<string, number>();
    const hourlyMinutes = Array.from({ length: 24 }, () => 0);
    let afkMinutes = 0;
    let trackedMinutes = 0;

    for (const event of windowEvents.length > 0 ? windowEvents : events) {
      const durationMinutes = Math.max(0, Number(event.duration ?? 0) / 60);
      const data = event.data ?? {};
      const app = typeof data.app === "string" && data.app ? data.app : undefined;
      const title = typeof data.title === "string" && data.title ? data.title : undefined;
      if (app) appMinutes.set(app, (appMinutes.get(app) ?? 0) + durationMinutes);
      if (title) windowMinutes.set(title, (windowMinutes.get(title) ?? 0) + durationMinutes);
      trackedMinutes += durationMinutes;
      addToHourlyBuckets(hourlyMinutes, event.timestamp, Number(event.duration ?? 0));
    }

    for (const event of afkEvents.length > 0 ? afkEvents : events) {
      const durationMinutes = Math.max(0, Number(event.duration ?? 0) / 60);
      const data = event.data ?? {};
      const status = typeof data.status === "string" ? data.status : undefined;
      if (status === "afk") afkMinutes += durationMinutes;
    }

    for (const event of webEvents) {
      const durationMinutes = Math.max(0, Number(event.duration ?? 0) / 60);
      const data = event.data ?? {};
      const domain = domainFromUrl(typeof data.url === "string" ? data.url : "");
      if (domain) domainMinutes.set(domain, (domainMinutes.get(domain) ?? 0) + durationMinutes);
    }

    return {
      connected: current.connected === true && today.connected === true,
      date: today.date,
      trackedMinutes: Math.round(trackedMinutes),
      topApps: rankedMinutes(appMinutes, 8),
      topWindows: rankedMinutes(windowMinutes, 8),
      topDomains: rankedMinutes(domainMinutes, 8),
      hourlyActivity: hourlyMinutes.map((minutes, hour) => ({ hour, minutes: Math.round(minutes) })),
      timeline: (windowEvents.length > 0 ? windowEvents : events)
        .filter((event) => typeof event.data?.app === "string")
        .sort((a, b) => String(a.timestamp ?? "").localeCompare(String(b.timestamp ?? "")))
        .map((event) => ({
          timestamp: event.timestamp,
          duration: Math.max(0, Number(event.duration ?? 0)),
          app: String(event.data?.app ?? "未知应用"),
          title: typeof event.data?.title === "string" ? event.data.title : ""
        })),
      afkMinutes: Math.round(afkMinutes),
      current,
      error: current.connected === false ? current.error : today.connected === false ? today.error : undefined
    };
  }

  private cached(
    key: string,
    ttlMs: number,
    load: () => Promise<Record<string, unknown>>
  ): Promise<Record<string, unknown>> {
    const now = Date.now();
    const existing = this.cache.get(key);
    if (existing?.value && existing.expiresAt > now) {
      return Promise.resolve(existing.value);
    }
    if (existing?.pending) {
      return existing.pending;
    }

    let pending: Promise<Record<string, unknown>>;
    pending = load().then((value) => {
      if (this.cache.get(key)?.pending === pending) {
        this.cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      }
      return value;
    }).catch((error) => {
      if (this.cache.get(key)?.pending === pending) {
        this.cache.delete(key);
      }
      throw error;
    });
    this.cache.set(key, {
      expiresAt: existing?.expiresAt ?? 0,
      pending,
      value: existing?.value
    });
    return pending;
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

function findBuckets(buckets: Record<string, unknown>, prefix: string): string[] {
  return Object.keys(buckets).filter((bucketId) => bucketId.startsWith(prefix));
}

function eventList(value: unknown): ActivityWatchEvent[] {
  return Array.isArray(value) ? value.filter(isObject) as ActivityWatchEvent[] : [];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function rankedMinutes(entries: Map<string, number>, limit: number): Array<{ name: string; minutes: number }> {
  return [...entries.entries()]
    .map(([name, minutes]) => ({ name, minutes: Math.round(minutes) }))
    .filter((item) => item.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, limit);
}

function domainFromUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

function addToHourlyBuckets(buckets: number[], timestamp: string | undefined, durationSeconds: number): void {
  const start = timestamp ? new Date(timestamp) : undefined;
  if (!start || Number.isNaN(start.getTime()) || durationSeconds <= 0) return;

  let cursor = start.getTime();
  const end = cursor + durationSeconds * 1000;
  while (cursor < end) {
    const cursorDate = new Date(cursor);
    const nextHour = new Date(cursorDate);
    nextHour.setMinutes(60, 0, 0);
    const segmentEnd = Math.min(end, nextHour.getTime());
    buckets[cursorDate.getHours()] += (segmentEnd - cursor) / 60_000;
    cursor = segmentEnd;
  }
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
