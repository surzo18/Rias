FROM node:22-slim

# Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_OPTIONS=--use-openssl-ca

# Ensure CA certificates are properly installed for Node.js fetch()
RUN update-ca-certificates 2>/dev/null || true

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist/web-browser/ ./dist/web-browser/
COPY dist/shared/ ./dist/shared/

EXPOSE 9002

CMD ["node", "dist/web-browser/server.js"]
