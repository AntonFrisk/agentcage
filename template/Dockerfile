FROM mcr.microsoft.com/devcontainers/javascript-node:24-bookworm

# Set by agentcage: OpenCode version matching the Desktop app (empty = no OpenCode), extra global npm tools
ARG OPENCODE_VERSION=
ARG NPM_GLOBALS=

# uv manages Python versions + deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/
RUN if [ -n "$OPENCODE_VERSION" ]; then npm install -g @opencode/cli@${OPENCODE_VERSION}; fi \
    && if [ -n "$NPM_GLOBALS" ]; then npm install -g $NPM_GLOBALS; fi \
    && mkdir -p /workspaces && chown node:node /workspaces

COPY post-create.sh /usr/local/bin/agentcage-post-create
RUN chmod +x /usr/local/bin/agentcage-post-create
