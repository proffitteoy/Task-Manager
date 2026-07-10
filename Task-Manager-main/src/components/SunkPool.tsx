import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useStore } from "../store";

export function SunkPool() {
  const sunk = useStore((s) => s.day.sunk);
  const addSunk = useStore((s) => s.addSunk);
  const toggleSunk = useStore((s) => s.toggleSunk);
  const removeSunk = useStore((s) => s.removeSunk);
  const [text, setText] = useState("");

  const submit = () => {
    if (!text.trim()) return;
    addSunk(text);
    setText("");
  };

  return (
    <section className="panel ledger-shadow rounded-xl border hairline p-5">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-lg text-parchment">长期任务</h2>
        <span className="text-[11px] uppercase text-faint">
          持续推进
        </span>
      </div>
      <p className="mb-4 text-[12px] text-faint">
        记录不必当天清空的事项；未完成会自动保留到明天。
      </p>

      <div className="mb-4 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="添加长期任务"
          className="flex-1 rounded-md border hairline bg-white/80 px-3 py-2 text-[13px] text-parchment placeholder:text-faint focus:border-[var(--color-gold)] focus:outline-none"
        />
        <button
          onClick={submit}
          className="rounded-md border border-[var(--color-gold)] px-3 py-2 text-[13px] text-gold-bright transition-colors hover:bg-white/70"
        >
          添加
        </button>
      </div>

      <ul className="space-y-1.5">
        <AnimatePresence initial={false}>
          {sunk.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="group flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/65"
            >
              <button
                onClick={() => toggleSunk(t.id)}
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border hairline"
                style={{
                  background: t.done ? "var(--color-sage-deep)" : "transparent",
                  borderColor: t.done ? "var(--color-sage)" : undefined,
                }}
                aria-label="完成"
              >
                {t.done && <span className="text-[10px] text-parchment">✓</span>}
              </button>
              <span
                className={`flex-1 text-[13px] ${
                  t.done ? "text-faint line-through" : "text-quill"
                }`}
              >
                {t.text}
              </span>
              <button
                onClick={() => removeSunk(t.id)}
                className="text-[12px] text-faint opacity-0 transition-opacity hover:text-debt group-hover:opacity-100"
                aria-label="删除"
              >
                删除
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
        {sunk.length === 0 && (
          <li className="py-3 text-center text-[12px] text-faint">
            暂无长期任务
          </li>
        )}
      </ul>
    </section>
  );
}
