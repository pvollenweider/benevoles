# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# ── Stage 1 : dépendances app ────────────────────────────────────────────────
FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

# ── Stage 2 : prisma CLI avec toutes ses dépendances (engines inclus) ─────────
FROM node:26-alpine AS prisma-cli
WORKDIR /prisma
RUN npm install prisma@7.10.1 \
    --save-exact \
    --legacy-peer-deps \
    --no-fund \
    --no-audit

# ── Stage 3 : build Next.js ──────────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# doc-lastmod.json n'existe que si deploy.yml l'a écrit : sans lui, un objet vide (pas de lastmod
# dans le sitemap) plutôt qu'un COPY qui échoue dans l'étape runner.
RUN [ -f doc-lastmod.json ] || echo '{}' > doc-lastmod.json

ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_URL=postgresql://build:build@localhost/build
ENV AUTH_SECRET=build-placeholder-secret-32-characters-min

# NEXT_PUBLIC_SENTRY_DSN is a public value baked into the browser bundle
ARG NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA

# SENTRY_AUTH_TOKEN is only needed at build time for source-map upload;
# use --mount=type=secret so it never appears in image layers or history.
# .next/cache (Turbopack's build cache, ~350 MB) is removed in the same layer: no later build reads
# it (each one starts from a fresh layer) and the runner stage does not copy it, but deploy.yml's
# BuildKit cache export (mode=max) uploaded it to the GitHub Actions cache on every deploy.
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    npx prisma generate && npm run build && rm -rf .next/cache

# ── Stage 4 : runner ─────────────────────────────────────────────────────────
FROM node:26-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ARG GIT_SHA
ENV GIT_SHA=$GIT_SHA
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

# Guides utilisateur, rendus par /doc — fs.readFileSync() à la requête, hors du tracing
# automatique de `output: "standalone"`, donc copiés explicitement comme prisma/ ci-dessus.
COPY --from=builder --chown=nextjs:nodejs /app/content/guide/GUIDE_ADMIN.md ./content/guide/GUIDE_ADMIN.md
COPY --from=builder --chown=nextjs:nodejs /app/content/guide/GUIDE_BENEVOLE.md ./content/guide/GUIDE_BENEVOLE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/FEATURES.md ./content/pages/FEATURES.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/LOGICIEL-PLANNING-BENEVOLES.md ./content/pages/LOGICIEL-PLANNING-BENEVOLES.md
# Pages « Pour qui ? » (#872), tarifs (#950) et questions de l'accueil (#951).
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/POUR-QUI.md ./content/pages/POUR-QUI.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/BENEVOLES-FETE-DE-VILLAGE.md ./content/pages/BENEVOLES-FETE-DE-VILLAGE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/BENEVOLES-FESTIVAL.md ./content/pages/BENEVOLES-FESTIVAL.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/BENEVOLES-MANIFESTATION-SPORTIVE.md ./content/pages/BENEVOLES-MANIFESTATION-SPORTIVE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/PLANNING-PERMANENCES-BENEVOLES.md ./content/pages/PLANNING-PERMANENCES-BENEVOLES.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/TARIFS.md ./content/pages/TARIFS.md
# Tableur et groupe de discussion, ou outil dédié ? (#871).
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/TABLEUR-OU-OUTIL-DEDIE.md ./content/pages/TABLEUR-OU-OUTIL-DEDIE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/FAQ-ACCUEIL.md ./content/pages/FAQ-ACCUEIL.md
COPY --from=builder --chown=nextjs:nodejs /app/content/pages/ACCESSIBILITE.md ./content/pages/ACCESSIBILITE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/legal/ACCORD-SOUS-TRAITANCE.md ./content/legal/ACCORD-SOUS-TRAITANCE.md
COPY --from=builder --chown=nextjs:nodejs /app/content/legal/SOUS-TRAITANTS.md ./content/legal/SOUS-TRAITANTS.md
COPY --from=builder --chown=nextjs:nodejs /app/CHANGELOG.md ./CHANGELOG.md
# Blog (#944) : content/blog/<date>-<slug>.md, lu de la même façon par /blog et son flux.
COPY --from=builder --chown=nextjs:nodejs /app/content/blog ./content/blog
# Documentation par tâche (#649) : content/guide/<slug>.md, lue de la même façon par /doc/<slug>.
COPY --from=builder --chown=nextjs:nodejs /app/content/guide ./content/guide
# Date du dernier commit de chacune de ces sources (lastmod du sitemap), écrite par
# scripts/doc-lastmod.mjs dans deploy.yml avant le build ; `{}` pour un build local (étape builder).
COPY --from=builder --chown=nextjs:nodejs /app/doc-lastmod.json ./doc-lastmod.json

# Catalogue vidéo (#644) : src/lib/video-catalog.ts lit ces fichiers avec fs, hors du tracing de
# `output: "standalone"`, comme les guides ci-dessus. Le reste de videos/ (tools, assets, output)
# est exclu de l'image par .dockerignore.
COPY --from=builder --chown=nextjs:nodejs /app/videos/catalog.json ./videos/catalog.json
# Durée réelle, taille et affiches des rendus publiés (videos/tools/posters.ts).
COPY --from=builder --chown=nextjs:nodejs /app/videos/renders.json ./videos/renders.json
COPY --from=builder --chown=nextjs:nodejs /app/videos/manifests ./videos/manifests
COPY --from=builder --chown=nextjs:nodejs /app/videos/scripts ./videos/scripts
COPY --from=builder --chown=nextjs:nodejs /app/videos/MASTERCLASS_PLAN.md ./videos/MASTERCLASS_PLAN.md

# Warm-up of a new server before it takes traffic (docker-entrypoint.sh, src/lib/readiness.ts):
# plain Node, no dependency.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/warmup.mjs ./scripts/warmup.mjs
# Database URL built from POSTGRES_* when DATABASE_URL is not set (docker-entrypoint.sh, Compose).
COPY --from=builder --chown=nextjs:nodejs /app/scripts/database-url.mjs ./scripts/database-url.mjs

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
