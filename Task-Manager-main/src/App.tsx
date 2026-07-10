import { useEffect, useMemo, useState } from "react";
import { useStore } from "./store";
import { computeDerived } from "./lib/portfolio";
import { Header } from "./components/Header";
import { PortfolioPanel } from "./components/PortfolioPanel";
import { SunkPool } from "./components/SunkPool";
import { Settlement } from "./components/Settlement";
import { FocusDock } from "./components/FocusDock";
import { TokenPanel } from "./components/TokenPanel";

type AppTab = "planner" | "tokens";

const TABS: { id: AppTab; label: string; caption: string }[] = [
  { id: "planner", label: "日程计划", caption: "分类计时" },
  { id: "tokens", label: "活动统计", caption: "Token & GitHub" },
];

export default function App() {
  const config = useStore((s) => s.config);
  const day = useStore((s) => s.day);
  const ensureToday = useStore((s) => s.ensureToday);
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<AppTab>(() => initialTab());

  useEffect(() => {
    ensureToday();
    const id = setInterval(ensureToday, 60_000);
    return () => clearInterval(id);
  }, [ensureToday]);

  useEffect(() => {
    if (!day.activeTimer) return;

    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [day.activeTimer]);

  const derived = useMemo(
    () => computeDerived(config, day, now),
    [config, day, now]
  );

  return (
    <div className="relative z-10 mx-auto max-w-7xl px-5 py-10 sm:px-8 sm:py-14">
      <Header derived={derived} />
      <FocusDock derived={derived} now={now} />

      <nav
        className="mt-8 inline-flex rounded-xl border hairline bg-white/58 p-1"
        role="tablist"
        aria-label="工作台标签页"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`min-w-[118px] rounded-lg px-4 py-2 text-left transition-colors ${
              activeTab === tab.id
                ? "bg-parchment text-white shadow-sm"
                : "text-quill hover:bg-white/72"
            }`}
          >
            <span className="block font-display text-[14px]">{tab.label}</span>
            <span
              className={`block text-[10px] uppercase ${
                activeTab === tab.id ? "text-white/65" : "text-faint"
              }`}
            >
              {tab.caption}
            </span>
          </button>
        ))}
      </nav>

      {activeTab === "planner" ? (
        <main className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-[1.45fr_1fr]">
          <section>
            <PortfolioPanel derived={derived} now={now} />
          </section>
          <aside className="space-y-6">
            <SunkPool />
            <Settlement derived={derived} />
          </aside>
        </main>
      ) : (
        <main className="mt-8">
          <TokenPanel />
        </main>
      )}

      <footer className="mt-12 border-t hairline pt-5 text-center text-[11px] text-faint">
        分类计时 · 任务顺延 · 本地复盘 · 活动统计
      </footer>
    </div>
  );
}

function initialTab(): AppTab {
  if (typeof window === "undefined") return "planner";
  const tab = new URLSearchParams(window.location.search).get("tab");
  return tab === "tokens" ? "tokens" : "planner";
}
