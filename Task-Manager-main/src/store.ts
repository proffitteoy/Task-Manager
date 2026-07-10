import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AccountTodo,
  ActiveTimer,
  Config,
  DayState,
  ReviewEntry,
  SunkTask,
} from "./types";
import { ACCOUNTS, DEFAULT_SUNK } from "./data/accounts";
import { clamp, dateKey, elapsedHours, roundTimedHours, uid } from "./lib/util";

const defaultPct = (): Record<string, number> =>
  Object.fromEntries(ACCOUNTS.map((account) => [account.id, account.defaultPct]));

const migrateDefaultPct = (pct: Record<string, number>): Record<string, number> => {
  if (pct.basic === 10 && pct.research === 8) {
    return { ...pct, basic: 6, research: 12 };
  }
  return pct;
};

const emptyTasks = (): Record<string, AccountTodo[]> =>
  Object.fromEntries(ACCOUNTS.map((account) => [account.id, []]));

const MAX_REVIEW_HISTORY = 90;

const carryTasks = (
  tasks: Record<string, AccountTodo[]> = emptyTasks()
): Record<string, AccountTodo[]> =>
  Object.fromEntries(
    ACCOUNTS.map((account) => [
      account.id,
      (tasks[account.id] ?? [])
        .filter((task) => !task.done && task.text.trim())
        .map((task) => ({ ...task, done: false })),
    ])
  );

const freshDay = (
  date = dateKey(),
  carrySunk = DEFAULT_SUNK,
  carriedTasks: Record<string, AccountTodo[]> = emptyTasks()
): DayState => ({
  date,
  invested: Object.fromEntries(ACCOUNTS.map((account) => [account.id, 0])),
  tasks: carryTasks(carriedTasks),
  activeTimer: null,
  sunk: carrySunk.map((text) => ({ id: uid(), text, done: false })),
  settlement: { mathDebt: "", kaoyan: "", asset: "" },
  closed: false,
});

const normalizeTaskList = (value: unknown): AccountTodo[] => {
  if (Array.isArray(value)) {
    return value
      .map((task) => {
        if (!task || typeof task !== "object") return null;
        const todo = task as Partial<AccountTodo>;
        if (typeof todo.text !== "string") return null;
        return {
          id: typeof todo.id === "string" ? todo.id : uid(),
          text: todo.text,
          done: Boolean(todo.done),
          createdAt:
            typeof todo.createdAt === "number" ? todo.createdAt : Date.now(),
        };
      })
      .filter((task): task is AccountTodo => Boolean(task));
  }

  if (typeof value === "string" && value.trim()) {
    return [{ id: uid(), text: value.trim(), done: false, createdAt: Date.now() }];
  }

  return [];
};

const normalizeTasks = (tasks: unknown): Record<string, AccountTodo[]> => {
  const source =
    tasks && typeof tasks === "object" ? (tasks as Record<string, unknown>) : {};
  return Object.fromEntries(
    ACCOUNTS.map((account) => [account.id, normalizeTaskList(source[account.id])])
  );
};

const normalizeInvested = (invested: unknown): Record<string, number> => {
  const source =
    invested && typeof invested === "object"
      ? (invested as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    ACCOUNTS.map((account) => {
      const value = Number(source[account.id] ?? 0);
      return [account.id, clamp(Number.isFinite(value) ? value : 0, 0, 16)];
    })
  );
};

const normalizeSunk = (sunk: unknown): SunkTask[] => {
  if (!Array.isArray(sunk)) {
    return DEFAULT_SUNK.map((text) => ({ id: uid(), text, done: false }));
  }

  return sunk
    .map((task) => {
      if (!task || typeof task !== "object") return null;
      const value = task as Partial<SunkTask>;
      if (typeof value.text !== "string") return null;
      return {
        id: typeof value.id === "string" ? value.id : uid(),
        text: value.text,
        done: Boolean(value.done),
      };
    })
    .filter((task): task is SunkTask => Boolean(task));
};

const normalizeActiveTimer = (timer: unknown): ActiveTimer | null => {
  if (!timer || typeof timer !== "object") return null;
  const value = timer as Partial<ActiveTimer>;
  if (
    typeof value.accountId !== "string" ||
    typeof value.startedAt !== "number" ||
    !ACCOUNTS.some((account) => account.id === value.accountId)
  ) {
    return null;
  }
  return { accountId: value.accountId, startedAt: value.startedAt };
};

const normalizeSettlement = (settlement: unknown): DayState["settlement"] => {
  const source =
    settlement && typeof settlement === "object"
      ? (settlement as Partial<DayState["settlement"]>)
      : {};

  return {
    mathDebt: typeof source.mathDebt === "string" ? source.mathDebt : "",
    kaoyan: typeof source.kaoyan === "string" ? source.kaoyan : "",
    asset: typeof source.asset === "string" ? source.asset : "",
  };
};

