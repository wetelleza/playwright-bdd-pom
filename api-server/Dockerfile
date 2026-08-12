# Lightweight on purpose: no browsers, no Playwright — just Express + tsx, so this image
# builds fast and stays small next to the much heavier test-runner image.
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["npm", "start"]
