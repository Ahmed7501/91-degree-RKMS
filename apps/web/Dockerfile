# syntax=docker/dockerfile:1
# RKDS web image: the built SPA served by unprivileged nginx, which also proxies /api and
# /socket.io to the `server` service (same origin, ADR-011). Build context: the repository root.
#   docker build -f apps/web/Dockerfile -t rkds-web:<version> .

FROM node:24.18.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/prisma.config.ts apps/server/
COPY apps/web/package.json apps/web/
COPY database/schema.prisma database/
RUN npm ci --no-audit --no-fund
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN npm run build -w @rkds/web

FROM nginxinc/nginx-unprivileged:1.29.3-alpine AS runtime
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
