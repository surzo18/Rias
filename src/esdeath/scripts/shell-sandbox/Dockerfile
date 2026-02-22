FROM node:22-alpine

RUN apk add --no-cache iputils procps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/shell-sandbox/ ./dist/shell-sandbox/
COPY dist/shared/ ./dist/shared/

USER 1000:1000

EXPOSE 9001

CMD ["node", "dist/shell-sandbox/server.js"]
