FROM node:24-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --include=dev

COPY agent ./agent
COPY src ./src
COPY tsconfig.json ./tsconfig.json
COPY API_CONTRACT.md ./API_CONTRACT.md

RUN npm run typecheck && npm run eve:build

ENV NODE_ENV=production
CMD ["npm", "run", "start:render"]
