# syntax=docker/dockerfile:1
# Stage 1: minify and pre-compress public assets (scripts/build-assets.mjs).
# Only the build output is copied into the runtime image; the tools are not.
FROM docker.io/library/node:24-alpine AS assets
WORKDIR /build
RUN npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2 lightningcss@1.33.0 sharp@0.35.5 leaflet@1.9.4 hls.js@1.7.3
COPY public/ ./public/
COPY scripts/build-assets.mjs ./scripts/
RUN node scripts/build-assets.mjs public .asset-build

# Stage 2: runtime.
FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY server.mjs ./
COPY campus.mjs calendar.mjs ./
COPY clubs.mjs ./
COPY blocks.mjs moderation.mjs account-security.mjs backups.mjs message-files.mjs messaging.mjs profiles.mjs watch.mjs community.mjs voice-calls.mjs translation.mjs ./
COPY games.mjs game-engine.mjs ./
COPY photo-gallery.mjs campus-events.mjs ./
COPY database.mjs poster-store.mjs public-assets.mjs initialize-database.mjs observability.mjs ./
COPY data/ ./data/
COPY migrations/ ./migrations/
COPY public/ ./public/
COPY README.md ./
COPY --from=assets /build/.asset-build ./.asset-build
ENV PORT=8080 PUBLIC_ASSET_DIR=/app/.asset-build
EXPOSE 8080
CMD ["node", "server.mjs"]
