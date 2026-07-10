export function dateKey(d = new Date()): string {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function uid(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

// 目标小时按 0.5h 取整，更贴近真实排程颗粒
export function roundHalf(n: number): number {
  return Math.round(n * 2) / 2;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function fmtHours(n: number): string {
  return n.toFixed(1);
}

export function elapsedHours(startedAt: number, now = Date.now()): number {
  return Math.max(0, (now - startedAt) / 3_600_000);
}

export function roundTimedHours(n: number): number {
  return Math.round(n * 100) / 100;
}

export function fmtElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");

  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];

export function weekdayLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return WEEKDAY[new Date(y, m - 1, d).getDay()];
}

// 周结构：周一到周五基础日，周六探索日，周日复盘日
export function dayMode(key: string): { label: string; hint: string } {
  const [y, m, d] = key.split("-").map(Number);
  const wd = new Date(y, m - 1, d).getDay();
  if (wd === 6) return { label: "探索日", hint: "集中推进开源、计算任务和论文实验" };
  if (wd === 0) return { label: "复盘日", hint: "复盘错题、整理笔记并调整下周计划" };
  return { label: "基础日", hint: "以数学基础和考研训练为主，保持技术连续性" };
}
