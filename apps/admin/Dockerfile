# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base

ENV NEXT_TELEMETRY_DISABLED=1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    g++ \
    make \
    python3 \
    util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

FROM base AS build

COPY . .

ENV DATABASE_URL=postgres://cms0:cms0@postgres:5432/cms0
ENV CMS0_PUBLIC_APP_URL=http://localhost:3000
ENV BETTER_AUTH_URL=http://localhost:3000
ENV BETTER_AUTH_SECRET=docker-build-placeholder-secret-change-at-runtime-0001
ENV TRUSTED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
ENV ADMIN_EMAIL=admin@example.com
ENV ADMIN_PASSWORD=docker-build-placeholder-password
ENV ORG_NAME=cms0
ENV CMS0_STORAGE_DRIVER=filesystem
ENV CMS0_STORAGE_PATH=/var/lib/cms0/storage
ENV CMS0_ASSET_BASE_URL=http://localhost:3000
ENV CMS0_EMAIL_TRANSPORT=log
ENV CMS0_EMAIL_FROM=no-reply@example.com

RUN pnpm install --frozen-lockfile
RUN mkdir -p apps/admin/db/generated \
  && printf "export {};\n" > apps/admin/db/generated/schema.ts \
  && printf "module.exports = {};\n" > apps/admin/db/generated/schema.runtime.cjs
RUN pnpm build:admin

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates util-linux \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 cms0 \
  && useradd --system --uid 1001 --gid cms0 --home-dir /app --shell /usr/sbin/nologin cms0

COPY --from=build --chown=cms0:cms0 /app /app

RUN mkdir -p /var/lib/cms0/storage /app/apps/admin/db/generated \
  && chown -R cms0:cms0 /var/lib/cms0 /app/apps/admin/db/generated

USER cms0
WORKDIR /app/apps/admin

EXPOSE 3000

CMD ["sh", "-c", "node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port ${PORT:-3000}"]
