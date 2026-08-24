# Dockerfile for gitleap server
# Optimized multi-stage build for Fly.io deployment

# Build stage
FROM oven/bun:1 AS builder

WORKDIR /app

# Prisma generates the workspace client during install; generation needs its
# config/schema, but never connects to this build-only datasource.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build

# Copy dependency manifests first so source changes do not invalidate install.
COPY package.json bun.lock ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/cli/package.json ./apps/cli/package.json
COPY apps/fumadocs/package.json ./apps/fumadocs/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/api/package.json ./packages/api/package.json
COPY packages/auth/package.json ./packages/auth/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/db/package.json ./packages/db/package.json
COPY packages/env/package.json ./packages/env/package.json
COPY packages/db/prisma.config.ts ./packages/db/prisma.config.ts
COPY packages/db/prisma/schema ./packages/db/prisma/schema

RUN bun install --frozen-lockfile

# Copy source only after the locked workspace install.
COPY . .
# Build the application
RUN bun run build --filter=server

# Production stage
FROM oven/bun:1-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy built application
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./

COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["bun", "run", "dist/index.mjs"]
