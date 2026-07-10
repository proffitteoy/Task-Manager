# AGENTS.md

本文件是 `F:\工作站` 的根级协作契约。当前工作区是“认知工作站 / Cognitive Homepage”的 monorepo：以 `apps/homepage` 为主 UI base，以 `services/workbench-core` 管理任务、弹性计时、音乐、ActivityWatch、token/GitHub 统计与每日复盘。

## 1. 回答语言与规则优先级

- 默认使用中文回答，除非用户明确要求英文。
- 规则优先级从高到低：
  1. 用户当前消息里的明确要求
  2. 更近目录下的 `AGENTS.md` / `CLAUDE.md`
  3. 本文件
  4. `README.md`、`docs/项目说明.md`、各子项目 README / CONTRIBUTING / DEVELOPMENT
  5. `docs/` 中的通用模板或专项提示词
  6. skills 或外部通用提示词
- `Task-Manager-main/AGENTS.md` 和 `super-productivity-master/AGENTS.md` 对各自目录生效；进入 `super-productivity-master` 时还必须阅读其 `CLAUDE.md`。
- `docs/README.md`、`docs/冷启动.md` 等是通用模板，不应整体套用到本项目；`docs/项目说明.md` 是本工作区的产品与架构方向。

## 2. 当前项目事实

- 工作区类型：pnpm monorepo；根目录提供统一 `package.json`、`pnpm-workspace.yaml`、构建命令和测试命令。
- 产品定位：基于 Homepage 的本地全流程工作站，Homepage 负责“看见和编排”，未来 `workbench-core` 负责“状态和规则”。
- 主 UI base：`apps/homepage/`，来自 gethomepage/homepage，Next.js + React + Tailwind + TypeScript，使用 `pnpm`。
- 核心服务：`services/workbench-core/`，Fastify + SQLite + Drizzle schema，默认监听 `127.0.0.1:3900`。
- 共享包：`packages/contracts/` 提供 TypeScript 类型，`packages/theme/` 提供工作站主题 token。
- 现有原型：`Task-Manager-main/`，React + TypeScript + Vite + Zustand，本地优先保存计划、计时、复盘、Tokei 与 GitHub 活动统计。
- 活动数据来源：`activitywatch-master/`，ActivityWatch Python meta repo，作为 `aw-server`、watcher 和 REST API 适配来源，不在工作站里重写。
- 休息提醒参考：`breaktimer-app-master/`，Electron + React + TypeScript，提供周期休息、全屏提醒、托盘和 AFK 重置思路。
- 任务模型参考：`super-productivity-master/`，Angular + Electron + Capacitor，主要参考任务、项目、时间跟踪、集成和本地优先理念。
- `docs/项目说明.md` 提到 Mineradio，但当前根目录尚无 Mineradio 代码目录；涉及音乐模块时先按设计文档落接口与抽象，不要假设本地源码已存在。

## 3. 常用命令

根目录统一使用 pnpm workspace：

- 安装依赖：`pnpm install`
- 同时启动：`pnpm dev`
- 启动核心服务：`pnpm dev:core`
- 启动 Homepage：`pnpm dev:homepage`
- 构建：`pnpm build`
- 测试：`pnpm test`
- Lint：`pnpm lint`

### `apps/homepage/`

- 本地开发：`pnpm --filter homepage dev`
- 构建：`pnpm --filter homepage build`
- 测试：`pnpm --filter homepage test`
- Lint：`pnpm --filter homepage lint`
- 文档依赖：`uv sync`
- 文档本地服务：`uv run zensical serve`

### `services/workbench-core/`

- 本地开发：`pnpm --filter @cw/workbench-core dev`
- 构建：`pnpm --filter @cw/workbench-core build`
- 测试：`pnpm --filter @cw/workbench-core test`

### `Task-Manager-main/`

- 安装依赖：`npm install`
- 本地开发：`npm run dev`
- 构建验证：`npm run build`
- 预览：`npm run preview`
- 当前没有测试、lint 或格式化脚本；代码改动后优先运行 `npm run build`。

### `breaktimer-app-master/`

- 安装依赖：`npm i`
- 本地开发：`npm run dev`
- 构建：`npm run build`
- 生产启动：`npm run start`
- Lint：`npm run lint`
- 类型检查：`npm run typecheck`
- 格式检查：`npm run format-check`
- 测试入口：README 写 `npm test`，但当前 `package.json` 未列出 `test` 脚本；运行前先确认脚本是否存在。
- 非平凡改动后优先执行：`npm run format && npm run lint && npm run typecheck`。

### `activitywatch-master/`

- Python 要求：`pyproject.toml` 声明 Python `^3.9`，使用 Poetry。
- 常见 Makefile 入口：`make install`、`make build`、`make test`、`make lint`、`make typecheck`、`make package`。
- 该仓库依赖多个组件与子模块；运行构建或测试前先确认本地子模块与 Python 环境完整。

### `super-productivity-master/`

