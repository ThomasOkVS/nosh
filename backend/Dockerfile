# Production image. Multi-stage: compile TypeScript against the full
# workspace, then assemble a runtime image with only backend's own
# production dependencies and compiled output (no frontend source, no
# devDependencies/TypeScript toolchain). Contrast with Dockerfile.dev, which
# is a single-stage dev image that keeps the whole repo and runs `tsx watch`.

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
# Recursive copy is required so pnpm can resolve the workspace (see
# docs/decisions.md#project-setup-tooling-choices). The repo-root
# .dockerignore excludes .env/.env.*.local, .git, node_modules, etc. from
# this build context.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter backend build

FROM node:22-alpine
# corepack enable, then yt-dlp (+ ffmpeg, pulled in as its dependency) for
# Reels/TikTok import — see the matching comment in Dockerfile.dev for why
# it's installed from Alpine's package repo rather than upstream's
# standalone binary.
RUN corepack enable && apk add --no-cache yt-dlp
WORKDIR /repo
# Only the two package.json files pnpm needs to resolve the workspace and
# install backend's production dependencies — no source, so nothing here
# invalidates this layer's cache except an actual dependency change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN pnpm install --frozen-lockfile --prod --filter backend

COPY --from=build /repo/backend/dist backend/dist
COPY backend/migrations backend/migrations

WORKDIR /repo/backend
RUN mkdir -p uploads && chown -R node:node /repo

USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
