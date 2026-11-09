#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# Restore test for the off-site backup copy (#524): picks the most recent encrypted dump from a
# local Swiss Backup mount or from the rclone remote (read-only on both), decrypts it with
# BACKUP_PASSPHRASE and checks the gzip/pg_dump envelope. By default it also loads the dump into
# a disposable PostgreSQL 16 container (no published port) and compares the row counts, so the
# backup is actually known to restore — not merely known to start with the pg_dump banner.
#
# Usage:
#   # local Swiss Backup mount (SWISSBACKUP_DIR, or the default folder if it exists)
#   BACKUP_PASSPHRASE=... ./scripts/restore-test-offsite.sh
#   SWISSBACKUP_DIR=/path/to/dumps ./scripts/restore-test-offsite.sh
#
#   # rclone remote (same Swiss Backup remote as k8s/cronjob-backup-offsite.yaml)
#   RCLONE_CONFIG=$HOME/.config/rclone/rclone.conf \
#   OFFSITE_BUCKET=<bucket> \
#   ./scripts/restore-test-offsite.sh
#
#   # without Docker: header check only
#   RESTORE_MODE=header ./scripts/restore-test-offsite.sh
#
# If BACKUP_PASSPHRASE is not set, it is read from the terminal with echo disabled; it is never
# passed on a command line. RESTORE_PG_IMAGE overrides the PostgreSQL image (default postgres:16,
# the production version).
#
# On success, prints the heartbeat command from docs/deploiement.md ("Checklist opérationnelle") to
# record on the health page — this script does not call it itself, so a local dry run never reports
# a false "restore-test" success, and CRON_SECRET is never handled on this machine.
#
# scripts/test-offsite-backup.sh exercises this script against fake rclone/docker binaries.

set -e

RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"
RESTORE_MODE="${RESTORE_MODE:-full}"
RESTORE_PG_IMAGE="${RESTORE_PG_IMAGE:-postgres:16}"
DEFAULT_SWISSBACKUP_DIR="$HOME/SwissBackup/benevol-backups/benevol-backups"

WORK=""
CONTAINER=""

cleanup() {
  trap - EXIT INT TERM
  stty echo 2>/dev/null || true
  if [ -n "$CONTAINER" ]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
  if [ -n "$WORK" ]; then
    rm -rf "$WORK"
  fi
  unset BACKUP_PASSPHRASE 2>/dev/null || true
}

on_exit() {
  status=$?
  cleanup
  exit "$status"
}

trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

case "$RESTORE_MODE" in
  full|header) ;;
  *)
    echo "ERREUR : RESTORE_MODE doit valoir 'full' ou 'header' (reçu : ${RESTORE_MODE})." >&2
    exit 1
    ;;
esac

# ---- where does the dump come from? ------------------------------------------------------
if [ -n "${SWISSBACKUP_DIR:-}" ]; then
  DUMP_DIR="$SWISSBACKUP_DIR"
  SOURCE="local"
elif [ -d "$DEFAULT_SWISSBACKUP_DIR" ]; then
  DUMP_DIR="$DEFAULT_SWISSBACKUP_DIR"
  SOURCE="local"
else
  SOURCE="rclone"
fi

