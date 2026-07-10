# Original Frontends

本目录用于记录“开源前端组件/布局”的整合结果。当前策略是：工作站外层 shell、背景和板块导航由本项目统一实现；每个板块内部优先承载或复用对应开源项目的原组件、原布局和原样式。

## 当前已承载

- `Task-Manager-main`：已构建到 `apps/homepage/public/embedded/task-manager/`，由 `/workstation` 的“日程计划”和“Token 统计”板块打开。其原 `TokenPanel` 仍调用 `/api/tokei/usage` 和 `/api/github/commits`。
- `apps/homepage`：保留 Homepage 原前端与 dashboard 能力。

## 待承载后再删除根目录

- `breaktimer-app-master`：需要承载其 `app/renderer` 原 Electron/Vite 前端。
- `super-productivity-master`：需要承载其 Angular 原前端；体量较大，不能用重写 UI 替代。
- `activitywatch-master`：当前本地子模块目录为空；工作站先通过 aw-server 原 Web UI `http://127.0.0.1:5600` 承载，若补齐子模块后再复制原 Web UI。

## 约束

- 不把这些前端重写成工作站自定义业务组件。
- 可以自写工作站外层 shell、背景、标签导航和窗口承载逻辑。
- 只在外层补 API 兼容、静态资源承载、启动脚本和 iframe/窗口入口。
- 删除根部原始目录前，必须确认对应原前端已经能从本 monorepo 路径启动或访问。
