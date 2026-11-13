# Multi-stage production image (Node 22 LTS). Runs anywhere containers run:
# VPS (Docker/Podman), Fly.io, Railway, Render, Google Cloud Run, Azure, AWS, Infomaniak, Exoscale …
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=3000
LABEL org.opencontainers.image.licenses="LicenseRef-Proprietary" org.opencontainers.image.source="https://github.com/lucadesimoni/vine-import-shop" org.opencontainers.image.description="White-label wine & speciality shop (B2B + B2C)"
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/public ./public
COPY package.json server.js passenger.cjs LICENSE NOTICE.md THIRD_PARTY_LICENSES.md ./
COPY deploy ./deploy
RUN mkdir -p data && chown -R node:node data
USER node
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "server.js"]