if [ "$SOURCE" = "local" ]; then
  if [ ! -d "$DUMP_DIR" ]; then
    echo "ERREUR : le dossier Swiss Backup ${DUMP_DIR} n'existe pas." >&2
    exit 1
  fi
  LATEST_PATH=$(for candidate in "$DUMP_DIR"/benevoles_*.sql.gz.enc; do
    [ -f "$candidate" ] && printf '%s\n' "$candidate"
  done | sort | tail -n1)
  if [ -z "$LATEST_PATH" ]; then
    echo "ERREUR : aucun fichier benevoles_*.sql.gz.enc trouvé dans ${DUMP_DIR}." >&2
    exit 1
  fi
  LATEST=${LATEST_PATH##*/}
  echo "==> Source : montage local ${DUMP_DIR} (lecture seule)"
else
  if [ -z "${OFFSITE_BUCKET:-}" ]; then
    echo "ERREUR : OFFSITE_BUCKET n'est pas défini (container Swiss Backup)." >&2
    echo "        Définir SWISSBACKUP_DIR pour utiliser un montage local à la place." >&2
    exit 1
  fi
  REMOTE="swissbackup:${OFFSITE_BUCKET}/benevol-backups"
  echo "==> Source : remote rclone ${REMOTE} (lecture seule)"
  echo "==> Inventaire Swiss Backup (${REMOTE}) :"
  rclone lsl "$REMOTE" --config "$RCLONE_CONFIG"
  LATEST=$(rclone lsf "$REMOTE" --config "$RCLONE_CONFIG" | grep '^benevoles_.*\.sql\.gz\.enc$' | sort | tail -n1)
  if [ -z "$LATEST" ]; then
    echo "ERREUR : aucun fichier benevoles_*.sql.gz.enc trouvé sur ${REMOTE}." >&2
    exit 1
  fi
fi

echo "==> Dernier fichier : ${LATEST}"

WORK=$(mktemp -d)

# ---- passphrase: environment, or masked prompt on the terminal ----------------------------
if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  if [ ! -t 0 ]; then
    echo "ERREUR : BACKUP_PASSPHRASE n'est pas définie et l'entrée standard n'est pas un terminal." >&2
    exit 1
  fi
  printf 'Phrase secrète des sauvegardes : ' >&2
  if ! stty -echo 2>/dev/null; then
    echo "ERREUR : impossible de masquer la saisie (stty)." >&2
    exit 1
  fi
  if ! IFS= read -r BACKUP_PASSPHRASE; then
    stty echo 2>/dev/null || true
    printf '\n' >&2
    echo "ERREUR : aucune phrase secrète lue." >&2
    exit 1
  fi
  stty echo 2>/dev/null || true
  printf '\n' >&2
fi
export BACKUP_PASSPHRASE

# ---- download (rclone only; the local mount is read in place) -----------------------------
if [ "$SOURCE" = "rclone" ]; then
  echo "==> Téléchargement (lecture seule côté distant)"
  rclone copy "${REMOTE}/${LATEST}" "$WORK" --config "$RCLONE_CONFIG" --checksum -v
  INPUT="${WORK}/${LATEST}"
else
  INPUT="$LATEST_PATH"
fi

# ---- decrypt, then drop the passphrase immediately ---------------------------------------
echo "==> Déchiffrement"
DECRYPT_OK=0
if openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_PASSPHRASE \
  -in "$INPUT" -out "${WORK}/dump.sql.gz"; then
  DECRYPT_OK=1
fi
unset BACKUP_PASSPHRASE
if [ "$DECRYPT_OK" -ne 1 ]; then
  echo "ERREUR : le déchiffrement a échoué (phrase secrète incorrecte ou fichier corrompu)." >&2
  exit 1
fi

echo "==> Vérification gzip"
if ! gunzip -t "${WORK}/dump.sql.gz"; then
  echo "ERREUR : le fichier déchiffré n'est pas un gzip valide." >&2
  exit 1
fi

echo "==> Vérification du contenu (en-tête pg_dump)"
gunzip -c "${WORK}/dump.sql.gz" > "${WORK}/dump.sql"
# pg_dump starts with a "--" line; the "PostgreSQL database dump" banner is on the next one.
HEADER=$(head -n 5 "${WORK}/dump.sql" | tr '\n' ' ')
case "$HEADER" in
  *"PostgreSQL database dump"*)
    ;;
  *)
    echo "ERREUR : le fichier déchiffré ne ressemble pas à un dump pg_dump (en-tête: ${HEADER})." >&2
    exit 1
    ;;
esac
SIZE=$(wc -c < "${WORK}/dump.sql")

ORGANIZATIONS=""
EVENTS=""
VOLUNTEERS=""
REGISTRATIONS=""
MIGRATIONS=""
ERROR_COUNT=0
NON_ROLE_ERRORS=0

