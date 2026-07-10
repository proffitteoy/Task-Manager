import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";
import { ACCOUNTS } from "../data/accounts";
import { ACCENT_VAR, type Derived } from "../lib/portfolio";
import { fmtHours } from "../lib/util";

export function AllocationEditor({ derived }: { derived: Derived }) {
  const [open, setOpen] = useState(false);
  const pct = useStore((s) => s.config.pct);
  const setPct = useStore((s) => s.setPct);
  const resetPct = useStore((s) => s.resetPct);

  const off = derived.totalPct - 100;

  return (
    <div className="panel rounded-xl border hairline">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="font-display text-base text-parchment">时间配比</span>
        <span className="flex items-center gap-3 text-[12px] text-faint">
          <span
            className="tnum font-mono"
            style={{
              color:
                Math.abs(off) <= 0.5
                  ? "var(--color-sage)"
                  : "var(--color-debt)",
            }}
          >
            已分配 {derived.totalPct}%
          </span>
          <span className="font-mono text-lg">{open ? "−" : "+"}</span>
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t hairline px-5 pb-5 pt-4">
              {ACCOUNTS.map((a) => {
                const v = derived.views[a.id];
                return (
                  <div key={a.id} className="flex items-center gap-3">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: ACCENT_VAR[a.accent] }}
                    />
                    <span className="w-14 shrink-0 text-[13px] text-quill">
                      {a.short}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      value={pct[a.id] ?? a.defaultPct}
                      onChange={(e) => setPct(a.id, Number(e.target.value))}
                      className="ledger-range h-1 flex-1 cursor-pointer appearance-none rounded-full bg-hair"
                      style={{ accentColor: ACCENT_VAR[a.accent] }}
                    />
                    <span className="tnum w-10 text-right font-mono text-[13px] text-parchment">
                      {pct[a.id] ?? a.defaultPct}%
                    </span>
                    <span className="tnum w-12 text-right font-mono text-[12px] text-faint">
                      {fmtHours(v.targetHours)}h
                    </span>
                  </div>
                );
              })}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[12px] text-faint">
                  {Math.abs(off) <= 0.5
                    ? "配比平衡 · 合计 100%"
                    : off > 0
                      ? `超配 ${off}% - 超过今日可用时间`
                      : `欠配 ${-off}% - 还有时间未安排`}
                </span>
                <button
                  onClick={resetPct}
                  className="rounded-md border hairline px-3 py-1 text-[12px] text-quill transition-colors hover:text-parchment"
                >
                  恢复默认
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
