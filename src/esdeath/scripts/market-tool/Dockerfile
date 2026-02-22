FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/market-tool/ ./dist/market-tool/
COPY dist/shared/ ./dist/shared/

RUN mkdir -p /data && chown 1000:1000 /data

USER 1000:1000

EXPOSE 9004

CMD ["node", "dist/market-tool/server.js"]
