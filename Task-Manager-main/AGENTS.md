# AGENTS.md

本文件是 `时间管理器 / cognitive-cashflow` 仓库的项目级协作契约。通用模板和外部 skill 只能作为参考，不能覆盖本文件、`README.md` 和当前代码上下文。

## 1. 回答语言与优先级

- 默认使用中文回答，除非用户明确要求英文。
- 规则优先级从高到低：
  1. 用户当前消息中的明确要求
  2. 本文件
  3. `README.md` 与 `docs/`
  4. `package.json`、`vite.config.ts`、`src/` 中的真实实现
  5. 外部 skills 或通用提示词
- 发现文档与代码不一致时，先以代码为准完成任务，再同步修正文档或在最终回复中说明未同步的原因。

## 2. 项目事实

- 项目类型：单页 Web 应用。
- 主技术栈：React 18、TypeScript、Vite 6、Tailwind CSS 4、Zustand、Motion。
- 包管理：仓库存在 `package-lock.json`，默认使用 `npm`；`pnpm-workspace.yaml` 只说明本地也可能用 pnpm，不应擅自切换锁文件体系。
- 运行入口：`src/main.tsx` 挂载 `src/App.tsx`。
- 状态保存：`src/store.ts` 使用 Zustand persist 写入浏览器 `localStorage`，主 key 为 `cognitive-cashflow-v1`。
- 本地开发接口：`vite.config.ts` 挂载 `/api/tokei/usage` 与 `/api/github/commits`，只在 `npm run dev` 或 `npm run preview` 的 Vite 服务里可用。

## 3. 常用命令

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 生产构建：`npm run build`
- 本地预览构建产物：`npm run preview`

当前没有配置测试、格式化或 lint 脚本。代码改动后优先运行 `npm run build` 做最小验证；纯文档改动可不构建，但要检查 Markdown 链接和命令说明是否准确。

## 4. 目录边界

- `src/App.tsx`：页面标签页与主布局，当前包含“日程计划”和“活动统计”两个工作台。
- `src/store.ts`：日状态、复盘历史、跨天迁移、计时提交、持久化归一化与兼容迁移。
- `src/types.ts`：共享业务类型。
- `src/data/accounts.ts`：时间分类、默认配比、系统标签和长期任务默认项。
- `src/lib/portfolio.ts`：目标时长、已投入、基础达标、超额投入等派生计算。
- `src/lib/activity.ts`：活动热力图、年度聚合、连续活跃天数等纯计算。
- `src/lib/tokei.ts`：Tokei 原始数据到 Token 面板数据的适配与格式化。
- `src/components/`：面向 UI 的 React 组件；组件内优先使用已有 store action 和 lib 计算结果。
- `vite.config.ts`：Vite 配置与本地 API 中间件，不只是构建配置。
- `legacy/`：旧版静态实现，除非用户明确要求迁移或对比，不要主动修改。
- `dist/` 与 `*.tsbuildinfo`：构建产物，不手写修改；如果构建导致变化，最终回复要说明。
- `docs/`：项目说明与保留的通用参考资料。通用参考不是当前项目的强制规则。

## 5. 修改原则

- 修改代码前先阅读本文件、`README.md`、与任务直接相关的源码和文档。
- 优先做最小可验证修改，不做无关的大规模重构。
- 不要覆盖或回退用户已有改动；如果遇到与任务冲突的未提交变更，先说明情况再处理。
- 修改时间分类、持久化结构或 localStorage key 时，必须考虑已有用户数据的兼容迁移。
- 修改活动统计时，同时检查 `vite.config.ts` 的接口输出、`src/lib/activity.ts` / `src/lib/tokei.ts` 的数据适配，以及 `TokenPanel` 的缓存逻辑。
- 修改 UI 时沿用现有“账本/纸张”风格、现有色彩变量和组件层次，不新增营销式落地页。
- 新增依赖前先确认现有依赖是否已经能解决问题，并说明新增理由。

## 6. 文档与验证

- 每次改动后检查是否需要同步：
  - `README.md`
  - `docs/README.md`
  - 相关代码注释
  - 示例命令、环境变量和运行说明
- 可运行验证时，优先选择与改动最相关的最小命令。
- 无法验证时，在最终回复中说明原因、已做的静态检查和剩余风险。

## 7. 安全与外部数据

- 浏览器本地输入、`localStorage` 中的历史数据、Tokei collector 输出、GitHub 页面/API 返回值都不能假设天然可信。
- 本地活动接口会执行 Python collector 并访问网络；涉及这些接口的验证可能需要本机环境、网络或额外授权。
- 不要在文档或代码中写入真实 token、cookie、私钥或个人敏感路径以外的新秘密。现有默认路径和用户名属于当前项目的运行约定，修改前需确认影响。
