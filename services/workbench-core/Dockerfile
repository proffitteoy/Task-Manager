FROM node:22-slim AS builder

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/workbench-core/package.json services/workbench-core/package.json
RUN pnpm install --filter @cw/workbench-core... --no-frozen-lockfile

COPY packages/contracts packages/contracts
COPY services/workbench-core services/workbench-core
RUN pnpm --filter @cw/contracts build && pnpm --filter @cw/workbench-core build

FROM node:22-slim AS runner

WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3900
ENV DATABASE_URL=file:/app/data/workbench.sqlite

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY services/workbench-core/package.json services/workbench-core/package.json
RUN pnpm install --prod --filter @cw/workbench-core... --no-frozen-lockfile

COPY --from=builder /repo/packages/contracts/dist packages/contracts/dist
COPY --from=builder /repo/services/workbench-core/dist services/workbench-core/dist

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 3900
CMD ["node", "services/workbench-core/dist/index.js"]