const normalizeDay = (value: unknown): DayState => {
  const day = value && typeof value === "object" ? (value as Partial<DayState>) : {};
  const base = freshDay(typeof day.date === "string" ? day.date : dateKey());

  return {
    ...base,
    invested: normalizeInvested(day.invested),
    tasks: normalizeTasks(day.tasks),
    activeTimer: normalizeActiveTimer(day.activeTimer),
    sunk: normalizeSunk(day.sunk),
    settlement: normalizeSettlement(day.settlement),
    closed: Boolean(day.closed),
  };
};

const normalizeReviewHistory = (value: unknown): ReviewEntry[] => {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const entry = item as Partial<ReviewEntry>;
      if (typeof entry.date !== "string") return null;

      return {
        date: entry.date,
        settlement: normalizeSettlement(entry.settlement),
        invested: normalizeInvested(entry.invested),
        closed: Boolean(entry.closed),
        closedAt:
          typeof entry.closedAt === "number" ? entry.closedAt : Date.now(),
      };
    })
    .filter((entry): entry is ReviewEntry => Boolean(entry))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_REVIEW_HISTORY);
};

const dayNeedsMigration = (day: DayState): boolean => {
  if (!day.activeTimer && !("activeTimer" in day)) return true;
  if (!day.tasks) return true;
  return ACCOUNTS.some(
    (account) => !Array.isArray((day.tasks as Record<string, unknown>)[account.id])
  );
};

const commitActiveTimer = (day: DayState, now = Date.now()): DayState => {
  const timer = day.activeTimer as ActiveTimer | null | undefined;
  if (!timer) return { ...day, activeTimer: null };

  const current = day.invested[timer.accountId] ?? 0;
  return {
    ...day,
    invested: {
      ...day.invested,
      [timer.accountId]: clamp(
        roundTimedHours(current + elapsedHours(timer.startedAt, now)),
        0,
        16
      ),
    },
    activeTimer: null,
  };
};

const snapshotInvested = (day: DayState, now = Date.now()): Record<string, number> => {
  const invested = normalizeInvested(day.invested);
  const timer = day.activeTimer;
  if (!timer) return invested;

  return {
    ...invested,
    [timer.accountId]: clamp(
      roundTimedHours((invested[timer.accountId] ?? 0) + elapsedHours(timer.startedAt, now)),
      0,
      16
    ),
  };
};

const hasReviewContent = (day: DayState): boolean =>
  day.closed || Object.values(day.settlement).some((value) => value.trim());

const upsertReviewHistory = (
  history: ReviewEntry[],
  day: DayState,
  closed: boolean,
  now = Date.now()
): ReviewEntry[] => {
  const entry: ReviewEntry = {
    date: day.date,
    settlement: normalizeSettlement(day.settlement),
    invested: snapshotInvested(day, now),
    closed,
    closedAt: now,
  };

  return [entry, ...history.filter((item) => item.date !== day.date)]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, MAX_REVIEW_HISTORY);
};

interface Store {
  config: Config;
  day: DayState;
  reviewHistory: ReviewEntry[];

  ensureToday: () => void;
  setT: (t: number) => void;
  setPct: (id: string, pct: number) => void;
  resetPct: () => void;
  invest: (id: string, delta: number) => void;
  addManualTime: (id: string, hours: number) => void;
  addAccountTask: (accountId: string, text: string) => void;
  updateAccountTask: (accountId: string, taskId: string, text: string) => void;
  toggleAccountTask: (accountId: string, taskId: string) => void;
  removeAccountTask: (accountId: string, taskId: string) => void;
  startTimer: (id: string) => void;
  stopTimer: () => void;
  addSunk: (text: string) => void;
  toggleSunk: (id: string) => void;
  removeSunk: (id: string) => void;
  setSettlement: (field: keyof DayState["settlement"], value: string) => void;
  toggleClosed: () => void;
  resetDay: () => void;
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      config: { T: 9, pct: defaultPct() },
      day: freshDay(),
      reviewHistory: [],

      ensureToday: () => {
        const today = dateKey();
        const savedDay = get().day;
        const currentDay = dayNeedsMigration(savedDay)
          ? normalizeDay(savedDay)
          : savedDay;

        if (currentDay.date === today) {
          if (currentDay !== savedDay) set({ day: currentDay });
          return;
        }

        const closedDay = commitActiveTimer(currentDay);
        const carry = closedDay.sunk
          .filter((task) => !task.done)
          .map((task) => task.text);
        const nextReviewHistory = hasReviewContent(closedDay)
          ? upsertReviewHistory(get().reviewHistory, closedDay, closedDay.closed)
          : get().reviewHistory;

        set({
          day: freshDay(today, carry.length ? carry : DEFAULT_SUNK, carryTasks(closedDay.tasks)),
          reviewHistory: nextReviewHistory,
        });
      },

