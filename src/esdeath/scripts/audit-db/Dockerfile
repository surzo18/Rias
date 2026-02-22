FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/audit-db/ ./dist/audit-db/
COPY dist/shared/ ./dist/shared/
COPY dist/approval/ ./dist/approval/

RUN mkdir -p /data && chown 1000:1000 /data

USER 1000:1000

EXPOSE 9000

CMD ["node", "dist/audit-db/server.js"]
