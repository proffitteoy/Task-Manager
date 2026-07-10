import type { BreakReminderState, FocusSession, TimerPolicy } from "@cw/contracts";

export function evaluateBreakReminder(
  session: FocusSession,
  policy: TimerPolicy,
  now = new Date()
): BreakReminderState {
  const openSegment = session.segments.find((segment) => !segment.endedAt);
  const elapsedFocusMinutes = focusMinutes(session, now);
  const suggestedBreakMinutes = positiveMinutes(policy.config.defaultBreakMinutes, 10);
  const canSkip = policy.config.allowSkipBreak;

  if (!openSegment || openSegment.type !== "focus") {
    return {
      level: "none",
      elapsedFocusMinutes,
      suggestedBreakMinutes,
      canSkip,
      message: "当前不在专注分段中。"
    };
  }

  const softThreshold = positiveMinutes(
    policy.config.softReminderAfterMinutes,
    positiveMinutes(policy.config.defaultFocusMinutes, 50)
  );
  const hardThreshold = positiveOptionalMinutes(policy.config.hardReminderAfterMinutes);

  if (hardThreshold !== undefined && elapsedFocusMinutes >= hardThreshold) {
    return {
      level: "hard",
      elapsedFocusMinutes,
      suggestedBreakMinutes,
      thresholdMinutes: hardThreshold,
      canSkip,
      message: `已连续专注 ${elapsedFocusMinutes} 分钟，建议现在休息 ${suggestedBreakMinutes} 分钟。`
    };
  }

  if (elapsedFocusMinutes >= softThreshold) {
    return {
      level: "soft",
      elapsedFocusMinutes,
      suggestedBreakMinutes,
      thresholdMinutes: softThreshold,
      canSkip,
      message: `已达到 ${softThreshold} 分钟的休息提醒点，可休息 ${suggestedBreakMinutes} 分钟或继续本轮。`
    };
  }

  return {
    level: "none",
    elapsedFocusMinutes,
    suggestedBreakMinutes,
    thresholdMinutes: softThreshold,
    canSkip,
    message: `距离休息提醒还有 ${Math.max(0, softThreshold - elapsedFocusMinutes)} 分钟。`
  };
}

function focusMinutes(session: FocusSession, now: Date): number {
  const seconds = session.segments.reduce((total, segment) => {
    if (segment.type !== "focus") return total;
    if (typeof segment.durationSeconds === "number") {
      return total + Math.max(0, segment.durationSeconds);
    }
    if (segment.endedAt) {
      return total + secondsBetween(segment.startedAt, segment.endedAt);
    }
    return total + secondsBetween(segment.startedAt, now.toISOString());
  }, 0);

  return Math.floor(seconds / 60);
}

function secondsBetween(startedAt: string, endedAt: string): number {
  const started = Date.parse(startedAt);
  const ended = Date.parse(endedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  return Math.max(0, Math.floor((ended - started) / 1000));
}

function positiveMinutes(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function positiveOptionalMinutes(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined;
}
