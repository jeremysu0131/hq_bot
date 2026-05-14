FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
RUN npx playwright install --with-deps chromium

COPY src ./src

RUN mkdir -p /app/state /app/logs

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
