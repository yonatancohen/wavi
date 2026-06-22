# 1.4+ required for Baileys: ws 'upgrade' event ordering fix (bun#31408)
FROM oven/bun:1.4-debian AS base

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

# Persistent volume mount point — Railway mounts /data at runtime.
# Creating it in the image ensures a clean fallback path even without
# a volume (e.g. local Docker testing or first-boot before volume attaches).
RUN mkdir -p /data

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
