import type { FocusSession, TimerPolicy } from "@cw/contracts";
import { describe, expect, it } from "vitest";

import { evaluateBreakReminder } from "../modules/breakReminder.js";

const policy: TimerPolicy = {
  id: "elastic-50-10",
  name: "弹性 50 + 10",
  mode: "elastic-block",
  config: {
    defaultFocusMinutes: 50,
    defaultBreakMinutes: 10,
    allowExtend: true,
    allowShorten: true,
    allowSkipBreak: true,
    allowManualAdjustment: true,
    softReminderAfterMinutes: 50,
    hardReminderAfterMinutes: 100
  },
  createdAt: "2026-07-10T00:00:00.000Z",
  updatedAt: "2026-07-10T00:00:00.000Z"
};

describe("evaluateBreakReminder", () => {
  it("returns a soft reminder after the configured focus interval", () => {
    const result = evaluateBreakReminder(sessionAt("2026-07-10T00:00:00.000Z"), policy, new Date("2026-07-10T00:51:00.000Z"));

    expect(result.level).toBe("soft");
    expect(result.elapsedFocusMinutes).toBe(51);
    expect(result.suggestedBreakMinutes).toBe(10);
  });

  it("escalates to a hard reminder without forcing the timer to stop", () => {
    const result = evaluateBreakReminder(sessionAt("2026-07-10T00:00:00.000Z"), policy, new Date("2026-07-10T01:41:00.000Z"));

    expect(result.level).toBe("hard");
    expect(result.canSkip).toBe(true);
  });

  it("does not remind while the current segment is a break", () => {
    const session = sessionAt("2026-07-10T00:00:00.000Z");
    session.segments[0].endedAt = "2026-07-10T00:55:00.000Z";
    session.segments[0].durationSeconds = 3300;
    session.segments.push({
      id: "break",
      sessionId: session.id,
      type: "break",
      startedAt: "2026-07-10T00:55:00.000Z"
    });

    expect(evaluateBreakReminder(session, policy, new Date("2026-07-10T01:00:00.000Z")).level).toBe("none");
  });
});

function sessionAt(startedAt: string): FocusSession {
  return {
    id: "session",
    policyId: policy.id,
    startedAt,
    segments: [
      {
        id: "focus",
        sessionId: "session",
        type: "focus",
        startedAt
      }
    ],
    adjustmentLog: []
  };
}
