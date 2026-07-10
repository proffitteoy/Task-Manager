# Workbench Core API

默认 base URL：`http://127.0.0.1:3900`。

Homepage 内部通过 `/api/workstation/*` 转发到 core，例如：

```text
/api/workstation/tasks -> http://127.0.0.1:3900/api/tasks
```

## 状态与 widgets

- `GET /health`
- `GET /api/workstation/status`
- `GET /api/widgets/workstation`：返回工作站首页所需的任务、计时、当前活动、音乐和今日摘要。
- `GET /api/events`：SSE 事件流

首页摘要只返回当天聚合数据，不返回 ActivityWatch、Tokei、GitHub 的原始 payload。

## 设置

> 当前设置接口已有基础实现，完整设置页、诊断页和导出能力仍按后续清单逐步打磨。

- `GET /api/settings/workstation`
- `PATCH /api/settings/workstation`
- `GET /api/settings/widgets`
- `PATCH /api/settings/widgets/:id`
- `POST /api/settings/widgets/reorder`
- `GET /api/settings/timer-policies`
- `POST /api/settings/timer-policies`
- `PATCH /api/settings/timer-policies/:id`
- `DELETE /api/settings/timer-policies/:id`
- `GET /api/settings/export`：当前为基础设置导出，不等同于阶段五完整数据导出。
- `POST /api/settings/import`：当前仅导入支持的设置数据。
- `POST /api/settings/reset-cache`：当前 MVP 暂无持久缓存需要清理。
- `POST /api/settings/delete-all-data`：危险操作，需要确认短语。

## 任务与项目

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/tasks`
- `POST /api/tasks`
- `PATCH /api/tasks`
- `PATCH /api/tasks/:id`
- `POST /api/tasks/:id/start-focus`

## 计时器

- `GET /api/timer/current`
- `POST /api/timer/start`
- `POST /api/timer/pause`
- `POST /api/timer/resume`
- `POST /api/timer/stop`
- `POST /api/timer/split`
- `POST /api/timer/adjust`

## 活动数据

- `GET /api/activitywatch/current`
- `GET /api/activitywatch/today`
- `GET /api/activitywatch/summary`
- `GET /api/activity/summary`：返回当天专注分钟、AFK、token、GitHub、任务完成数、session 数和模块状态。
- `GET /api/tokei/usage`
- `GET /api/github/contributions`

ActivityWatch、Tokei、GitHub 失败时返回 `connected:false` 或用户可理解的 `errors`，不阻断核心任务与计时流程。

## 音乐与复盘

- `GET /api/music/current`
- `GET /api/music/search?q=focus`
- `POST /api/music/play`
- `POST /api/music/pause`
- `POST /api/music/next`
- `POST /api/music/mood`
- `GET /api/review/today`
- `POST /api/review/close-day`

## 设置页

- `GET /api/settings/workstation`
- `PATCH /api/settings/workstation`
- `GET /api/settings/widgets`
- `PATCH /api/settings/widgets/:id`
- `POST /api/settings/widgets/reorder`
- `GET /api/settings/timer-policies`
- `POST /api/settings/timer-policies`
- `PATCH /api/settings/timer-policies/:id`
- `DELETE /api/settings/timer-policies/:id`
- `GET /api/settings/export`
- `POST /api/settings/import`
- `POST /api/settings/reset-cache`
- `POST /api/settings/delete-all-data`

`POST /api/settings/import` 默认只预览；传入 `confirm: true` 或 `preview: false` 才写入当前支持的 `settings`。

Homepage 对应页面：

```text
/settings/workstation
```