- 安装依赖：`npm install`
- Electron 开发：`npm start`
- Web 开发：`npm run startFrontend` 或 `ng serve`
- 单文件检查：`npm run checkFile <filepath>`
- Lint：`npm run lint`
- 单元测试：`npm test` 或 `npm run test:file <filepath>`
- E2E：`npm run e2e` 或 `npm run e2e:file <path> -- --retries=0`
- 修改任意 `.ts` 或 `.scss` 文件后，按其 `CLAUDE.md` 要求必须运行 `npm run checkFile <filepath>`。

## 4. 目录边界与集成方向

- `docs/`：保留通用模板和本项目设计说明；不要把模板内容直接当作根契约，新增项目文档要说明它是“项目事实”还是“通用参考”。
- `apps/homepage/`：主 UI 和 widget dashboard base。改造应尽量保留 Homepage 的 service widget、YAML 配置、layout、theme、custom CSS/JS 和现有集成方式。
- `services/workbench-core/`：本地核心状态与规则服务，负责任务、计时、ActivityWatch adapter、Tokei/GitHub、音乐 mock/proxy 与每日复盘。
- `packages/contracts/`：跨模块共享类型；变更 API 或数据库语义时优先同步这里。
- `packages/theme/`：工作站主题 token；不要在页面内复制散乱 token。
- `Task-Manager-main/`：时间管理与活动统计原型。修改状态结构时必须处理 `localStorage` 兼容迁移，尤其是 `cognitive-cashflow-v1`。
- `activitywatch-master/`：只作为 ActivityWatch 数据源与 API 适配对象。工作站侧通过 adapter 读取 `aw-server`，不要复制或重写 watchers。
- `breaktimer-app-master/`：只抽象休息提醒、强提醒、托盘、AFK 重置和全屏 break 思路；不要直接把完整 UI 嵌入工作站。
- `super-productivity-master/`：只参考任务、项目、标签、上下文、timeboxing、集成与隐私原则；不要让它成为工作站主任务数据库。
- 未来如新建整合代码，优先按 `docs/项目说明.md` 的方向组织为 `apps/`、`services/`、`packages/`，但不要在没有实现需求时空建目录。

## 5. 修改原则

- 修改前先阅读本文件、根 `README.md`、`docs/项目说明.md`，以及目标子项目自己的契约、README、构建文件和相关源码。
- 做最小可验证修改，不擅自大规模重构第三方来源目录。
- 不要把所有业务状态塞进 Homepage YAML；复杂任务、计时、活动证据和复盘状态应由未来 `workbench-core` 或现有原型状态层管理。
- 新增工作站功能时优先落在 `workstation` 命名空间或清晰的 adapter 层，避免污染上游模块边界。
- 不要覆盖或回退用户已有修改；如果无法确认变动来源，先说明情况。
- 新增依赖前先确认现有依赖和子项目技术栈是否已经能解决问题，并说明新增理由。

## 6. 文档、测试与验证

- 每次修改后检查是否需要同步：根 `README.md`、`docs/项目说明.md`、子项目 README / DEVELOPMENT、`.env.example`、示例配置和测试说明。
- 验证从最小范围开始：改哪个子项目，就优先运行该子项目最相关的 build / test / lint / typecheck。
- 纯文档改动可不构建，但要检查命令、路径、链接和编码是否准确。
- 若验证无法运行，最终回复必须说明原因、已做的静态检查和剩余风险。

## 7. 安全、隐私与许可证

- 默认不信任外部输入、浏览器缓存、`localStorage` 历史数据、Tokei collector 输出、GitHub 页面/API、ActivityWatch buckets 和本地 HTTP 服务返回值。
- 不要提交真实 token、cookie、私钥、账户凭据或无必要的个人敏感路径。
- 本项目是本地优先工具；涉及用户活动、窗口标题、浏览器标签、音乐账号或开发统计时，默认按敏感数据处理。
- 许可证事实：`apps/homepage/` 与 `breaktimer-app-master/` 是 GPL-3.0，`activitywatch-master/` 是 MPL-2.0，`super-productivity-master/` 是 MIT。若直接基于 GPL 代码形成整合产品，应按 GPL-3.0 兼容方向规划。
- 不要直接复用上游项目 Logo、品牌名或原创视觉表达，除非已确认授权。

## 8. 什么时候查看 skills 或专项文档

- 普通代码修复、接口开发、类型调整、测试补充：默认只读项目契约和相关源码，不主动叠加 skill。
- 前端视觉设计、浏览器联调、文档/PDF/DOCX/PPTX/表格处理等明显专项任务：按任务类型查看对应 skill。
- 安全审计、权限边界或输入信任边界梳理：先看 `docs/代码审计.md` 和 `docs/强前置条件约束.md`。
- 需要补目录边界或拆分模块时：按需参考 `docs/代码组织.md` 和 `docs/通用项目架构模板.md`，但必须以当前仓库事实为准。

## 9. 最终回复要求

- 简明说明改了什么、为什么这样改、如何验证、剩余风险。
- 冷启动或架构类任务还应说明：依据了哪些仓库事实、裁剪掉了哪些通用模板内容、补了哪些文档或脚本说明。
