import { type FormEvent, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { AccountDef, AccountTodo } from "../types";
import type { AccountView } from "../lib/portfolio";
import { ACCENT_VAR } from "../lib/portfolio";
import { SYSTEM_LABEL } from "../data/accounts";
import { fmtElapsed, fmtHours } from "../lib/util";
import { useStore } from "../store";

interface Props {
  def: AccountDef;
  view: AccountView;
  index: number;
  locked: boolean;
  now: number;
}

export function AccountCard({ def, view, index, locked, now }: Props) {
  const [draft, setDraft] = useState("");
  const [manualMinutes, setManualMinutes] = useState("");
  const invest = useStore((state) => state.invest);
  const addManualTime = useStore((state) => state.addManualTime);
  const todos = useStore((state) => state.day.tasks?.[def.id] ?? []);
  const activeTimer = useStore((state) => state.day.activeTimer ?? null);
  const addAccountTask = useStore((state) => state.addAccountTask);
  const startTimer = useStore((state) => state.startTimer);
  const stopTimer = useStore((state) => state.stopTimer);
  const accent = ACCENT_VAR[def.accent];
  const pct = Math.min(100, Math.round(view.progress * 100));
  const over = view.invested > view.targetHours && view.targetHours > 0;
  const isTiming = activeTimer?.accountId === def.id;
  const isOtherTiming = Boolean(activeTimer && !isTiming);
  const sessionMs = isTiming ? now - activeTimer.startedAt : 0;
  const doneCount = todos.filter((task) => task.done).length;
  const openCount = todos.length - doneCount;
  const timerLabel = isTiming ? "停止" : isOtherTiming ? "切换" : "开始";
  const helperText = isTiming
    ? `本轮 ${fmtElapsed(sessionMs)}，正在记录到${def.short}`
    : locked
      ? "基础分类尚未达标；如已开始，也可以先记录实际投入"
      : openCount > 0
        ? `${openCount} 项任务待处理，可以开始计时`
        : "先添加任务，或直接开始记录这一类时间";

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.trim()) return;
    addAccountTask(def.id, draft);
    setDraft("");
  };

  const submitManualTime = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const minutes = Number(manualMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    addManualTime(def.id, minutes / 60);
    setManualMinutes("");
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }}
      className={`panel ledger-shadow relative overflow-hidden rounded-lg border hairline p-5 ${
        isTiming ? "timer-card-active" : ""
      }`}
      style={{ borderColor: isTiming ? accent : undefined }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accent, opacity: isTiming ? 1 : 0.75 }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] uppercase text-faint">
            <span className="tnum font-mono">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="rounded-sm px-1.5 py-0.5"
              style={{ background: "rgba(255,255,255,0.62)", color: accent }}
            >
              {SYSTEM_LABEL[def.system]}
            </span>
            {isTiming && (
              <span className="inline-flex items-center gap-1 text-sage">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sage" />
                计时中
              </span>
            )}
            {locked && !isTiming && <span className="text-debt">建议延后</span>}
          </div>
          <h3 className="mt-2 font-display text-[1.3rem] leading-tight text-parchment">
            {def.name}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-faint">
            {def.examples}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase text-faint">
            今日
          </div>
          <div
            className="tnum font-mono text-[2.05rem] leading-none"
            style={{ color: over ? "var(--color-gold-bright)" : accent }}
          >
            {fmtHours(view.invested)}
          </div>
          <div className="tnum font-mono text-[11px] text-faint">
            / {fmtHours(view.targetHours)}h
          </div>
        </div>
      </div>

      <div className="mt-4 border-t hairline pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase text-faint">
              今日任务
            </div>
            <div className="mt-1 text-[12px] text-quill">
              {todos.length === 0
                ? "暂无任务"
                : `${doneCount}/${todos.length} 已完成`}
            </div>
          </div>
          <button
            onClick={isTiming ? stopTimer : () => startTimer(def.id)}
            className={`tnum rounded-md border px-3 py-2 font-mono text-[12px] transition-colors hover:bg-[rgba(255,255,255,0.72)] ${
              isTiming ? "min-w-[116px]" : ""
            }`}
            style={
              isTiming
                ? {
                    borderColor: accent,
                    background: accent,
                    color: "white",
                  }
                : {
                    borderColor: accent,
                    color: accent,
                  }
            }
          >
            {timerLabel} {isTiming ? fmtElapsed(sessionMs) : "计时"}
          </button>
        </div>

        <form onSubmit={submit} className="mb-3 flex gap-2">
          <input
            value={draft}
            maxLength={120}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`添加一项${def.short}任务`}
            className="min-w-0 flex-1 rounded-md border hairline bg-white/80 px-3 py-2 text-[13px] text-parchment outline-none transition-colors placeholder:text-faint focus:border-[var(--color-sage)]"
          />
          <button
            type="submit"
            className="rounded-md border hairline px-3 py-2 text-[13px] text-quill transition-colors hover:border-[var(--color-sage)] hover:text-parchment"
          >
            添加
          </button>
        </form>

        <ul className="space-y-1.5">
          <AnimatePresence initial={false}>
            {todos.map((task) => (
              <TodoRow
                key={task.id}
                accountId={def.id}
                task={task}
                accent={accent}
              />
            ))}
          </AnimatePresence>
          {todos.length === 0 && (
            <li className="rounded-md border border-dashed border-[rgba(37,51,48,0.2)] px-3 py-3 text-center text-[12px] text-faint">
              可在这里为{def.short}添加多项任务
            </li>
          )}
        </ul>

        <div className="mt-3 text-[12px] text-faint">{helperText}</div>
      </div>

      <div className="mt-4">
        <div className="relative h-2 overflow-hidden rounded-full bg-[rgba(35,52,46,0.1)]">
          <motion.span
            className="absolute inset-y-0 left-0 rounded-full"
            style={{ background: accent }}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
          {over && (
            <span className="absolute inset-y-0 right-0 w-1/3 bg-[linear-gradient(90deg,transparent,rgba(184,137,30,0.4))]" />
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="tnum font-mono text-[11px] text-faint">
            {pct}% {over && <span className="text-gold-bright">· 超额</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <StepBtn label="-0.5" onClick={() => invest(def.id, -0.5)} />
            <StepBtn label="+0.5" onClick={() => invest(def.id, 0.5)} accent={accent} />
            <StepBtn label="+1" onClick={() => invest(def.id, 1)} accent={accent} />
          </div>
        </div>
        <form
          onSubmit={submitManualTime}
          className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-white/50 px-2 py-2"
        >
          <span className="text-[12px] text-faint">补记投入</span>
          <input
            type="number"
            min={1}
            max={960}
            step={5}
            value={manualMinutes}
            onChange={(event) => setManualMinutes(event.target.value)}
            placeholder="分钟"
            className="tnum w-20 rounded-md border hairline bg-white/80 px-2 py-1.5 font-mono text-[12px] text-parchment outline-none placeholder:text-faint focus:border-[var(--color-sage)]"
          />
          <button
            type="submit"
            className="rounded-md border hairline px-2.5 py-1.5 text-[12px] text-quill transition-colors hover:border-[var(--color-sage)] hover:text-parchment"
          >
            补记
          </button>
        </form>
      </div>
    </motion.article>
  );
}

function TodoRow({
  accountId,
  task,
  accent,
}: {
  accountId: string;
  task: AccountTodo;
  accent: string;
}) {
  const updateAccountTask = useStore((state) => state.updateAccountTask);
  const toggleAccountTask = useStore((state) => state.toggleAccountTask);
  const removeAccountTask = useStore((state) => state.removeAccountTask);

  const commitText = () => {
    const next = task.text.trim();
    if (!next) {
      removeAccountTask(accountId, task.id);
      return;
    }
    if (next !== task.text) updateAccountTask(accountId, task.id, next);
  };

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/65"
    >
      <button
        onClick={() => toggleAccountTask(accountId, task.id)}
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border"
        style={{
          background: task.done ? accent : "white",
          borderColor: task.done ? accent : "var(--color-hair)",
        }}
        aria-label="完成"
      >
        {task.done && <span className="text-[10px] leading-none text-white">✓</span>}
      </button>
      <input
        value={task.text}
        maxLength={120}
        onChange={(event) =>
          updateAccountTask(accountId, task.id, event.target.value)
        }
        onBlur={commitText}
        className={`min-w-0 flex-1 bg-transparent text-[13px] outline-none ${
          task.done ? "text-faint line-through" : "text-parchment"
        }`}
      />
      <button
        onClick={() => removeAccountTask(accountId, task.id)}
        className="text-[12px] text-faint opacity-0 transition-opacity hover:text-debt group-hover:opacity-100"
        aria-label="删除"
      >
        删除
      </button>
    </motion.li>
  );
}

function StepBtn({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="tnum rounded-md border hairline bg-white/55 px-2.5 py-1 font-mono text-[12px] text-quill transition-colors hover:text-parchment"
      style={accent ? { borderColor: "rgba(37,51,48,0.14)" } : undefined}
      onMouseEnter={(event) => {
        if (accent) event.currentTarget.style.borderColor = accent;
      }}
      onMouseLeave={(event) => {
        if (accent) event.currentTarget.style.borderColor = "var(--color-hair)";
      }}
    >
      {label}
    </button>
  );
}
