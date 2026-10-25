# Lakehouse UI — API + Angular SPA in one image.
FROM node:24-slim AS build
WORKDIR /build

COPY api/package.json api/package-lock.json api/
RUN cd api && npm ci --no-audit --no-fund
COPY api api
RUN cd api && npm run build

COPY web/package.json web/package-lock.json* web/
RUN cd web && npm ci --no-audit --no-fund
COPY web web
RUN cd web && npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
# api (Hono) + its runtime deps
COPY --from=build /build/api/dist api/dist
COPY --from=build /build/api/package.json api/package.json
COPY --from=build /build/api/package-lock.json api/package-lock.json
RUN cd api && npm ci --omit=dev --no-audit --no-fund
# Angular build output, served by the api
COPY --from=build /build/web/dist/lakehouse-ui web/dist/lakehouse-ui

ENV HOST=127.0.0.1 PORT=8787 WEB_DIST_DIR=web/dist/lakehouse-ui
EXPOSE 8787
CMD ["node", "api/dist/server.js"]
