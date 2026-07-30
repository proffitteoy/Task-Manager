import { afterEach, describe, expect, it, vi } from "vitest";

import { ActivityWatchAdapter } from "../adapters/activitywatch.js";
import { loadConfig } from "../config.js";

describe("ActivityWatchAdapter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aggregates window, browser and hourly data for the computer activity dashboard", async () => {
    const now = new Date();
    now.setHours(9, 15, 0, 0);
    const windowEvents = [
      { timestamp: now.toISOString(), duration: 120, data: { app: "Code", title: "dashboard.jsx" } },
      { timestamp: new Date(now.getTime() + 120_000).toISOString(), duration: 60, data: { app: "Firefox", title: "Documentation" } }
    ];
    const afkEvents = [{ timestamp: now.toISOString(), duration: 30, data: { status: "afk" } }];
    const webEvents = [{ timestamp: now.toISOString(), duration: 90, data: { url: "https://www.example.com/docs" } }];

    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith("/api/0/buckets")) {
        return jsonResponse({
          "aw-watcher-window-test": {},
          "aw-watcher-afk-test": {},
          "aw-watcher-web-test": {}
        });
      }
      if (url.includes("aw-watcher-window-test")) return jsonResponse(windowEvents);
      if (url.includes("aw-watcher-afk-test")) return jsonResponse(afkEvents);
      if (url.includes("aw-watcher-web-test")) return jsonResponse(webEvents);
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new ActivityWatchAdapter(loadConfig({ activityWatchUrl: "http://127.0.0.1:5600" }));
    const summary = await adapter.summary();
    const cachedSummary = await adapter.summary();

    expect(summary.connected).toBe(true);
    expect(summary.trackedMinutes).toBe(3);
    expect(summary.topApps).toEqual([
      { name: "Code", minutes: 2 },
      { name: "Firefox", minutes: 1 }
    ]);
    expect(summary.topWindows).toEqual([
      { name: "dashboard.jsx", minutes: 2 },
      { name: "Documentation", minutes: 1 }
    ]);
    expect(summary.topDomains).toEqual([{ name: "example.com", minutes: 2 }]);
    expect(summary.hourlyActivity).toHaveLength(24);
    expect((summary.timeline as unknown[])).toHaveLength(2);
    expect(cachedSummary).toBe(summary);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).endsWith("/api/0/buckets"))).toHaveLength(1);
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
