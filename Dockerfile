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
RUN npm install prisma@7.10.0 \
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
RUN --mount=type=secret,id=sentry_auth_token,env=SENTRY_AUTH_TOKEN \
    npx prisma generate && npm run build

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
COPY --from=builder --chown=nextjs:nodejs /app/GUIDE_ADMIN.md ./GUIDE_ADMIN.md
COPY --from=builder --chown=nextjs:nodejs /app/GUIDE_BENEVOLE.md ./GUIDE_BENEVOLE.md
COPY --from=builder --chown=nextjs:nodejs /app/FEATURES.md ./FEATURES.md
COPY --from=builder --chown=nextjs:nodejs /app/LOGICIEL-PLANNING-BENEVOLES.md ./LOGICIEL-PLANNING-BENEVOLES.md
COPY --from=builder --chown=nextjs:nodejs /app/ACCESSIBILITE.md ./ACCESSIBILITE.md
COPY --from=builder --chown=nextjs:nodejs /app/ACCORD-SOUS-TRAITANCE.md ./ACCORD-SOUS-TRAITANCE.md
COPY --from=builder --chown=nextjs:nodejs /app/SOUS-TRAITANTS.md ./SOUS-TRAITANTS.md
COPY --from=builder --chown=nextjs:nodejs /app/CHANGELOG.md ./CHANGELOG.md
# Documentation par tâche (#649) : guide/<slug>.md, lue de la même façon par /doc/<slug>.
COPY --from=builder --chown=nextjs:nodejs /app/guide ./guide
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
