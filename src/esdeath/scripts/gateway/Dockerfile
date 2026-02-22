FROM openclaw:local

USER root
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Create openclaw CLI symlink so agent can run "openclaw" commands
RUN printf '#!/bin/sh\nexec node /app/dist/index.js "$@"\n' > /usr/local/bin/openclaw \
    && chmod +x /usr/local/bin/openclaw

# Install gog (Google Workspace CLI) for Gmail/Calendar/Drive
ARG GOG_VERSION=0.9.0
RUN curl -fsSL "https://github.com/steipete/gogcli/releases/download/v${GOG_VERSION}/gogcli_${GOG_VERSION}_linux_amd64.tar.gz" \
    | tar -xzf - -C /usr/local/bin gog \
    && chmod +x /usr/local/bin/gog

# Install gh (GitHub CLI) for repo/PR/issue management
ARG GH_VERSION=2.86.0
RUN curl -fsSL "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz" \
    | tar -xzf - --strip-components=2 -C /usr/local/bin "gh_${GH_VERSION}_linux_amd64/bin/gh" \
    && chmod +x /usr/local/bin/gh

USER node
