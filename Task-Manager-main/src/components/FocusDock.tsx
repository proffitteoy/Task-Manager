import { motion } from "motion/react";
import { ACCOUNT_BY_ID } from "../data/accounts";
import type { Derived } from "../lib/portfolio";
import { ACCENT_VAR } from "../lib/portfolio";
import { fmtElapsed, fmtHours } from "../lib/util";
import { useStore } from "../store";

export function FocusDock({
  derived,
  now,
}: {
  derived: Derived;
  now: number;
}) {
  const activeTimer = useStore((state) => state.day.activeTimer);
  const tasks = useStore((state) => state.day.tasks);
  const stopTimer = useStore((state) => state.stopTimer);

  if (!activeTimer) return null;

  const account = ACCOUNT_BY_ID[activeTimer.accountId];
  if (!account) return null;

  const view = derived.views[account.id];
  const accent = ACCENT_VAR[account.accent];
  const sessionMs = now - activeTimer.startedAt;
  const todo = (tasks[account.id] ?? []).find((task) => !task.done);
  const pct = Math.min(100, Math.round((view?.progress ?? 0) * 100));

  return (
    <motion.section
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      className="focus-dock sticky top-3 z-30 mt-5 overflow-hidden rounded-lg border p-3"
      style={{ borderColor: accent }}
      role="status"
    >
      <div className="relative z-10 grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-focus-muted">
            <span className="focus-dot" style={{ background: accent }} />
            <span>专注进行中</span>
            <span className="h-px w-8 bg-[rgba(255,255,255,0.32)]" />
            <span>{account.short}</span>
          </div>
          <div className="mt-1 min-w-0 text-[14px] leading-snug text-white">
            {todo ? todo.text : `当前记录在${account.short}分类`}
          </div>
        </div>

        <div className="min-w-[150px]">
          <div className="text-[11px] uppercase text-focus-muted">本轮</div>
          <div className="tnum font-mono text-[2rem] leading-none text-white">
            {fmtElapsed(sessionMs)}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/14">
            <motion.span
              className="block h-full rounded-full"
              style={{ background: accent }}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.35, ease: "easeOut" }}
            />
          </div>
          <div className="tnum mt-1 font-mono text-[12px] text-focus-muted">
            今日 {fmtHours(view?.invested ?? 0)} / {fmtHours(view?.targetHours ?? 0)}h
          </div>
        </div>

        <button
          onClick={stopTimer}
          className="h-10 rounded-md border border-white/35 px-4 font-display text-[13px] text-white transition-colors hover:bg-white/12"
        >
          结束本轮
        </button>
      </div>
    </motion.section>
  );
}
