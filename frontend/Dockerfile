# Production image. Multi-stage: build the static app against the full
# workspace, then serve the built output with nginx. Contrast with
# Dockerfile.dev, which is a single-stage dev image that keeps the whole
# repo and runs the Vite dev server.
#
# VITE_API_URL is a *build-time* value: Vite inlines `import.meta.env.VITE_*`
# into the built JS at `vite build` time (see frontend/src/api/client.ts) —
# there's no server-side process at runtime to read an env var from, so it
# must be supplied as a build arg, not a container env var. See
# docs/decisions.md for how this is wired up in CI and what to do if the
# homelab's Tailscale address ever changes.

FROM node:22-alpine AS build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter frontend build

# The nginx team's unprivileged variant of the same image: identical nginx,
# but it runs as UID 101 instead of root and its writable paths (cache, pid,
# temp) are pre-chowned to that user. The stock `nginx` image runs its master
# process as root, which is more privilege than serving static files needs.
# Consequence: it listens on 8080, not 80 — ports below 1024 require root —
# so nginx.conf and the Compose port mapping both use 8080.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /repo/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
