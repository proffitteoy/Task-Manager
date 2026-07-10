export type SystemKind =
  | "defense"
  | "maintenance"
  | "base"
  | "offense"
  | "buffer";

export type Accent = "debt" | "sage" | "gold" | "terra" | "quill";

export interface AccountDef {
  id: string;
  name: string;
  short: string;
  tagline: string;
  examples: string;
  system: SystemKind;
  priority: number;
  defaultPct: number;
  accent: Accent;
}

export interface SunkTask {
  id: string;
  text: string;
  done: boolean;
}

export interface AccountTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface Settlement {
  mathDebt: string;
  kaoyan: string;
  asset: string;
}

export interface ReviewEntry {
  date: string;
  settlement: Settlement;
  invested: Record<string, number>;
  closed: boolean;
  closedAt: number;
}

export interface ActiveTimer {
  accountId: string;
  startedAt: number;
}

export interface DayState {
  date: string;
  invested: Record<string, number>;
  tasks: Record<string, AccountTodo[]>;
  activeTimer: ActiveTimer | null;
  sunk: SunkTask[];
  settlement: Settlement;
  closed: boolean;
}

export interface Config {
  T: number;
  pct: Record<string, number>;
}
