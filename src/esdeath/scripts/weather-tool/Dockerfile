FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/weather-tool/ ./dist/weather-tool/
COPY dist/shared/ ./dist/shared/

USER 1000:1000

EXPOSE 9005

CMD ["node", "dist/weather-tool/server.js"]
