FROM node:20-alpine AS base

# Install deps
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* package-lock.json* yarn.lock* ./
RUN corepack enable pnpm 2>/dev/null; \
    if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    elif [ -f yarn.lock ]; then yarn install --frozen-lockfile; \
    else npm ci; fi

# Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

RUN corepack enable pnpm 2>/dev/null; \
    if [ -f pnpm-lock.yaml ]; then pnpm build; \
    elif [ -f yarn.lock ]; then yarn build; \
    else npm run build; fi

# Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=1001:1001 /app/.next/standalone ./
COPY --from=builder --chown=1001:1001 /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
