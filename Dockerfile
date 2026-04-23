# ── Stage 1 : dépendances ───────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ── Stage 2 : dépendances Prisma CLI isolées ─────────────────────────────────
# Install uniquement prisma pour avoir son arbre de dépendances complet
FROM node:22-alpine AS prisma-cli
WORKDIR /prisma
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps --ignore-scripts \
    $(node -e "const v=require('./package.json').dependencies.prisma;console.log('prisma@'+v.replace(/[\^~]/,''))") \
    2>/dev/null

# ── Stage 3 : build ──────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# Valeurs factices pour le build uniquement
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

# Prisma CLI avec toutes ses dépendances (arbre complet depuis prisma-cli stage)
COPY --from=prisma-cli --chown=nextjs:nodejs /prisma/node_modules ./node_modules/prisma-deps
RUN mkdir -p ./node_modules/.bin \
 && echo '#!/bin/sh' > ./node_modules/.bin/prisma \
 && echo 'exec node /app/node_modules/prisma-deps/prisma/build/index.js "$@"' >> ./node_modules/.bin/prisma \
 && chmod +x ./node_modules/.bin/prisma \
 && chown nextjs:nodejs ./node_modules/.bin/prisma

# Script d'entrée
COPY --chown=nextjs:nodejs docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

USER nextjs
EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
