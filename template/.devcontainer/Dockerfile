FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

# Keep in sync with the OpenCode Desktop app version you connect from
ARG OPENCODE_VERSION=2.0.23

# uv manages Python versions + deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
RUN npm install -g @opencode/cli@${OPENCODE_VERSION} \
    && mkdir -p /workspaces && chown node:node /workspaces

COPY post-create.sh /usr/local/bin/devbox-post-create
RUN chmod +x /usr/local/bin/devbox-post-create