if [ "$RESTORE_MODE" = "full" ]; then
  echo "==> Mode : full (restauration complète dans PostgreSQL, image ${RESTORE_PG_IMAGE}, sans port publié)"
  CONTAINER="benevoles-restore-test-$$"

  echo "==> Démarrage de PostgreSQL jetable (${CONTAINER})"
  if ! docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=benevoles \
    -e POSTGRES_PASSWORD=restore-test \
    -e POSTGRES_DB=benevoles \
    "$RESTORE_PG_IMAGE" >/dev/null; then
    echo "ERREUR : impossible de démarrer le conteneur PostgreSQL." >&2
    exit 1
  fi

  echo "==> Attente de PostgreSQL (30 s max)"
  READY=0
  TRIES=0
  while [ "$TRIES" -lt 30 ]; do
    if docker exec "$CONTAINER" pg_isready -U benevoles -d benevoles >/dev/null 2>&1; then
      READY=1
      break
    fi
    TRIES=$((TRIES + 1))
    sleep 1
  done
  if [ "$READY" -ne 1 ]; then
    echo "ERREUR : PostgreSQL n'est pas prêt après 30 s." >&2
    docker logs "$CONTAINER" 2>&1 | tail -n 20 >&2 || true
    exit 1
  fi

  echo "==> Chargement du dump (cela peut prendre plusieurs minutes)"
  LOAD_STATUS=0
  if ! gunzip -c "${WORK}/dump.sql.gz" | docker exec -i "$CONTAINER" \
    psql -q -U benevoles -d benevoles >"${WORK}/load.log" 2>&1; then
    LOAD_STATUS=1
  fi

  ERROR_COUNT=$(grep -c '^ERROR' "${WORK}/load.log" 2>/dev/null || true)
  NON_ROLE_ERRORS=$(grep '^ERROR' "${WORK}/load.log" 2>/dev/null \
    | grep -v -E '^ERROR: +role ".*" does not exist' \
    | wc -l | tr -d ' ')

  if [ "$NON_ROLE_ERRORS" -gt 0 ]; then
    echo "ERREUR : ${NON_ROLE_ERRORS} erreur(s) de chargement non liée(s) à un rôle absent :" >&2
    grep '^ERROR' "${WORK}/load.log" \
      | grep -v -E '^ERROR: +role ".*" does not exist' \
      | head -n 20 >&2
    exit 1
  fi
  if [ "$LOAD_STATUS" -ne 0 ] && [ "$ERROR_COUNT" -eq 0 ]; then
    echo "ERREUR : le chargement du dump a échoué :" >&2
    tail -n 20 "${WORK}/load.log" >&2
    exit 1
  fi
  echo "==> Chargement terminé : ${ERROR_COUNT} ligne(s) ERROR, ${NON_ROLE_ERRORS} hors rôle absent"

  echo "==> Comptage des lignes restaurées"
  COUNTS_QUERY='SELECT
  (SELECT count(*) FROM "Organization"),
  (SELECT count(*) FROM "Event"),
  (SELECT count(*) FROM "Volunteer"),
  (SELECT count(*) FROM "Registration"),
  (SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL);'
  if ! COUNTS=$(docker exec "$CONTAINER" psql -q -U benevoles -d benevoles \
    -v ON_ERROR_STOP=1 -t -A -F '|' -c "$COUNTS_QUERY"); then
    echo "ERREUR : impossible de compter les lignes restaurées." >&2
    exit 1
  fi
  COUNTS=$(printf '%s\n' "$COUNTS" | tail -n1)
  case "$COUNTS" in
    *"|"*"|"*"|"*"|"*) ;;
    *)
      echo "ERREUR : comptages illisibles (${COUNTS})." >&2
      exit 1
      ;;
  esac
  ORGANIZATIONS=$(printf '%s\n' "$COUNTS" | cut -d'|' -f1)
  EVENTS=$(printf '%s\n' "$COUNTS" | cut -d'|' -f2)
  VOLUNTEERS=$(printf '%s\n' "$COUNTS" | cut -d'|' -f3)
  REGISTRATIONS=$(printf '%s\n' "$COUNTS" | cut -d'|' -f4)
  MIGRATIONS=$(printf '%s\n' "$COUNTS" | cut -d'|' -f5)

  echo "    Organization          : ${ORGANIZATIONS}"
  echo "    Event                 : ${EVENTS}"
  echo "    Volunteer             : ${VOLUNTEERS}"
  echo "    Registration          : ${REGISTRATIONS}"
  echo "    _prisma_migrations    : ${MIGRATIONS} (finished_at non nul)"

  echo "==> OK : ${LATEST} déchiffre et se recharge dans PostgreSQL (${SIZE} octets non compressés, ${ERROR_COUNT} ligne(s) ERROR)."
else
  echo "==> Mode : header (vérification d'en-tête seulement, sans Docker)"
  echo "==> OK : ${LATEST} déchiffre en un dump pg_dump valide (${SIZE} octets non compressés)."
fi

echo
echo "==> Récapitulatif"
echo "    Dump testé : ${LATEST}"
echo "    Mode       : ${RESTORE_MODE}"
if [ "$RESTORE_MODE" = "full" ]; then
  echo "    Comptes    : Organization=${ORGANIZATIONS} Event=${EVENTS} Volunteer=${VOLUNTEERS} Registration=${REGISTRATIONS} _prisma_migrations=${MIGRATIONS}"
fi
echo
echo "==> Pour l'enregistrer sur la page de santé (voir docs/deploiement.md, « Checklist opérationnelle ») :"
cat <<EOF
kubectl -n benevoles exec deploy/benevoles-app -- node -e '
fetch("http://localhost:3000/api/cron/heartbeat", {
  method: "POST",
  headers: { authorization: \`Bearer \${process.env.CRON_SECRET}\`, "content-type": "application/json" },
  body: JSON.stringify({ job: "restore-test", ok: true, summary: { dump: "${LATEST}", mode: "${RESTORE_MODE}" } }),
}).then(async r => console.log(r.status, await r.text()))'
EOF
