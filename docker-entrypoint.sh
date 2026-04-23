#!/bin/sh
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

echo "⏳ Migrations Prisma…"
./node_modules/.bin/prisma migrate deploy
echo "✓ Migrations appliquées"

exec "$@"
