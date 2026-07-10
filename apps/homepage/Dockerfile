FROM node:22-slim AS builder

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/theme/package.json packages/theme/package.json
COPY apps/homepage/package.json apps/homepage/package.json
RUN pnpm install --filter homepage... --no-frozen-lockfile

COPY packages/theme packages/theme
COPY apps/homepage apps/homepage
RUN NEXT_TELEMETRY_DISABLED=1 pnpm --filter homepage build

FROM node:22-slim AS runner

WORKDIR /repo
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
ENV WORKBENCH_CORE_URL=http://workbench-core:3900

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/theme/package.json packages/theme/package.json
COPY apps/homepage/package.json apps/homepage/package.json
RUN pnpm install --prod --filter homepage... --no-frozen-lockfile

COPY packages/theme packages/theme
COPY --from=builder /repo/apps/homepage apps/homepage

WORKDIR /repo/apps/homepage
EXPOSE 3000
CMD ["pnpm", "start"]
