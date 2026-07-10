import { motion } from "motion/react";
import { useStore } from "../store";
import type { Derived } from "../lib/portfolio";
import { dayMode, fmtHours, weekdayLabel } from "../lib/util";

export function Header({ derived }: { derived: Derived }) {
  const T = useStore((s) => s.config.T);
  const setT = useStore((s) => s.setT);
  const date = useStore((s) => s.day.date);
  const mode = dayMode(date);

  return (
    <motion.header
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 text-[11px] uppercase text-faint">
            <span>每日时间管理器</span>
            <span className="h-px w-8 bg-hair" />
            <span className="tnum font-mono">{date}</span>
            <span className="font-mono">周{weekdayLabel(date)}</span>
          </div>
          <h1 className="mt-2 font-display text-[2.8rem] font-medium leading-[0.98] text-parchment sm:text-[3.35rem]">
            今日计划
          </h1>
          <p className="mt-2 max-w-md text-[15px] leading-relaxed text-quill">
            按分类安排任务并记录实际投入，复盘当天的时间分布。
          </p>
        </div>

        <div className="text-right">
          <div className="text-[11px] uppercase text-faint">
            今日已投入
          </div>
          <div className="tnum font-mono text-[3.4rem] leading-none text-gold-bright">
            {fmtHours(derived.nav)}
            <span className="ml-1 text-xl text-faint">h</span>
          </div>
          <div className="mt-1 inline-flex items-center gap-2 rounded-full border hairline px-3 py-1 text-[12px]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: derived.defenseFunded
                  ? "var(--color-sage)"
                  : "var(--color-debt)",
              }}
            />
            <span className="font-display text-quill">
              {mode.label} · {derived.defenseFunded ? "基础达标" : "基础待完成"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 h-px gold-rule opacity-60" />

      <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-3">
          <span className="text-[12px] uppercase text-faint">
            今日可用专注时间
          </span>
          <div className="flex items-center gap-2">
            <Step onClick={() => setT(T - 0.5)} label="−" />
            <span className="tnum w-16 text-center font-mono text-2xl text-parchment">
              {fmtHours(T)}h
            </span>
            <Step onClick={() => setT(T + 0.5)} label="+" />
          </div>
        </div>
        <p className="text-[12px] text-faint">
          {mode.hint}
        </p>
      </div>
    </motion.header>
  );
}

function Step({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-md border hairline font-mono text-lg text-quill transition-colors hover:border-[var(--color-gold)] hover:text-gold-bright"
    >
      {label}
    </button>
  );
}
