FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/email-tool/ ./dist/email-tool/
COPY dist/shared/ ./dist/shared/

# gog binary will be mounted or copied from gateway image at deploy time
# For now, the container expects it at /usr/local/bin/gog or GOG_PATH env

RUN mkdir -p /data/oauth && chown 1000:1000 /data/oauth

USER 1000:1000

EXPOSE 9003

CMD ["node", "dist/email-tool/server.js"]
