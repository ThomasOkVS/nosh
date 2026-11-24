# syntax=docker/dockerfile:1
# One container: the Hono API serves the built SPA. yt-dlp ships in the image
# (design s3).

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG COMMIT_SHA=dev
ENV COMMIT_SHA=$COMMIT_SHA
RUN pnpm build

FROM node:22-alpine
ARG COMMIT_SHA=dev
ENV NODE_ENV=production \
    COMMIT_SHA=$COMMIT_SHA \
    UPLOADS_DIR=/data/uploads
# ffmpeg comes in as yt-dlp's dependency.
RUN corepack enable && apk add --no-cache yt-dlp
WORKDIR /app
# Manifests only, so this layer caches until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY app/package.json app/
# The store is only an install cache; keep it out of the layer.
RUN pnpm install --frozen-lockfile --prod --filter @nosh/server... --store-dir /tmp/pnpm-store \
 && rm -rf /tmp/pnpm-store
COPY --from=build /repo/shared/dist shared/dist
COPY --from=build /repo/server/dist server/dist
COPY server/drizzle server/drizzle
COPY --from=build /repo/app/dist app/dist
RUN mkdir -p /data/uploads && chown -R node:node /data
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3001/health || exit 1
CMD ["node", "server/dist/main.js"]
