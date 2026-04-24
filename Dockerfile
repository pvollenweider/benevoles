# ── Stage 1 : dépendances app ────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ── Stage 2 : prisma CLI avec toutes ses dépendances (engines inclus) ─────────
FROM node:22-alpine AS prisma-cli
WORKDIR /prisma
RUN npm install prisma@7.8.0 \
    --save-exact \
    --legacy-peer-deps \
    --no-fund \
    --no-audit

# ── Stage 3 : build Next.js ──────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost/build
ENV AUTH_SECRET=build-placeholder-secret-32-characters-min

RUN npx prisma generate && npm run build

# ── Stage 4 : runner ─────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# App Next.js standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Schéma et migrations Prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts

# Merge prisma CLI (+ toutes ses deps) dans node_modules
# Appeler index.js directement préserve __dirname = node_modules/prisma/build/
# ce qui permet de trouver prisma_schema_build_bg.wasm et tous les modules
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma/node_modules/. ./node_modules/
# Le symlink .bin/prisma pointe vers prisma/build/index.js — écrire dessus corromprait le JS.
# On le supprime et on crée un vrai wrapper shell.
RUN rm -f ./node_modules/.bin/prisma \
 && echo '#!/bin/sh' > ./node_modules/.bin/prisma \
 && echo 'exec node /app/node_modules/prisma/build/index.js "$@"' >> ./node_modules/.bin/prisma \
 && chmod +x ./node_modules/.bin/prisma

# Script d'entrée
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
