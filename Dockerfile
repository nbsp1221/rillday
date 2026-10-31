# syntax=docker/dockerfile:1
FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/* \
    && corepack enable \
    && corepack prepare pnpm@11.25.0 --activate
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile --package-import-method=copy \
    && pnpm --filter @repo/web exec vite build \
    && pnpm --filter @repo/server --config.inject-workspace-packages=true --config.package-import-method=copy deploy --prod /out

FROM node:24.22.1-bookworm-slim AS runtime
ENV NODE_ENV=production \
    RILLDAY_HOST=0.0.0.0 \
    RILLDAY_PORT=4287 \
    RILLDAY_DB=/data/data.sqlite \
    RILLDAY_WEB_DIR=/app/apps/web/dist \
    RILLDAY_PUBLIC_URL=http://127.0.0.1:4287
WORKDIR /app
COPY --from=build /out/node_modules ./apps/server/node_modules
COPY --from=build /out/package.json ./apps/server/package.json
COPY --from=build /app/apps/server/src ./apps/server/src
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY LICENSE ./LICENSE
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 4287
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:4287/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "apps/server/src/server.ts"]
