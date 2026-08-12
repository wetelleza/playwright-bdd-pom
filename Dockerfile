# Pinned to match the installed @playwright/test version (see package.json) — bump both
# together. Using the official image gets the OS-level browser dependencies for free; the
# `playwright install` below is a self-correcting safety net in case the pinned tag and the
# npm-installed version ever drift apart.
FROM mcr.microsoft.com/playwright:v1.62.1-noble

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx playwright install --with-deps

ENV CI=true

CMD ["npm", "test"]
