FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production MCP_HOST=0.0.0.0 MCP_PORT=4311
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/package.json ./package.json
RUN mkdir .local && chown node:node .local
USER node
VOLUME ["/app/.local"]
EXPOSE 4311
CMD ["node", "dist/scripts/mcp.js"]
