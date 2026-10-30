# syntax=docker/dockerfile:1
# RKDS server image (DEPLOYMENT §5). Build context: the repository root.
#   docker build -f apps/server/Dockerfile -t rkds-server:<version> .
# Used by both `server` (node dist/main.js) and `migrate` (prisma migrate deploy).

FROM node:24.18.0-bookworm-slim AS base
# openssl: required by the Prisma schema engine (migrations). ca-certificates: TLS to npm at build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# ---- build: all dependencies, then bundle the server (shared code + Prisma client inlined) ----
FROM base AS build
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/web/package.json apps/web/
COPY database/schema.prisma database/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN npm run build -w @rkds/server

# ---- runtime: production dependencies only (incl. the prisma CLI for migrate) ----
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/web/package.json apps/web/
COPY database database
RUN npm ci --omit=dev --no-audit --no-fund -w @rkds/server \
  && npm cache clean --force
COPY --from=build /app/apps/server/dist apps/server/dist
RUN chown -R node:node /app/apps/server
USER node
WORKDIR /app/apps/server
EXPOSE 3000
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]
