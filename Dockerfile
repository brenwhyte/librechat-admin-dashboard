# syntax=docker/dockerfile:1

# Stage 1: Dependencies
FROM node:22.23.4-alpine AS deps
RUN apk update && apk upgrade && rm -rf /var/cache/apk/*
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# Stage 2: Build
FROM node:22.23.4-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG MONGODB_URI
ARG MONGODB_DB_NAME
ARG NEXT_PUBLIC_BASE_PATH=""

ENV MONGODB_URI=${MONGODB_URI}
ENV MONGODB_DB_NAME=${MONGODB_DB_NAME}
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Stage 3: Production
FROM node:22.23.4-alpine AS runner
WORKDIR /app

# Re-declare ARG to make it available in this stage
ARG NEXT_PUBLIC_BASE_PATH=""

RUN apk update && apk upgrade && rm -rf /var/cache/apk/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck uses the basePath for the health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000${NEXT_PUBLIC_BASE_PATH}/api/health || exit 1

CMD ["node", "server.js"]