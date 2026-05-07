FROM mcr.microsoft.com/playwright:v1.59.1-jammy

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
RUN node -e "const { chromium } = require('playwright'); console.log('Playwright Chromium:', chromium.executablePath())"

COPY src ./src

RUN mkdir -p /app/state /app/logs

ENV NODE_ENV=production

CMD ["npm", "run", "start"]
