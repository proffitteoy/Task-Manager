# Cognitive Homepage / 认知工作站

这是基于 Homepage 的本地全流程工作站 MVP。当前仓库已整理为 pnpm monorepo：Homepage 负责“看见和编排”，`workbench-core` 负责“状态和规则”，通过本地 API 把任务、弹性计时、ActivityWatch、token/GitHub 统计、音乐状态和每日复盘串成闭环。

## 当前状态

- 已迁移 Homepage 到 `apps/homepage`，原 Homepage 能力保留。
- 已新增 `services/workbench-core`，提供 Fastify + SQLite + Drizzle schema 的本地核心服务。
- 已新增 `packages/contracts` 和 `packages/theme`，提供共享类型与工作站主题 token。
- 已新增 Homepage 根路径工作站主页、`/workstation` 兼容入口和 `/api/workstation/*` proxy。
- 已新增 Homepage `/settings/workstation` 设置页和 `workbench-core` 设置 API，支持模式、组件、任务项目、计时策略、活动统计、音乐、主题、导入导出与隐私操作。
- 已完成 Chromium 桌面封装：`apps/desktop-shell` 使用 Electron 内置启动 `workbench-core` 与 Homepage standalone，提供安装包、托盘、全局快捷键、本地数据目录和启动健康检查。
- 已把旧原型中仍使用的能力收敛到正式模块：任务与活动统计进入 Homepage/core，ActivityWatch 通过 adapter 读取，任务模型进入 contracts/SQLite，休息策略由 core 输出软/强提醒；根目录不再保留完整上游仓库副本。
- Mineradio 源码当前不在仓库中，音乐模块第一版为本地 mock 状态，并支持未来通过 `MUSIC_SERVICE_URL` 代理。

## 目录说明

```text
F:\工作站\
  apps/
    homepage/                 Homepage fork + 工作站主页
    desktop-shell/            Windows Electron 桌面应用与安装包配置
  services/
    workbench-core/           本地核心服务：任务、计时、统计、音乐、复盘
  packages/
    contracts/                跨模块 TypeScript 类型
    theme/                    工作站主题 token 与 CSS
  deploy/                     Docker Compose 与部署说明
  docs/                       项目说明、开发指南和落地文档
```

## 快速开始

```bash
pnpm install
pnpm dev:core
pnpm dev:homepage
```

默认地址：

- Homepage：`http://localhost:3000`
- 设置：`http://localhost:3000/settings/workstation`
- Workbench Core 健康检查：`http://127.0.0.1:3900/health`

## 常用命令

```bash
pnpm dev              # 同时启动 core 和 Homepage
pnpm dev:core         # 只启动 workbench-core
pnpm dev:homepage     # 只启动 Homepage
pnpm build            # 构建 contracts、core、Homepage
pnpm build:docker     # 构建 Docker Compose 镜像
pnpm desktop:dev      # 启动 Electron desktop shell
pnpm desktop:build    # 构建 contracts、core、Homepage 与 desktop shell
pnpm desktop:pack     # 生成免安装 win-unpacked 目录
pnpm desktop:dist     # 生成 Windows 安装包
pnpm test             # 运行 core 和 Homepage 测试
pnpm lint             # 运行 Homepage lint
```

子项目命令：

```bash
pnpm --filter @cw/workbench-core build
pnpm --filter @cw/workbench-core test
pnpm --filter homepage build
pnpm --filter homepage test
pnpm --filter homepage lint
pnpm --filter @cw/desktop-shell build
```

## 环境变量

