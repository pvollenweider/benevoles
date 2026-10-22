#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# The scheduled tasks of a Docker Compose install (#761), run by the `cron` service of
# docker-compose.yml: the same calls and times (UTC) as the Kubernetes CronJobs (k8s/cronjob-*.yaml).
#   every 5 minutes  POST /api/cron/outbox         emails waiting in the outbox
#   every hour       POST /api/cron/reminders      reminders before each shift
#   02:00            POST /api/cron/cleanup        daily cleanup and retention
#   03:00            POST /api/cron/release-check  latest published release (RELEASE_CHECK)
# Needs APP_URL (the app as seen from this container) and CRON_SECRET (the app's own value).

set -u

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET manquant : les tâches planifiées ne peuvent pas appeler l'application" >&2
  exit 1
fi

call() {
  status=$(curl -s -o /tmp/cron-body -w "%{http_code}" --max-time 300 \
    -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    "${APP_URL}/api/cron/$1")
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 HTTP ${status}: $(cat /tmp/cron-body 2>/dev/null)"
}

echo "Tâches planifiées vers ${APP_URL} (heures UTC)"
while true; do
  minute=$(date -u +%M)
  hour=$(date -u +%H)
  case "$minute" in *0 | *5) call outbox ;; esac
  [ "$minute" = "00" ] && call reminders
  [ "$hour$minute" = "0200" ] && call cleanup
  [ "$hour$minute" = "0300" ] && call release-check
  # Until the start of the next minute (a leading zero would read as octal).
  second=$(date -u +%S | sed 's/^0//')
  sleep $((60 - second))
done
