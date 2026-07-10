# Desktop Shell

这是阶段四 Windows 桌面版的最小 Electron 壳。

当前能力：

- 打开 `HOMEPAGE_URL`，默认 `http://localhost:3000`。
- 尝试启动 `services/workbench-core/dist/index.js`。
- 将 SQLite 默认写入 Electron `userData/data/workbench.sqlite`。
- 提供托盘入口和第一批全局快捷键。

开发流程：

```bash
pnpm --filter @cw/contracts build
pnpm --filter @cw/workbench-core build
pnpm --filter @cw/desktop-shell dev
```

如果 core 或 Homepage 由外部进程管理，可设置：

```bash
WORKBENCH_CORE_EXTERNAL=1
WORKBENCH_CORE_URL=http://127.0.0.1:3900
HOMEPAGE_URL=http://localhost:3000
```