| 变量 | 默认值 | 用途 |
|:---|:---|:---|
| `PORT` | `3900` | `workbench-core` 端口 |
| `HOST` | `127.0.0.1` | `workbench-core` 监听地址 |
| `DATABASE_URL` | `file:./data/workbench.sqlite` | SQLite 数据库路径 |
| `WORKBENCH_CORE_URL` | `http://127.0.0.1:3900` | Homepage proxy 访问 core 的地址 |
| `ACTIVITYWATCH_URL` | `http://127.0.0.1:5600` | ActivityWatch aw-server 地址 |
| `ACTIVITYWATCH_MANAGED` | `1` | 桌面版自动托管内置 aw-server、窗口 watcher 和 AFK watcher；设为 `0` 时只连接外部服务 |
| `MUSIC_SERVICE_URL` | 空 | 可选音乐服务地址 |
| `TOKEI_REPO` | 桌面版为自身 staged/bundled collector | 包含 `usage.30s.py` 和价格表的 Tokei collector 目录 |
| `TOKEI_PYTHON` | 桌面版为内置 Python 3.12；其他模式自动尝试 | Tokei Python 解释器 |
| `GITHUB_USERNAME` | `proffitteoy` | GitHub 贡献统计用户名 |
| `HOMEPAGE_URL` | `http://127.0.0.1:3000` | Desktop shell 的 Homepage 地址 |
| `HOMEPAGE_PORT` | `3000` | Desktop shell 内置 Homepage 的首选端口；占用时自动选择空闲端口 |
| `HOMEPAGE_EXTERNAL` | 空 | 设为 `1` 时 Desktop shell 不启动内置 Homepage |
| `WORKBENCH_CORE_PORT` | `3900` | Desktop shell 内置 core 的首选端口；占用时自动选择空闲端口 |
| `WORKBENCH_CORE_EXTERNAL` | 空 | 设为 `1` 时 Desktop shell 不启动内置 core |
| `COGNITIVE_WORKSTATION_USER_DATA_DIR` | Electron `userData` | 可选桌面数据目录覆盖，主要用于测试与便携调试 |

## MVP 功能

- 任务：创建任务、完成任务、从任务启动专注。
- 弹性计时：无任务启动、暂停、继续、结束、手动拆分、手动调整，并按 timer policy 输出软/强休息提醒。
- 活动统计：迁入 Tokei/GitHub collector 逻辑；Windows 安装包携带 Tokei collector、价格表和最小 Python 标准运行时，无需另装 Python。
- ActivityWatch：只读 aw-server；未连接时不影响任务和计时。
- 音乐：mock 当前播放、播放/暂停、下一首、mood；预留远端音乐服务代理。
- 每日复盘：聚合任务、session、ActivityWatch、Tokei/GitHub、音乐和调整日志。
- 设置页：通过 UI 管理工作站模式、组件显示、项目偏好、计时策略、ActivityWatch/Tokei/GitHub/音乐/主题和隐私数据。
- 封装：提供 Docker Compose，以及携带 Homepage、core 与 SQLite 原生依赖的 Electron/Chromium Windows 安装包。

## 验证说明

Windows 桌面版从仓库根目录构建；打包前先退出正在运行的 `pnpm dev`，避免 Next 构建目录和 SQLite 原生模块被占用：

```bash
pnpm install
pnpm desktop:pack
pnpm desktop:dist
```

产物位于 `apps/desktop-shell/release/`。当前安装器未配置发行证书，Windows SmartScreen 可能提示“未知发布者”。应用默认不会添加开机自启动；桌面壳会随工作站自动启动安装包内的 ActivityWatch server、窗口 watcher 和 AFK watcher，并在工作站退出时停止它们，无需单独启动 ActivityWatch。

Docker smoke：

```bash
docker compose -f deploy/docker-compose.yml up --build
```

## 后续阶段文档

- [后续阶段总览](./docs/后续阶段.md)
- [阶段三：工作站设置页面](./docs/设置页面.md)
- [阶段四：封装与发布](./docs/封装与发布.md)

## 许可证与隐私

- Homepage fork 按 GPL-3.0 兼容方向维护；其他上游能力的来源和整合边界见 [上游能力整合](./docs/上游能力整合.md)。
- ActivityWatch、窗口标题、浏览器标签、token/GitHub 统计、音乐账号数据都按敏感本地数据处理。
- 不提交真实 token、cookie、私钥或无必要的个人敏感路径。
