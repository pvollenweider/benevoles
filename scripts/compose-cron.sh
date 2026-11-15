#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# The scheduled tasks of a Docker Compose install (#761), run by the `cron` service of
# docker-compose.yml: the same calls and times (UTC) as the Kubernetes CronJobs (k8s/cronjob-*.yaml).
# A call is cut after 280 seconds, under the shortest period: a task never overlaps itself, as
# with `concurrencyPolicy: Forbid` on Kubernetes.
#   every 5 minutes  POST /api/cron/outbox         emails waiting in the outbox
#   every hour       POST /api/cron/reminders      reminders before each shift
#   02:00            POST /api/cron/cleanup        daily cleanup and retention
#   03:00            POST /api/cron/release-check  latest published release (RELEASE_CHECK)
# Needs APP_URL (the app as seen from this container) and CRON_SECRET (the app's own value).
#
# `compose-cron.sh --due HH MM` prints the tasks due at that UTC time, one per line, and exits:
# `compose-cron.sh --until-next-minute SS` prints the seconds to sleep from second SS. Both let
# the schedule be tested without waiting for the clock (src/__tests__/compose-cron.test.ts).

set -u

# The tasks due at hour $1 and minute $2 (two digits each, UTC), in calling order.
due() {
  case "$2" in *0 | *5) echo outbox ;; esac
  [ "$2" = "00" ] && echo reminders
  [ "$1$2" = "0200" ] && echo cleanup
  [ "$1$2" = "0300" ] && echo release-check
  return 0
}

# Seconds until the start of the next minute, from the seconds of one clock reading (a leading
# zero would read as octal).
until_next_minute() {
  echo $((60 - $(echo "$1" | sed 's/^0//')))
}

if [ "${1:-}" = "--due" ]; then
  due "${2:-}" "${3:-}"
  exit 0
fi
if [ "${1:-}" = "--until-next-minute" ]; then
  until_next_minute "${2:-}"
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

# One call, logged on one line. Each call has its own body file: calls run side by side, and a
# slow one may still be running when the same task is due again.
call() {
  body="/tmp/cron-body-$1-$(date -u +%H%M%S)"
  status=$(curl -s -o "$body" -w "%{http_code}" --max-time 280 \
    -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    -H "Content-Type: application/json" \
    "${APP_URL}/api/cron/$1")
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1 HTTP ${status}: $(cat "$body" 2>/dev/null)"
  rm -f "$body"
}

echo "Tâches planifiées vers ${APP_URL} (heures UTC)"
# Start on a minute boundary, without calling anything for the minute already under way: a
# restart in the middle of a due minute must not call its tasks a second time (the reminders are
# not safe to run twice at once). The price: a restart during a due minute skips that minute.
sleep "$(until_next_minute "$(date -u +%S)")"
last=""
while true; do
  # Hour, minute and second from one reading, so they belong to the same instant.
  # shellcheck disable=SC2046
  set -- $(date -u '+%H %M %S')
  # Each minute at most once, even if the loop wakes twice in it. Nothing is caught up after a
  # suspended host or a clock jump: the next due time simply applies.
  if [ "$1$2" != "$last" ]; then
    last="$1$2"
    for task in $(due "$1" "$2"); do
      # In the background: a long cleanup never delays the next minute's tasks.
      call "$task" &
    done
  fi
  sleep "$(until_next_minute "$3")"
done
