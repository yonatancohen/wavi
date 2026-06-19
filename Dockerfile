FROM oven/bun:1.2-debian AS base

WORKDIR /app

# Chromium for whatsapp-web.js / Puppeteer
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-liberation \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxkbcommon0 \
  libgbm1 \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install deps (monorepo workspaces)
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY apps/dashboard/package.json apps/dashboard/package.json

RUN bun install --frozen-lockfile

# Build shared types package
COPY packages/shared packages/shared
RUN bun run --cwd packages/shared build

# Copy API source
COPY apps/api apps/api

WORKDIR /app/apps/api

ENV PORT=3000
EXPOSE 3000

CMD ["bun", "src/index.ts"]
