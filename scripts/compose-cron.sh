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
#
# `compose-cron.sh --due HH MM` prints the tasks due at that UTC time, one per line, and exits:
# the schedule is tested without waiting for the clock (src/__tests__/compose-cron.test.ts).

set -u

# The tasks due at hour $1 and minute $2 (two digits each, UTC), in calling order.
due() {
  case "$2" in *0 | *5) echo outbox ;; esac
  [ "$2" = "00" ] && echo reminders
  [ "$1$2" = "0200" ] && echo cleanup
  [ "$1$2" = "0300" ] && echo release-check
  return 0
}

if [ "${1:-}" = "--due" ]; then
  due "${2:-}" "${3:-}"
  exit 0
fi

if [ -z "${CRON_SECRET:-}" ]; then
  echo "CRON_SECRET manquant : les tâches planifiées ne peuvent pas appeler l'application" >&2
  exit 1
fi
if [ -z "${APP_URL:-}" ]; then
  echo "APP_URL manquant : adresse de l'application vue depuis ce conteneur" >&2
  exit 1
fi

# One call, logged on one line. Each task has its own body file: calls run side by side.
call() {
  status=$(curl -s -o "/tmp/cron-body-$1" -w "%{http_code}" --max-time 300 \
    -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    "${APP_URL}/api/cron/$1")
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 HTTP ${status}: $(cat "/tmp/cron-body-$1" 2>/dev/null)"
}

echo "Tâches planifiées vers ${APP_URL} (heures UTC)"
while true; do
  # In the background: a long cleanup never delays the next minute's tasks.
  # Hour and minute read at once, so they belong to the same instant.
  # shellcheck disable=SC2046
  set -- $(date -u '+%H %M')
  for task in $(due "$1" "$2"); do
    call "$task" &
  done
  # Until the start of the next minute (a leading zero would read as octal).
  second=$(date -u +%S | sed 's/^0//')
  sleep $((60 - second))
done
