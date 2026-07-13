import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ActivityStatsAdapter } from "../adapters/activityStats.js";
import { loadConfig } from "../config.js";

describe("ActivityStatsAdapter", () => {
  it("falls back to the bundled Tokei collector when a saved path is missing", async () => {
    const directory = mkdtempSync(join(tmpdir(), "workbench-tokei-fallback-"));
    const bundledTokei = join(directory, "bundled-tokei");
    mkdirSync(bundledTokei, { recursive: true });
    writeFileSync(
      join(bundledTokei, "usage.30s.py"),
      "console.log(JSON.stringify(process.argv.includes('--daily-costs') ? {} : { codex: { ranges: { today: { in: 7, out: 3 } } } }));\n"
    );
    const adapter = new ActivityStatsAdapter(
      loadConfig({
        databaseUrl: `file:${join(directory, "unused.sqlite")}`,
        tokeiRepo: bundledTokei,
        tokeiPython: process.execPath
      })
    );

    const payload = await adapter.tokeiUsage(true, {
      tokeiRepo: join(directory, "missing-saved-tokei"),
      tokeiPython: process.execPath
    });

    expect(payload.connected).toBe(true);
    expect(payload.fallback).toBe(true);
    expect(payload.roots).toEqual([bundledTokei]);
  });
});
