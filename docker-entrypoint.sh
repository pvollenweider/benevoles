#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

set -e

echo "⏳ Attente de PostgreSQL…"
until node -e "
  const net = require('net');
  const url = new URL(process.env.DATABASE_URL);
  const s = net.connect({ host: url.hostname, port: url.port || 5432 }, () => process.exit(0));
  s.on('error', () => process.exit(1));
" 2>/dev/null; do
  sleep 1
done
echo "✓ PostgreSQL prêt"

# Migrations: on by default (docker-compose / self-hosting). In Kubernetes they run once per
# deploy in a dedicated Job (k8s/job-migrate.yaml, #314) and the app pods set
# MIGRATE_ON_START=false, so pods starting during a rollout never migrate concurrently.
if [ "${MIGRATE_ON_START:-true}" != "false" ]; then
  echo "⏳ Migrations Prisma…"
  ./node_modules/.bin/prisma migrate deploy
  echo "✓ Migrations appliquées"
else
  echo "↷ Migrations ignorées (MIGRATE_ON_START=false, appliquées par le Job de migration)"
fi

exec "$@"
