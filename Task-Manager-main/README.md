# 时间管理器

认知现金流调度器：把一天的可用专注时间当成投资组合来分配、计时和复盘。应用目前是本地优先的单页 Web 工具，核心数据保存在浏览器 `localStorage`。

## 功能概览

- 今日计划：按数学基础、考研训练、每日资讯、技术开源、科研项目、缓冲机动分配时间。
- 分类任务：每个分类可添加多项任务，支持完成、编辑、删除。
- 计时与补记：分类独立计时，可手动按 0.5h、1h 或分钟补记投入。
- 长期任务：未完成事项会自动保留到次日。
- 每日复盘：保存数学、考研和长期成果沉淀记录，最多保留 90 天历史。
- 活动统计：通过本地 Vite API 汇总 Tokei token 使用与 GitHub 贡献，展示年度热力图。

## 技术栈

- React 18 + TypeScript
- Vite 6
- Tailwind CSS 4
- Zustand persist
- Motion

## 快速开始

```bash
npm install
npm run dev
```

启动后打开 Vite 输出的本地地址。活动统计页依赖 Vite 开发/预览服务器提供的 `/api/*` 接口，直接打开静态 HTML 时不会有本地 API。

## 构建与预览

```bash
npm run build
npm run preview
```

`npm run build` 会先执行 TypeScript 构建，再由 Vite 生成 `dist/`。

## 本地活动数据

`vite.config.ts` 中注册了两个仅本地运行的接口：

| 接口 | 作用 | 说明 |
|:---|:---|:---|
| `/api/tokei/usage` | 读取 Tokei token 使用 | 执行 `usage.30s.py --json` 与 `usage.30s.py --daily-costs --period 365d` |
| `/api/github/commits` | 读取 GitHub 贡献 | 默认抓取 GitHub contribution calendar，失败时使用 fallback API |

可用环境变量：

| 变量 | 默认值 | 用途 |
|:---|:---|:---|
| `TOKEI_REPO` | `F:\tokei` | Tokei collector 仓库路径，需包含 `usage.30s.py` |
| `TOKEI_PYTHON` | 自动尝试 `py.exe` / `python.exe` / `python` | 指定 Python 解释器 |
| `GITHUB_USERNAME` | `proffitteoy` | GitHub 活动统计用户名 |

活动统计结果会缓存到浏览器 `localStorage`：

- `time-manager.token-activity.v1`
- `time-manager.github-activity.v1`

## 数据与持久化

主应用状态由 `src/store.ts` 管理，持久化 key 为 `cognitive-cashflow-v1`。跨天时会自动提交进行中的计时，把未完成分类任务与长期任务带到新的一天，并在有复盘内容时写入历史记录。

修改状态结构时，需要同步更新归一化与迁移逻辑，避免破坏已有本地数据。

## 主要目录

```text
src/
  App.tsx                 页面标签页与主布局
  store.ts                Zustand 状态、迁移、跨天逻辑
  data/accounts.ts        时间分类与默认配比
  lib/portfolio.ts        今日计划派生计算
  lib/activity.ts         活动热力图与统计计算
  lib/tokei.ts            Token 数据适配
  components/             UI 组件
vite.config.ts            Vite 配置与本地 API 中间件
legacy/                   旧版静态实现
docs/                     项目文档索引与保留参考资料
```

## 开发约定

- 默认使用 `npm`，不要无故切换锁文件体系。
- 代码改动后优先运行 `npm run build`。
- 当前没有测试、lint 或格式化脚本；新增对应流程时同步更新本文档。
- 不手写修改 `dist/` 和 `*.tsbuildinfo`；它们由构建命令生成。
- `legacy/` 仅作旧实现参考，常规功能修改应落在 `src/`。
