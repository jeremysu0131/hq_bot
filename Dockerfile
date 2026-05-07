FROM node:20-alpine AS deps

WORKDIR /app

ENV NODE_ENV=production \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=1

RUN apk add --no-cache \
    ca-certificates \
    tzdata

RUN mkdir -p /app/state /app/logs \
    && chown -R node:node /app

USER node

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --omit=optional --no-audit --no-fund \
    && npm cache clean --force

FROM alpine:3.23

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache \
    ca-certificates \
    libstdc++ \
    tzdata \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node \
    && mkdir -p /app/state /app/logs \
    && chown -R node:node /app

COPY --from=deps /usr/local/bin/node /usr/local/bin/node
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src

USER node

CMD ["node", "src/cli.js", "start"]
