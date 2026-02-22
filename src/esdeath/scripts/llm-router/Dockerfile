FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/llm-router/ ./dist/llm-router/
COPY dist/shared/ ./dist/shared/
COPY config/llm-providers.json ./config/

USER 1000:1000

EXPOSE 8080

CMD ["node", "dist/llm-router/proxy-server.js"]
