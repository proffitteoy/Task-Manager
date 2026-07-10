import { useStore } from "../store";
import type { Derived } from "../lib/portfolio";
import { fmtHours } from "../lib/util";

const QUESTIONS: {
  field: "mathDebt" | "kaoyan" | "asset";
  q: string;
  ph: string;
}[] = [
  { field: "mathDebt", q: "数学任务完成情况", ph: "例如：实变测度论第 3 节 + 5 道证明" },
  { field: "kaoyan", q: "考研训练完成情况", ph: "例如：专业课第 6 章题量 + 错题复盘" },
  { field: "asset", q: "长期成果沉淀", ph: "例如：一个开源 PR / 一段计算实验" },
];

export function Settlement({ derived }: { derived: Derived }) {
  const date = useStore((s) => s.day.date);
  const settlement = useStore((s) => s.day.settlement);
  const reviewHistory = useStore((s) => s.reviewHistory);
  const setSettlement = useStore((s) => s.setSettlement);
  const closed = useStore((s) => s.day.closed);
  const toggleClosed = useStore((s) => s.toggleClosed);
  const savedToday = reviewHistory.some((entry) => entry.date === date);
  const recentReviews = reviewHistory.slice(0, 3);

  return (
    <section className="panel ledger-shadow rounded-xl border hairline p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-parchment">每日复盘</h2>
        <span className="text-[11px] uppercase text-faint">
          {savedToday ? "本地已保存" : "本地草稿"}
        </span>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3 rounded-lg border hairline bg-white/62 p-3 text-center">
        <Stat label="已投入" value={`${fmtHours(derived.nav)}h`} />
        <Stat label="目标合计" value={`${fmtHours(derived.targetTotal)}h`} />
        <Stat
          label="基础"
          value={derived.defenseFunded ? "达标" : "未达标"}
          tone={derived.defenseFunded ? "sage" : "debt"}
        />
      </div>

      {derived.surplus > 0 && (
        <div className="mb-5 rounded-lg border border-[rgba(184,137,30,0.36)] bg-[rgba(184,137,30,0.08)] p-3">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-[14px] text-gold-bright">
              超额投入 +{fmtHours(derived.surplus)}h
            </span>
            <span className="text-[11px] text-faint">超过计划的可分配时间</span>
          </div>
          <div className="mt-2 flex gap-2 text-[12px]">
            <span className="flex-1 rounded-md bg-white/65 px-2 py-1 text-quill">
              科研 100% ·{" "}
              <span className="tnum font-mono text-terra">
                {fmtHours(derived.surplusOffense)}h
              </span>{" "}
              多出来的时间投入长期课题
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {QUESTIONS.map((item) => (
          <label key={item.field} className="block">
            <span className="font-display text-[14px] text-parchment">
              {item.q}
            </span>
            <textarea
              value={settlement[item.field]}
              onChange={(e) => setSettlement(item.field, e.target.value)}
              placeholder={item.ph}
              rows={2}
              className="mt-1.5 w-full resize-none rounded-md border hairline bg-white/80 px-3 py-2 text-[13px] leading-relaxed text-parchment placeholder:text-faint focus:border-[var(--color-gold)] focus:outline-none"
            />
          </label>
        ))}
      </div>

      <button
        onClick={toggleClosed}
        className="mt-5 w-full rounded-md border px-4 py-2.5 font-display text-[14px] transition-colors"
        style={{
          borderColor: closed ? "var(--color-sage)" : "var(--color-gold)",
          color: closed ? "var(--color-sage)" : "var(--color-gold-bright)",
          background: closed ? "rgba(49,127,103,0.1)" : "rgba(184,137,30,0.08)",
        }}
      >
        {closed ? "✓ 今日复盘已保存 · 点击重开" : "保存今日复盘"}
      </button>

      {recentReviews.length > 0 && (
        <div className="mt-4 rounded-lg border hairline bg-white/52 px-3 py-3">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="font-display text-[14px] text-parchment">
              复盘记录
            </span>
            <span className="text-[11px] text-faint">
              {reviewHistory.length} 天
            </span>
          </div>
          <ul className="space-y-1.5">
            {recentReviews.map((entry) => (
              <li
                key={entry.date}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span className="tnum font-mono text-quill">{entry.date}</span>
                <span className="text-faint">
                  {entry.closed ? "已完成" : "草稿"} ·{" "}
                  {fmtHours(totalInvested(entry.invested))}h
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function totalInvested(invested: Record<string, number>): number {
  return Object.values(invested).reduce((sum, value) => sum + value, 0);
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "sage" | "debt";
}) {
  const color =
    tone === "sage"
      ? "var(--color-sage)"
      : tone === "debt"
        ? "var(--color-debt)"
        : "var(--color-parchment)";
  return (
    <div>
      <div className="text-[10px] uppercase text-faint">
        {label}
      </div>
      <div className="tnum mt-1 font-mono text-lg" style={{ color }}>
        {value}
      </div>
    </div>
  );
}
