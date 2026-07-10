# Cognitive Homepage Docker

从仓库根目录运行：

```bash
docker compose -f deploy/docker-compose.yml up --build
```

默认地址：

- Homepage：`http://localhost:3000`
- 设置：`http://localhost:3000/settings/workstation`
- 核心服务：`http://localhost:3900/health`

持久化数据默认写入 `deploy/data/workbench.sqlite`。ActivityWatch 默认通过 `http://host.docker.internal:5600` 访问宿主机。
