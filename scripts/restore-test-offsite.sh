#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# Restore test for the off-site backup copy (#524): lists the remote, downloads the most
# recent encrypted dump, decrypts it with BACKUP_PASSPHRASE and checks it is a valid
# gzip/pg_dump — without ever restoring it into a database, and read-only on the remote
# (only "lsf" and "copy FROM the remote", never "delete" or "sync").
#
# Usage:
#   OFFSITE_PROVIDER=dropbox|swissbackup \
#   RCLONE_CONFIG=$HOME/.config/rclone/rclone.conf \
#   OFFSITE_BUCKET=<bucket>  \  # only for swissbackup
#   BACKUP_PASSPHRASE=...    \
#   ./scripts/restore-test-offsite.sh
#
# Same provider switch as k8s/cronjob-backup-offsite.yaml (kept in sync with
# scripts/test-offsite-backup.sh, which exercises both the CronJob's script and this one
# against a fake rclone).
#
# On success, prints the heartbeat command from docs/deploiement.md ("Checklist
# opérationnelle") to record on the health page — this script does not call it itself, so a
# local dry run against a personal rclone.conf never reports a false "restore-test" success.

set -e

OFFSITE_PROVIDER="${OFFSITE_PROVIDER:-dropbox}"
RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"

case "$OFFSITE_PROVIDER" in
  dropbox)
    REMOTE="dropbox:/benevol-backups"
    ;;
  swissbackup)
    if [ -z "$OFFSITE_BUCKET" ]; then
      echo "ERREUR : OFFSITE_BUCKET n'est pas défini (requis pour swissbackup)." >&2
      exit 1
    fi
    REMOTE="swissbackup:${OFFSITE_BUCKET}/benevol-backups"
    ;;
  *)
    echo "ERREUR : OFFSITE_PROVIDER inconnu (\"${OFFSITE_PROVIDER}\"), attendu \"dropbox\" ou \"swissbackup\"." >&2
    exit 1
    ;;
esac

if [ -z "$BACKUP_PASSPHRASE" ]; then
  echo "ERREUR : BACKUP_PASSPHRASE n'est pas défini." >&2
  exit 1
fi

echo "==> Inventaire ${OFFSITE_PROVIDER} (${REMOTE}) :"
rclone lsl "$REMOTE" --config "$RCLONE_CONFIG"

LATEST=$(rclone lsf "$REMOTE" --config "$RCLONE_CONFIG" | grep '^benevoles_.*\.sql\.gz\.enc$' | sort | tail -n1)
if [ -z "$LATEST" ]; then
  echo "ERREUR : aucun fichier benevoles_*.sql.gz.enc trouvé sur ${REMOTE}." >&2
  exit 1
fi
echo "==> Dernier fichier : ${LATEST}"

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> Téléchargement (lecture seule côté distant)"
rclone copy "${REMOTE}/${LATEST}" "$TMPDIR" --config "$RCLONE_CONFIG" --checksum -v

echo "==> Déchiffrement"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "pass:${BACKUP_PASSPHRASE}" \
  -in "${TMPDIR}/${LATEST}" -out "${TMPDIR}/dump.sql.gz"

echo "==> Vérification gzip"
gunzip -t "${TMPDIR}/dump.sql.gz"

echo "==> Vérification du contenu (en-tête pg_dump)"
gunzip -c "${TMPDIR}/dump.sql.gz" > "${TMPDIR}/dump.sql"
HEADER=$(head -n1 "${TMPDIR}/dump.sql")
case "$HEADER" in
  *"PostgreSQL database dump"*)
    ;;
  *)
    echo "ERREUR : le fichier déchiffré ne ressemble pas à un dump pg_dump (en-tête: ${HEADER})." >&2
    exit 1
    ;;
esac

SIZE=$(wc -c < "${TMPDIR}/dump.sql")
echo "==> OK : ${LATEST} déchiffre en un dump pg_dump valide (${SIZE} octets non compressés)."
echo "==> Pour l'enregistrer sur la page de santé (voir docs/deploiement.md, « Checklist opérationnelle ») :"
echo "    curl -s -X POST -H \"Authorization: Bearer \$CRON_SECRET\" -H \"Content-Type: application/json\" \\"
echo "      -d '{\"job\":\"restore-test\",\"ok\":true,\"summary\":{\"dump\":\"${LATEST}\"}}' \\"
echo "      https://www.benevol.app/api/cron/heartbeat"
