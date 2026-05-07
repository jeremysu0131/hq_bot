FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
RUN node -e "const p = require('playwright-core'); console.log('playwright-core browser types:', Object.keys(p).filter((k) => ['chromium','firefox','webkit'].includes(k)).join(','))"

COPY src ./src

RUN mkdir -p /app/state /app/logs

ENV NODE_ENV=production
ENV BROWSER_EXECUTABLE_PATH=/usr/bin/chromium

CMD ["npm", "run", "start"]