      setT: (t) =>
        set((state) => ({ config: { ...state.config, T: clamp(t, 1, 16) } })),

      setPct: (id, pct) =>
        set((state) => ({
          config: {
            ...state.config,
            pct: { ...state.config.pct, [id]: clamp(Math.round(pct), 0, 100) },
          },
        })),

      resetPct: () =>
        set((state) => ({ config: { ...state.config, pct: defaultPct() } })),

      invest: (id, delta) =>
        set((state) => {
          const current = state.day.invested[id] ?? 0;
          return {
            day: {
              ...state.day,
              invested: {
                ...state.day.invested,
                [id]: clamp(Math.round((current + delta) * 2) / 2, 0, 16),
              },
            },
          };
        }),

      addManualTime: (id, hours) =>
        set((state) => {
          if (!Number.isFinite(hours) || hours <= 0) return {};
          const current = state.day.invested[id] ?? 0;
          return {
            day: {
              ...state.day,
              invested: {
                ...state.day.invested,
                [id]: clamp(roundTimedHours(current + hours), 0, 16),
              },
            },
          };
        }),

      addAccountTask: (accountId, text) =>
        set((state) => {
          const value = text.trim();
          if (!value) return {};

          return {
            day: {
              ...state.day,
              tasks: {
                ...state.day.tasks,
                [accountId]: [
                  ...(state.day.tasks[accountId] ?? []),
                  { id: uid(), text: value, done: false, createdAt: Date.now() },
                ],
              },
            },
          };
        }),

      updateAccountTask: (accountId, taskId, text) =>
        set((state) => ({
          day: {
            ...state.day,
            tasks: {
              ...state.day.tasks,
              [accountId]: (state.day.tasks[accountId] ?? []).map((task) =>
                task.id === taskId ? { ...task, text } : task
              ),
            },
          },
        })),

      toggleAccountTask: (accountId, taskId) =>
        set((state) => ({
          day: {
            ...state.day,
            tasks: {
              ...state.day.tasks,
              [accountId]: (state.day.tasks[accountId] ?? []).map((task) =>
                task.id === taskId ? { ...task, done: !task.done } : task
              ),
            },
          },
        })),

      removeAccountTask: (accountId, taskId) =>
        set((state) => ({
          day: {
            ...state.day,
            tasks: {
              ...state.day.tasks,
              [accountId]: (state.day.tasks[accountId] ?? []).filter(
                (task) => task.id !== taskId
              ),
            },
          },
        })),

      startTimer: (id) =>
        set((state) => {
          if (state.day.activeTimer?.accountId === id) return {};

          const now = Date.now();
          return {
            day: {
              ...commitActiveTimer(state.day, now),
              activeTimer: { accountId: id, startedAt: now },
            },
          };
        }),

      stopTimer: () =>
        set((state) => ({ day: commitActiveTimer(state.day) })),

      addSunk: (text) =>
        set((state) => {
          const value = text.trim();
          if (!value) return {};

          return {
            day: {
              ...state.day,
              sunk: [{ id: uid(), text: value, done: false }, ...state.day.sunk],
            },
          };
        }),

      toggleSunk: (id) =>
        set((state) => ({
          day: {
            ...state.day,
            sunk: state.day.sunk.map((task) =>
              task.id === id ? { ...task, done: !task.done } : task
            ),
          },
        })),

      removeSunk: (id) =>
        set((state) => ({
          day: {
            ...state.day,
            sunk: state.day.sunk.filter((task) => task.id !== id),
          },
        })),

      setSettlement: (field, value) =>
        set((state) => ({
          day: {
            ...state.day,
            settlement: { ...state.day.settlement, [field]: value },
          },
        })),

      toggleClosed: () =>
        set((state) => {
          const closed = !state.day.closed;
          return {
            day: { ...state.day, closed },
            reviewHistory: closed
              ? upsertReviewHistory(state.reviewHistory, state.day, true)
              : state.reviewHistory,
          };
        }),

      resetDay: () => set({ day: freshDay() }),
    }),
    {
      name: "cognitive-cashflow-v1",
      merge: (persisted, current) => {
        const saved =
          persisted && typeof persisted === "object"
            ? (persisted as Partial<Store>)
            : {};

        return {
          ...current,
          ...saved,
          config: {
            T: clamp(Number(saved.config?.T ?? current.config.T), 1, 16),
            pct: migrateDefaultPct({
              ...defaultPct(),
              ...(saved.config?.pct ?? {}),
            }),
          },
          day: normalizeDay(saved.day ?? current.day),
          reviewHistory: normalizeReviewHistory(saved.reviewHistory ?? current.reviewHistory),
        };
      },
    }
  )
);
