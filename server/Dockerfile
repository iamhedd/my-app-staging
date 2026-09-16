# Build with repository root as context:
# docker build -f server/Dockerfile -t gav-app .

FROM node:22-alpine AS web-dependencies
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS web-build
WORKDIR /workspace
COPY --from=web-dependencies /workspace/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY public ./public
RUN npm run build

FROM node:22-alpine AS api-dependencies
WORKDIR /workspace/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS api-build
WORKDIR /workspace/server
COPY --from=api-dependencies /workspace/server/node_modules ./node_modules
COPY server/package.json server/package-lock.json server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=../dist \
    MIGRATIONS_DIR=../postgres/migrations
WORKDIR /app/server
RUN apk add --no-cache tini
COPY --from=api-build --chown=node:node /workspace/server/package.json ./package.json
COPY --from=api-build --chown=node:node /workspace/server/node_modules ./node_modules
COPY --from=api-build --chown=node:node /workspace/server/dist ./dist
COPY --from=web-build --chown=node:node /workspace/dist /app/dist
COPY --chown=node:node postgres/migrations /app/postgres/migrations
COPY --chown=node:node server/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["./entrypoint.sh"]
