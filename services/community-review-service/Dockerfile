FROM node:22-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY services/community-review-service/package.json services/community-review-service/package-lock.json services/community-review-service/
RUN npm ci --prefix services/community-review-service --ignore-scripts
COPY tsconfig.json ./
COPY src ./src
COPY scripts/community-review-portal-build.mjs ./scripts/community-review-portal-build.mjs
COPY services/community-review-service ./services/community-review-service
RUN npm run build
RUN npm run community-review:build
RUN npm run community-review:portal:build

FROM node:22-bookworm-slim

ENV COMMUNITY_REVIEW_ENV=production
ENV COMMUNITY_REVIEW_HOST=0.0.0.0
ENV COMMUNITY_REVIEW_PORT=8787
ENV COMMUNITY_REVIEW_MATERIAL_ROOT=/app/private-material
WORKDIR /app
COPY --from=build /app/services/community-review-service/dist services/community-review-service/dist
COPY --from=build /app/services/community-review-service/migrations services/community-review-service/migrations
COPY --from=build /app/services/community-review-service/node_modules services/community-review-service/node_modules
RUN mkdir -p /app/private-material && chown -R node:node /app
USER node

EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node --input-type=module -e "const r=await fetch('http://127.0.0.1:8787/health/live'); if(!r.ok) process.exit(1)"
CMD ["node", "services/community-review-service/dist/services/community-review-service/src/cli.js", "serve"]
