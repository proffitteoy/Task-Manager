import type { Accent, Config, DayState } from "../types";
import { ACCOUNTS } from "../data/accounts";
import { elapsedHours, roundHalf, roundTimedHours } from "./util";

const DEFENSE_FUNDED_RATIO = 0.8; // 基础投入达目标 80% 视为「已稳」

export interface AccountView {
  id: string;
  targetHours: number;
  invested: number;
  progress: number; // 0..1+
  funded: boolean;
}

export interface Derived {
  views: Record<string, AccountView>;
  totalPct: number;
  targetTotal: number;
  investedTotal: number;
  nav: number; // 今日已投入总时长
  defenseFunded: boolean; // 基础分类是否已稳
  defenseProgress: number; // 基础分类整体完成度 0..1
  surplus: number; // 超额投入（超出 T 的部分）
  surplusOffense: number; // 默认全部给科研 / 前沿
  surplusUpgrade: number; // 保留字段兼容历史展示
}

export function computeDerived(config: Config, day: DayState, now = Date.now()): Derived {
  const views: Record<string, AccountView> = {};
  let targetTotal = 0;
  let investedTotal = 0;
  let totalPct = 0;

  let defenseTarget = 0;
  let defenseInvested = 0;
  let defenseAllFunded = true;

  for (const acc of ACCOUNTS) {
    const pct = config.pct[acc.id] ?? acc.defaultPct;
    totalPct += pct;
    const targetHours = roundHalf((config.T * pct) / 100);
    const activeHours =
      day.activeTimer?.accountId === acc.id
        ? elapsedHours(day.activeTimer.startedAt, now)
        : 0;
    const invested = roundTimedHours((day.invested[acc.id] ?? 0) + activeHours);
    const funded = targetHours === 0 || invested >= targetHours;

    views[acc.id] = {
      id: acc.id,
      targetHours,
      invested,
      progress: targetHours > 0 ? invested / targetHours : invested > 0 ? 1 : 0,
      funded,
    };

    targetTotal += targetHours;
    investedTotal += invested;

    if (acc.system === "defense") {
      defenseTarget += targetHours;
      defenseInvested += invested;
      if (invested < targetHours * DEFENSE_FUNDED_RATIO) defenseAllFunded = false;
    }
  }

  const surplus = roundHalf(Math.max(0, investedTotal - config.T));

  return {
    views,
    totalPct,
    targetTotal: roundHalf(targetTotal),
    investedTotal: roundHalf(investedTotal),
    nav: roundHalf(investedTotal),
    defenseFunded: defenseAllFunded,
    defenseProgress: defenseTarget > 0 ? defenseInvested / defenseTarget : 1,
    surplus,
    surplusOffense: surplus,
    surplusUpgrade: 0,
  };
}

export const ACCENT_VAR: Record<Accent, string> = {
  debt: "var(--color-debt)",
  sage: "var(--color-sage)",
  gold: "var(--color-gold)",
  terra: "var(--color-terra)",
  quill: "var(--color-quill)",
};
