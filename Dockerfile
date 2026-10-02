# syntax=docker/dockerfile:1
FROM docker.io/library/node:24-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate && pnpm install --prod --frozen-lockfile --ignore-scripts
COPY server.mjs ./
COPY campus.mjs calendar.mjs ./
COPY clubs.mjs ./
COPY messaging.mjs profiles.mjs watch.mjs community.mjs voice-calls.mjs ./
COPY games.mjs game-engine.mjs ./
COPY photo-gallery.mjs ./
COPY database.mjs poster-store.mjs public-assets.mjs initialize-database.mjs ./
COPY data/ ./data/
COPY migrations/ ./migrations/
COPY public/ ./public/
COPY README.md ./
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.mjs"]
