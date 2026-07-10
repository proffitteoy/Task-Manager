import type { AccountDef, SystemKind } from "../types";

// 扣除睡眠、吃饭、通勤、杂务之后的有效专注时间，
// 按「先稳住基础，再投入长期项目」的顺序分配到各个分类。
export const ACCOUNTS: AccountDef[] = [
  {
    id: "math",
    name: "数学基础",
    short: "数学",
    tagline: "优先安排高强度内容",
    examples: "数学分析 / 高代 / 实变 / 泛函 / PDE 基础",
    system: "defense",
    priority: 1,
    defaultPct: 38,
    accent: "debt",
  },
  {
    id: "kaoyan",
    name: "考研训练",
    short: "考研",
    tagline: "稳定推进备考任务",
    examples: "每日题量 / 专业课推进 / 证明复现 / 错题复盘",
    system: "defense",
    priority: 2,
    defaultPct: 22,
    accent: "sage",
  },
  {
    id: "basic",
    name: "每日读资讯",
    short: "资讯",
    tagline: "固定半小时信息输入",
    examples: "新闻资讯 / 学术动态 / 行业报告 / 信息整理",
    system: "maintenance",
    priority: 3,
    defaultPct: 6,
    accent: "quill",
  },
  {
    id: "tech",
    name: "技术开源",
    short: "技术",
    tagline: "持续积累工程能力",
    examples: "开源 PR / Python / Lean / Mathematica / 数据工程",
    system: "base",
    priority: 4,
    defaultPct: 18,
    accent: "gold",
  },
  {
    id: "research",
    name: "科研项目",
    short: "科研",
    tagline: "推进长期课题",
    examples: "导师项目 / 论文阅读 / 数学前沿 / 计算实验",
    system: "offense",
    priority: 5,
    defaultPct: 12,
    accent: "terra",
  },
  {
    id: "buffer",
    name: "缓冲机动",
    short: "缓冲",
    tagline: "预留机动时间",
    examples: "突发任务 / 状态波动 / 每日复盘 / 身体维护",
    system: "buffer",
    priority: 6,
    defaultPct: 4,
    accent: "quill",
  },
];

export const ACCOUNT_BY_ID: Record<string, AccountDef> = Object.fromEntries(
  ACCOUNTS.map((a) => [a.id, a])
);

export const SYSTEM_LABEL: Record<SystemKind, string> = {
  defense: "基础优先",
  maintenance: "日常输入",
  base: "长期建设",
  offense: "探索项目",
  buffer: "机动恢复",
};

// 长期任务池：放不必当天清空、需要持续推进的事项。
export const DEFAULT_SUNK: string[] = [
  "导师项目下一步",
  "开源项目待办",
  "论文 / 资料精读",
  "长期写作或实验记录",
];
