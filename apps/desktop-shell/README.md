# Desktop Shell

`apps/desktop-shell` 是认知工作站的 Windows Electron 应用。Electron 提供 Chromium 渲染器、主窗口、托盘和全局快捷键；业务状态仍由本地 `workbench-core` 管理，Homepage 以 Next.js standalone 服务运行。

## 已实现

- 安装包内携带 Homepage standalone、`workbench-core` 与 SQLite 原生依赖。
- 先启动 core、再启动 Homepage，健康检查通过后才创建主窗口。
- 默认优先使用 `127.0.0.1:3900` 和 `127.0.0.1:3000`；端口占用时自动选择本地空闲端口。
- SQLite、Homepage 配置、认证密钥和日志保存在 Electron `userData`，升级不会覆盖已有 Homepage 配置。
- 单实例、关闭到托盘、托盘退出、打开数据目录。
- 全局快捷键控制窗口、计时与音乐。
- renderer 启用 `contextIsolation` 和 sandbox，禁用 Node integration；外链交给系统浏览器，桌面 IPC 校验来源。
- 启动失败显示明确错误并指向日志目录。

当前未实现自动更新、代码签名、桌面歌词、全屏休息窗和开机自启动。应用与 ActivityWatch 都不会被本项目自动加入 Windows 启动项。

## 开发与打包

从仓库根目录运行：

```bash
pnpm install
pnpm desktop:dev
pnpm desktop:pack
pnpm desktop:dist
```

- `desktop:dev`：构建 contracts、core、Homepage 和桌面壳后启动 Electron。
- `desktop:pack`：生成 `release/win-unpacked/`。
- `desktop:dist`：生成 `release/CognitiveWorkstation-<version>-x64.exe` 和 blockmap。

打包前应退出 `pnpm dev`。`better-sqlite3` 需要针对 Electron ABI 重建，`scripts/run-builder.mjs` 会在打包前备份 Node.js 版本并在结束后自动恢复；若 core 仍在运行并锁住原生模块，打包会明确失败。

## 数据目录

默认目录：

```text
%APPDATA%/Cognitive Workstation/
  data/workbench.sqlite
  config/homepage/*.yaml
  config/nextauth-secret
  logs/workbench-core.log
  logs/homepage.log
```

Homepage 示例配置只补充缺失文件，不覆盖用户已经修改的同名文件。卸载器默认保留该目录。

## 外部服务模式

默认由桌面壳管理两个内置服务。如需连接已经运行的服务：

```bash
WORKBENCH_CORE_EXTERNAL=1
WORKBENCH_CORE_URL=http://127.0.0.1:3900
HOMEPAGE_EXTERNAL=1
HOMEPAGE_URL=http://127.0.0.1:3000
```

其他可用覆盖：`WORKBENCH_CORE_PORT`、`HOMEPAGE_PORT`、`DATABASE_URL`、`ACTIVITYWATCH_URL`、`MUSIC_SERVICE_URL`、`TOKEI_REPO`、`NEXTAUTH_SECRET` 和 `COGNITIVE_WORKSTATION_USER_DATA_DIR`。

## 快捷键

| 功能 | 快捷键 |
|:---|:---|
| 显示/隐藏主窗口 | `Ctrl+Alt+H` |
| 开始/暂停/继续计时 | `Ctrl+Alt+Space` |
| 停止计时 | `Ctrl+Alt+S` |
| 播放/暂停音乐 | `Ctrl+Alt+P` |

快捷键被其他应用占用时，桌面壳会跳过该项并向 renderer 发送提示。
