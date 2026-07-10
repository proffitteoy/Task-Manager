import { AccountCard } from "./AccountCard";
import { AllocationEditor } from "./AllocationEditor";
import { ACCOUNTS } from "../data/accounts";
import type { Derived } from "../lib/portfolio";

export function PortfolioPanel({
  derived,
  now,
}: {
  derived: Derived;
  now: number;
}) {
  const defensePct = Math.min(100, Math.round(derived.defenseProgress * 100));

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-xl text-parchment">今日分类计划</h2>
          <p className="text-[12px] text-faint">
            每个分类可设置任务并独立计时
          </p>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase text-faint">
            基础计划完成度
          </div>
          <div className="tnum font-mono text-xl text-sage">{defensePct}%</div>
        </div>
      </div>

      <AllocationEditor derived={derived} />

      <div className="space-y-3">
        {ACCOUNTS.map((def, i) => (
          <AccountCard
            key={def.id}
            def={def}
            view={derived.views[def.id]}
            index={i}
            locked={def.system === "offense" && !derived.defenseFunded}
            now={now}
          />
        ))}
      </div>
    </div>
  );
}
