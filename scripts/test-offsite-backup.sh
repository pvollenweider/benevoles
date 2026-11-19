#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# Local regression test for the nightly backup and its off-site copy to Swiss Backup (#524,
# #697). No network, no database, no real rclone, no real docker: fake rclone, wget, docker and
# pg_dump binaries on PATH record their arguments so this runs offline and never touches Swiss
# Backup, a container or the health endpoint. gpg and openssl are the real ones.
#
# Covers:
#   1. The off-site CronJob's inline script (k8s/cronjob-backup-offsite.yaml), extracted verbatim
#      from between the "OFFSITE_SCRIPT_START"/"OFFSITE_SCRIPT_END" markers: remote selection, the
#      unset-OFFSITE_BUCKET error case, DRY_RUN=true, and an upload that rclone refuses (a file
#      already sent that changed on the volume): non-zero, nothing purged.
#   2. The backup CronJob's inline script (k8s/cronjob-backup.yaml), extracted from between the
#      "BACKUP_SCRIPT_START"/"BACKUP_SCRIPT_END" markers, with only /backups and /tmp moved to a
#      temporary directory: a GnuPG file is written and verified, the rotation deletes files
#      older than 30 days in both formats (.gpg and the former .enc) and nothing else, and no
#      file is left behind when pg_dump fails, the dump is too small, the passphrase is empty or
#      the verification fails. The file it produces is then read by the restore script, and a
#      modified copy of it is refused.
#   3. scripts/restore-test-offsite.sh end to end, against a dump in the former openssl format
#      and against one in the GnuPG format:
#      - a local Swiss Backup mount with two dumps (the most recent is chosen);
#      - the rclone remote, always read-only (no delete);
#      - RESTORE_MODE=header (no Docker at all);
#      - a wrong passphrase (non-zero, no decrypted file left behind);
#      - a simulated load error (non-zero) and a lone missing-role error (success);
#      - the passphrase never appears in the recorded rclone/docker arguments, and the
#        disposable container is always removed.
#
# Run: sh scripts/test-offsite-backup.sh

set -e
REPO_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CRONJOB_YAML="$REPO_ROOT/k8s/cronjob-backup-offsite.yaml"
BACKUP_YAML="$REPO_ROOT/k8s/cronjob-backup.yaml"
RESTORE_SCRIPT="$REPO_ROOT/scripts/restore-test-offsite.sh"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
FAKEBIN="$WORK/bin"
mkdir -p "$FAKEBIN"

# Keep the restore script away from any real Swiss Backup mount in $HOME, and keep its temporary
# directories under our control so leftover decrypted dumps are detectable.
export HOME="$WORK/home"
export TMPDIR="$WORK/tmp"
mkdir -p "$HOME" "$TMPDIR"

fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "ok - $1"; }

# ---- extract the CronJob's inline script -----------------------------------------------
awk '/# >>> OFFSITE_SCRIPT_START/{flag=1} flag{print} /# <<< OFFSITE_SCRIPT_END/{flag=0}' \
  "$CRONJOB_YAML" | sed 's/^                  //' > "$WORK/cronjob-script.sh"
[ -s "$WORK/cronjob-script.sh" ] || fail "could not extract the CronJob script from $CRONJOB_YAML (markers moved?)"

# ---- fake rclone: records every invocation's arguments, one call per line ------------------
cat > "$FAKEBIN/rclone" <<'EOF'
#!/bin/sh
echo "rclone $*" >> "$FAKE_RCLONE_LOG"
case "$1" in
  lsl) echo "        0 2026-09-01 01:30:00.000000000 benevoles_2026-09-01_01-00.sql.gz.enc" ;;
  lsf) printf '%s\n' ${FAKE_REMOTE_LIST:-benevoles_2026-09-01_01-00.sql.gz.enc} ;;
  copy)
    # A refused upload: rclone copy --immutable exits 6 when a file already sent has changed.
    [ -n "${FAKE_RCLONE_COPY_FAIL:-}" ] && exit 6
    # Download direction ("rclone copy <remote>/<file> <localdir> ..."): find whichever
    # argument is an existing local directory and drop a fixture file there, under the name
    # that was asked for. The upload direction ("rclone copy /backups <remote> ...") has no
    # such argument in this test, so nothing is copied for it.
    dest=""
    for arg in "$@"; do
      [ -d "$arg" ] && dest="$arg"
    done
    [ -n "$dest" ] && cp "$FAKE_FIXTURE" "$dest/${2##*/}"
    ;;
esac
exit 0
EOF
chmod +x "$FAKEBIN/rclone"

cat > "$FAKEBIN/wget" <<'EOF'
#!/bin/sh
echo "wget $*" >> "$FAKE_WGET_LOG"
exit 0
EOF
chmod +x "$FAKEBIN/wget"

# ---- fake docker: records arguments, simulates run/pg_isready/psql/rm ---------------------
cat > "$FAKEBIN/docker" <<'EOF'
#!/bin/sh
echo "docker $*" >> "$FAKE_DOCKER_LOG"
cmd=$1
shift
case "$cmd" in
  run)
    # Record the container name given by --name so the test can check its removal.
    name=""
    prev=""
    for arg in "$@"; do
      if [ "$prev" = "--name" ]; then name=$arg; fi
      prev=$arg
    done
    [ -n "$name" ] && printf '%s\n' "$name" > "$FAKE_DOCKER_CONTAINER"
    exit 0
    ;;
  exec)
    has_i=0
    for arg in "$@"; do
      [ "$arg" = "-i" ] && has_i=1
    done
    for arg in "$@"; do
      case "$arg" in
        pg_isready)
          exit 0
          ;;
        psql)
          if [ "$has_i" = 1 ]; then
            # The dump is piped on stdin; read it and optionally emit a simulated load error.
            cat >/dev/null
            if [ -n "${FAKE_DOCKER_LOAD_ERROR:-}" ]; then
              printf '%s\n' "$FAKE_DOCKER_LOAD_ERROR"
              exit "${FAKE_DOCKER_PSQL_STATUS:-0}"
            fi
            exit 0
          else
            # The count query: fixed row counts for the five checks.
            echo "42|7|120|300|15"
            exit 0
          fi
          ;;
      esac
    done
    exit 0
    ;;
  rm|logs)
    exit 0
    ;;
esac
exit 0
EOF
chmod +x "$FAKEBIN/docker"

# ---- fake pg_dump: a dump of FAKE_PGDUMP_ROWS lines, or a failure ---------------------------
cat > "$FAKEBIN/pg_dump" <<'EOF'
#!/bin/sh
echo "pg_dump $*" >> "$FAKE_PGDUMP_LOG"
if [ -n "${FAKE_PGDUMP_FAIL:-}" ]; then
  echo "pg_dump: error: connection to server failed" >&2
  exit 1
fi
# Same first lines as a real pg_dump: the banner is on line 2, not line 1.
printf -- '--\n-- PostgreSQL database dump\n--\n'
i=0
while [ "$i" -lt "${FAKE_PGDUMP_ROWS:-200}" ]; do
  echo "INSERT INTO t VALUES ($i);"
  i=$((i + 1))
done
EOF
chmod +x "$FAKEBIN/pg_dump"

REAL_GPG=$(command -v gpg) || fail "gpg is required to run this test (GnuPG 2.2 or later)"
export PATH="$FAKEBIN:$PATH"
export FAKE_PGDUMP_LOG="$WORK/pg_dump.log"
export FAKE_RCLONE_LOG="$WORK/rclone.log"
export FAKE_WGET_LOG="$WORK/wget.log"
export FAKE_DOCKER_LOG="$WORK/docker.log"
export FAKE_DOCKER_CONTAINER="$WORK/docker-container"
export RESTORE_MODE=""
export RESTORE_PG_IMAGE=""

reset_traces() {
  : > "$FAKE_RCLONE_LOG"
  : > "$FAKE_WGET_LOG"
  : > "$FAKE_DOCKER_LOG"
  : > "$FAKE_DOCKER_CONTAINER"
}

assert_no_passphrase_in_traces() {
  if grep -Fq "$PASSPHRASE" "$FAKE_RCLONE_LOG" "$FAKE_DOCKER_LOG" 2>/dev/null; then
    fail "the backup passphrase leaked into a recorded command line"
  fi
}

assert_container_removed() {
  [ -s "$FAKE_DOCKER_CONTAINER" ] || fail "fake docker did not record a container name"
  name=$(cat "$FAKE_DOCKER_CONTAINER")
  grep -q "^docker rm -f ${name}$" "$FAKE_DOCKER_LOG" \
    || fail "container ${name} was not removed (docker log: $(cat "$FAKE_DOCKER_LOG"))"
}

assert_no_decrypted_left() {
  leftovers=$(find "$TMPDIR" -type f -name 'dump.sql.gz' 2>/dev/null)
  [ -z "$leftovers" ] || fail "a decrypted dump was left behind: $leftovers"
}

run_cronjob_script() {
  # Same env the CronJob container would get, minus what we override per case.
  : > "$FAKE_RCLONE_LOG"; : > "$FAKE_WGET_LOG"
  ( CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN="${DRY_RUN:-false}" \
    OFFSITE_BUCKET="$OFFSITE_BUCKET" \
    sh "$WORK/cronjob-script.sh" )
}

# 1. remote must be swissbackup:<bucket>/benevol-backups, with the 90-day purge
OFFSITE_BUCKET=my-bucket run_cronjob_script
grep -q 'rclone copy /backups swissbackup:my-bucket/benevol-backups' "$FAKE_RCLONE_LOG" || fail "swissbackup copy target"
grep -q 'rclone delete swissbackup:my-bucket/benevol-backups' "$FAKE_RCLONE_LOG" || fail "swissbackup delete target"
grep -q -- '--min-age 90d' "$FAKE_RCLONE_LOG" || fail "90-day retention flag missing"
pass "swissbackup remote selection"

# 1b. the upload never writes over a file already sent; the purge and the inventory never get the flag
grep 'rclone copy /backups ' "$FAKE_RCLONE_LOG" | grep -q -- '--checksum --immutable' || fail "the upload must pass --checksum --immutable"
[ "$(grep -c -- '--immutable' "$FAKE_RCLONE_LOG")" = 1 ] || fail "--immutable belongs to the upload only"
pass "upload with --immutable"

# 1c. a refused upload (a file already sent has changed on the volume): non-zero, nothing purged
: > "$FAKE_RCLONE_LOG"
if ( FAKE_RCLONE_COPY_FAIL=1 OFFSITE_BUCKET=my-bucket CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN=false \
     sh "$WORK/cronjob-script.sh" ) 2>"$WORK/err.txt"; then
  fail "a refused upload should have failed the job"
fi
grep -q "ERREUR" "$WORK/err.txt" || fail "refused-upload error message"
grep -q 'rclone delete' "$FAKE_RCLONE_LOG" && fail "nothing may be purged after a refused upload"
pass "a refused upload fails the job before the purge"

# 2. without a bucket: must fail fast, before calling rclone
: > "$FAKE_RCLONE_LOG"
if ( OFFSITE_BUCKET="" CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN=false \
     sh "$WORK/cronjob-script.sh" ) 2>"$WORK/err.txt"; then
  fail "no OFFSITE_BUCKET should have failed"
fi
grep -q "OFFSITE_BUCKET" "$WORK/err.txt" || fail "missing-bucket error message"
[ -s "$FAKE_RCLONE_LOG" ] && fail "rclone should not run when OFFSITE_BUCKET is missing"
pass "no OFFSITE_BUCKET fails before touching rclone"

# 3. DRY_RUN=true appends --dry-run to copy and delete
DRY_RUN=true OFFSITE_BUCKET=my-bucket run_cronjob_script
[ "$(grep -c -- '--dry-run' "$FAKE_RCLONE_LOG")" = 2 ] || fail "DRY_RUN=true should add --dry-run to copy and delete (got: $(cat "$FAKE_RCLONE_LOG"))"
pass "DRY_RUN=true passes --dry-run to rclone copy and delete"

PASSPHRASE="test-passphrase-524"

# The former format (openssl, written until the GnuPG format replaced it): fixtures for the
# rotation and for the restore script, which must keep reading it.
encrypt_old_format() {
  ( export OLD_FORMAT_PASS="$PASSPHRASE"
    openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass env:OLD_FORMAT_PASS -in "$1" -out "$2" )
}

# Same first lines as a real pg_dump: the banner is on line 2, not line 1.
printf -- '--\n-- PostgreSQL database dump\n--\nSELECT 1;\n' > "$WORK/dump.sql"
gzip -c "$WORK/dump.sql" > "$WORK/dump.sql.gz"
encrypt_old_format "$WORK/dump.sql.gz" "$WORK/fixture.enc"
export FAKE_FIXTURE="$WORK/fixture.enc"

# ---- the backup CronJob's inline script, with the fake pg_dump -----------------------------
# /tmp first: on Linux the temporary directory itself is under /tmp.
BACKUPS="$WORK/backups"
JOBTMP="$WORK/jobtmp"
mkdir -p "$BACKUPS" "$JOBTMP"
awk '/# >>> BACKUP_SCRIPT_START/{flag=1} flag{print} /# <<< BACKUP_SCRIPT_END/{flag=0}' \
  "$BACKUP_YAML" | sed 's/^                  //' \
  | sed -e "s#/tmp/#${JOBTMP}/#g" -e "s#/backups#${BACKUPS}#g" > "$WORK/backup-script.sh"
[ -s "$WORK/backup-script.sh" ] || fail "could not extract the backup script from $BACKUP_YAML (markers moved?)"
grep -q '^set -e$' "$WORK/backup-script.sh" || fail "the backup script must run under set -e"

# Each run in a subshell, so a variable set for one case never reaches the next one.
run_backup_script() {
  : > "$FAKE_PGDUMP_LOG"
  ( export BACKUP_PASSPHRASE="${JOB_PASSPHRASE-$PASSPHRASE}"
    sh "$WORK/backup-script.sh" )
}

new_format_files() {
  for f in "$BACKUPS"/benevoles_*.sql.gz.gpg; do
    if [ -f "$f" ]; then printf '%s\n' "$f"; fi
  done
}

assert_job_left_nothing() {
  [ -z "$(new_format_files)" ] || fail "$1 left a backup file behind: $(new_format_files)"
}

# 4. failures first, on an empty volume: none of them may leave a file for the off-site copy
if ( JOB_PASSPHRASE=""; run_backup_script ) >"$WORK/out.txt" 2>&1; then
  fail "the backup script accepted an empty passphrase"
fi
grep -q "BACKUP_PASSPHRASE est vide" "$WORK/out.txt" || fail "empty-passphrase error message missing"
[ -s "$FAKE_PGDUMP_LOG" ] && fail "pg_dump should not run without a passphrase"
assert_job_left_nothing "an empty passphrase"

if ( export FAKE_PGDUMP_FAIL=1; run_backup_script ) >"$WORK/out.txt" 2>&1; then
  fail "the backup script succeeded although pg_dump failed"
fi
assert_job_left_nothing "a failing pg_dump"

if ( export FAKE_PGDUMP_ROWS=0; run_backup_script ) >"$WORK/out.txt" 2>&1; then
  fail "the backup script accepted a dump under 1 KiB"
fi
grep -q "dump anormalement petit" "$WORK/out.txt" || fail "small-dump error message missing"
assert_job_left_nothing "a dump that is too small"

# A gpg that encrypts but cannot decrypt: the verification fails, the file must be removed.
mkdir -p "$WORK/badgpg"
cat > "$WORK/badgpg/gpg" <<EOF
#!/bin/sh
for arg in "\$@"; do
  [ "\$arg" = "--decrypt" ] && exit 2
done
exec "$REAL_GPG" "\$@"
EOF
chmod +x "$WORK/badgpg/gpg"
if ( PATH="$WORK/badgpg:$PATH"; run_backup_script ) >"$WORK/out.txt" 2>&1; then
  fail "the backup script kept a file it could not decrypt back"
fi
grep -q "vérification échouée" "$WORK/out.txt" || fail "failed-verification error message missing:\n$(cat "$WORK/out.txt")"
assert_job_left_nothing "a failed verification"
pass "backup script: empty passphrase, failing pg_dump, small dump and failed verification leave no file"

# 5. a normal run next to older files: one recent and one expired file of the former format,
#    one expired file of the current format, and an expired file that is not a backup
encrypt_old_format "$WORK/dump.sql.gz" "$BACKUPS/benevoles_2026-09-01_01-00.sql.gz.enc"
cp "$WORK/fixture.enc" "$BACKUPS/benevoles_2026-01-01_01-00.sql.gz.enc"
cp "$WORK/fixture.enc" "$BACKUPS/benevoles_2026-01-02_01-00.sql.gz.gpg"
echo "not a backup" > "$BACKUPS/notes.txt"
touch -t 202601010100 "$BACKUPS/benevoles_2026-01-01_01-00.sql.gz.enc" \
  "$BACKUPS/benevoles_2026-01-02_01-00.sql.gz.gpg" "$BACKUPS/notes.txt"

OUT=$(run_backup_script 2>"$WORK/err.txt") || fail "the backup script failed:\n$(cat "$WORK/err.txt")"
echo "$OUT" | grep -q "Vérifié : déchiffrement + décompression redonnent" || fail "verification line missing:\n$OUT"
echo "$OUT" | grep -q "==> *2 ancien(s) backup(s) supprimé(s)" || fail "the rotation should delete one expired file of each format:\n$OUT"
[ -e "$BACKUPS/benevoles_2026-01-01_01-00.sql.gz.enc" ] && fail "the expired .enc file was not rotated"
[ -e "$BACKUPS/benevoles_2026-01-02_01-00.sql.gz.gpg" ] && fail "the expired .gpg file was not rotated"
[ -f "$BACKUPS/benevoles_2026-09-01_01-00.sql.gz.enc" ] || fail "a recent .enc file must be kept"
[ -f "$BACKUPS/notes.txt" ] || fail "the rotation must only delete backup files"
[ "$(new_format_files | wc -l | tr -d ' ')" = 1 ] || fail "exactly one new .gpg file expected, got: $(new_format_files)"
NEW_BACKUP=$(new_format_files)
echo "$OUT" | grep -q "${NEW_BACKUP##*/}" || fail "the inventory should list the new file:\n$OUT"
echo "$OUT" | grep -q "benevoles_2026-09-01_01-00.sql.gz.enc" || fail "the inventory should list the kept .enc file:\n$OUT"
[ -z "$(ls -A "$JOBTMP")" ] || fail "the backup script left files in /tmp: $(ls -A "$JOBTMP")"
grep -Fq "$PASSPHRASE" "$FAKE_PGDUMP_LOG" && fail "the passphrase leaked into pg_dump's arguments"
# An OpenPGP symmetric-key packet, version 4, cipher 9 (AES256), with the integrity check
# (mdc_method 2): the format every gpg 2.2+ reads. Version 5 would be OCB.
printf '%s\n' "$PASSPHRASE" | "$REAL_GPG" --batch --no-tty --pinentry-mode loopback --passphrase-fd 0 \
  --list-packets "$NEW_BACKUP" >"$WORK/packets.txt" 2>&1 || fail "gpg could not list the packets of the new file:\n$(cat "$WORK/packets.txt")"
grep -q "symkey enc packet: version 4, cipher 9" "$WORK/packets.txt" || fail "the new file should be AES256, OpenPGP v4:\n$(cat "$WORK/packets.txt")"
grep -q "mdc_method: 2" "$WORK/packets.txt" || fail "the new file should carry gpg's integrity check:\n$(cat "$WORK/packets.txt")"
pass "backup script: GnuPG file written and verified, 30-day rotation of both formats"

# 6. a second run right away overwrites its own file instead of failing
run_backup_script >"$WORK/out.txt" 2>&1 || fail "a second backup run failed:\n$(cat "$WORK/out.txt")"
pass "backup script: can run again right away"

# 7. the restore script reads what the backup script wrote (the most recent file of the two formats)
NEW_BACKUP=$(new_format_files | sort | tail -n1)
reset_traces
OUT=$(SWISSBACKUP_DIR="$BACKUPS" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=header \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : ${NEW_BACKUP##*/}" || fail "the restore script did not validate the file written by the backup script:\n$OUT"
[ -s "$FAKE_DOCKER_LOG" ] && fail "header mode must not call docker"
assert_no_decrypted_left
pass "restore-test-offsite.sh reads the GnuPG file written by the backup script"

# 8. one byte changed in the middle of that file: decryption must fail (openssl's CBC did not)
mkdir -p "$WORK/tampered"
TAMPERED="$WORK/tampered/${NEW_BACKUP##*/}"
cp "$NEW_BACKUP" "$TAMPERED"
MIDDLE=$(( $(wc -c < "$TAMPERED") / 2 ))
BYTE=$(od -An -tu1 -j "$MIDDLE" -N1 "$TAMPERED" | tr -d ' ')
printf "$(printf '\\%03o' $(( (BYTE + 1) % 256 )))" | dd of="$TAMPERED" bs=1 seek="$MIDDLE" conv=notrunc 2>/dev/null
cmp -s "$NEW_BACKUP" "$TAMPERED" && fail "the tampered copy is identical to the original"
[ "$(wc -c < "$TAMPERED")" = "$(wc -c < "$NEW_BACKUP")" ] || fail "tampering changed the file size"
reset_traces
if SWISSBACKUP_DIR="$WORK/tampered" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=full \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh accepted a modified GnuPG file:\n$(cat "$WORK/out.txt")"
fi
grep -q "déchiffrement a échoué" "$WORK/out.txt" || fail "tampered-file error message missing:\n$(cat "$WORK/out.txt")"
[ -s "$FAKE_DOCKER_LOG" ] && fail "docker should not start when the file was modified"
assert_no_decrypted_left
pass "restore-test-offsite.sh refuses a GnuPG file modified after encryption"

# 9. wrong passphrase on a GnuPG file
reset_traces
if SWISSBACKUP_DIR="$BACKUPS" BACKUP_PASSPHRASE="wrong-passphrase" RESTORE_MODE=header \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh accepted a wrong passphrase on a GnuPG file"
fi
grep -q "déchiffrement a échoué" "$WORK/out.txt" || fail "wrong-passphrase error message missing (GnuPG)"
assert_no_decrypted_left
pass "restore-test-offsite.sh rejects a wrong passphrase on a GnuPG file"

# 10. rclone mode with both formats on the remote: the GnuPG file, more recent, is the one restored
reset_traces
OUT=$(OFFSITE_BUCKET=my-bucket BACKUP_PASSPHRASE="$PASSPHRASE" RCLONE_CONFIG=/dev/null \
  SWISSBACKUP_DIR="" RESTORE_MODE=full FAKE_FIXTURE="$NEW_BACKUP" \
  FAKE_REMOTE_LIST="benevoles_2026-09-01_01-00.sql.gz.enc benevoles_2026-09-02_01-00.sql.gz.gpg notes.txt" \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : benevoles_2026-09-02_01-00.sql.gz.gpg" || fail "the GnuPG file on the remote should be restored:\n$OUT"
grep -q '^rclone copy swissbackup:my-bucket/benevol-backups/benevoles_2026-09-02_01-00.sql.gz.gpg' "$FAKE_RCLONE_LOG" || fail "the GnuPG file should be copied FROM the remote"
echo "$OUT" | grep -q "Organization.*42" || fail "counts missing after a GnuPG restore:\n$OUT"
assert_container_removed
assert_no_passphrase_in_traces
assert_no_decrypted_left
pass "restore-test-offsite.sh: rclone full restore of a GnuPG file, the most recent of both formats"

# ---- restore-test-offsite.sh, against the former openssl format ---------------------------

# A local Swiss Backup mount with two dumps: the script must pick the most recent one.
mkdir -p "$WORK/local-dumps"
cp "$WORK/fixture.enc" "$WORK/local-dumps/benevoles_2026-09-01_01-00.sql.gz.enc"
printf -- '--\n-- PostgreSQL database dump\n--\n-- newer dump\nSELECT 2;\n' > "$WORK/dump-newer.sql"
gzip -c "$WORK/dump-newer.sql" > "$WORK/dump-newer.sql.gz"
encrypt_old_format "$WORK/dump-newer.sql.gz" "$WORK/local-dumps/benevoles_2026-09-02_02-00.sql.gz.enc"

# 11. rclone mode, full restore by default
reset_traces
OUT=$(OFFSITE_BUCKET=my-bucket BACKUP_PASSPHRASE="$PASSPHRASE" RCLONE_CONFIG=/dev/null \
  SWISSBACKUP_DIR="" RESTORE_MODE=full \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : benevoles_2026-09-01_01-00.sql.gz.enc" || fail "restore-test-offsite.sh did not report success:\n$OUT"
echo "$OUT" | grep -q "Mode : full" || fail "restore-test-offsite.sh should report the full mode:\n$OUT"
echo "$OUT" | grep -q "Organization.*42" || fail "Organization count missing:\n$OUT"
echo "$OUT" | grep -q "Event.*7" || fail "Event count missing:\n$OUT"
echo "$OUT" | grep -q "Volunteer.*120" || fail "Volunteer count missing:\n$OUT"
echo "$OUT" | grep -q "Registration.*300" || fail "Registration count missing:\n$OUT"
echo "$OUT" | grep -q "_prisma_migrations.*15" || fail "migration count missing:\n$OUT"
grep -q '^rclone lsl swissbackup:my-bucket/benevol-backups' "$FAKE_RCLONE_LOG" || fail "restore-test-offsite.sh should list the swissbackup remote"
grep -q '^rclone copy swissbackup:my-bucket/benevol-backups/benevoles_2026-09-01_01-00.sql.gz.enc' "$FAKE_RCLONE_LOG" || fail "restore-test-offsite.sh should copy FROM the remote"
grep -q 'delete' "$FAKE_RCLONE_LOG" && fail "restore-test-offsite.sh must never call rclone delete (read-only on the remote)"
grep -q '^docker run -d --name ' "$FAKE_DOCKER_LOG" || fail "restore-test-offsite.sh should start a disposable PostgreSQL container"
grep -q -- ' -p ' "$FAKE_DOCKER_LOG" && fail "the restore container must not publish a port"
grep -q 'postgres:16' "$FAKE_DOCKER_LOG" || fail "the default PostgreSQL image should be postgres:16"
assert_container_removed
assert_no_passphrase_in_traces
assert_no_decrypted_left
pass "restore-test-offsite.sh: rclone full restore, counts, read-only remote"

# 12. no bucket and no local mount: must fail fast, before calling rclone
reset_traces
if OFFSITE_BUCKET="" BACKUP_PASSPHRASE="$PASSPHRASE" RCLONE_CONFIG=/dev/null \
     SWISSBACKUP_DIR="" RESTORE_MODE=full \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh without OFFSITE_BUCKET should have failed"
fi
grep -q "OFFSITE_BUCKET" "$WORK/out.txt" || fail "restore-test-offsite.sh missing-bucket error message"
[ -s "$FAKE_RCLONE_LOG" ] && fail "restore-test-offsite.sh should not run rclone when OFFSITE_BUCKET is missing"
[ -s "$FAKE_DOCKER_LOG" ] && fail "restore-test-offsite.sh should not run docker without a dump"
pass "restore-test-offsite.sh without OFFSITE_BUCKET fails before touching rclone"

# 13. wrong passphrase: rejected, and its temporary dump is removed
reset_traces
if OFFSITE_BUCKET=my-bucket BACKUP_PASSPHRASE="wrong-passphrase" RCLONE_CONFIG=/dev/null \
     SWISSBACKUP_DIR="" RESTORE_MODE=full \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh accepted a wrong passphrase:\n$(cat "$WORK/out.txt")"
fi
grep -q "déchiffrement a échoué" "$WORK/out.txt" || fail "wrong-passphrase error message missing"
[ -s "$FAKE_DOCKER_LOG" ] && fail "docker should not start when decryption fails"
assert_no_decrypted_left
pass "restore-test-offsite.sh rejects a wrong passphrase and removes the decrypted dump"

# 14. local mount, header mode: picks the most recent dump and never uses Docker
reset_traces
OUT=$(SWISSBACKUP_DIR="$WORK/local-dumps" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=header \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "Mode : header" || fail "header mode should be reported:\n$OUT"
echo "$OUT" | grep -q "benevoles_2026-09-02_02-00.sql.gz.enc" || fail "the most recent local dump should be chosen:\n$OUT"
echo "$OUT" | grep -q "OK : benevoles_2026-09-02_02-00.sql.gz.enc" || fail "header mode did not validate the latest dump:\n$OUT"
echo "$OUT" | grep -q "2026-09-01" && fail "the older local dump should not be chosen:\n$OUT"
[ -s "$FAKE_DOCKER_LOG" ] && fail "header mode must not call docker"
[ -s "$FAKE_RCLONE_LOG" ] && fail "local mount mode must not call rclone"
assert_no_decrypted_left
pass "restore-test-offsite.sh: local mount, latest dump, header mode without Docker"

# 15. local mount, full restore: the image can be overridden
reset_traces
OUT=$(SWISSBACKUP_DIR="$WORK/local-dumps" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=full \
  RESTORE_PG_IMAGE="postgres:16-test" sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "benevoles_2026-09-02_02-00.sql.gz.enc" || fail "the most recent local dump should be chosen:\n$OUT"
echo "$OUT" | grep -q "Mode : full" || fail "full mode should be reported:\n$OUT"
echo "$OUT" | grep -q "Organization.*42" || fail "Organization count missing in local mode:\n$OUT"
grep -q 'postgres:16-test' "$FAKE_DOCKER_LOG" || fail "RESTORE_PG_IMAGE should override the image"
[ -s "$FAKE_RCLONE_LOG" ] && fail "local mount mode must not call rclone"
assert_container_removed
assert_no_passphrase_in_traces
assert_no_decrypted_left
pass "restore-test-offsite.sh: local mount full restore with RESTORE_PG_IMAGE"

# 16. a load error that is not a missing role must fail the restore
reset_traces
if SWISSBACKUP_DIR="$WORK/local-dumps" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=full \
     FAKE_DOCKER_LOAD_ERROR='ERROR:  relation "public.Organization" does not exist' \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh accepted a real load error:\n$(cat "$WORK/out.txt")"
fi
grep -q "non liée(s) à un rôle absent" "$WORK/out.txt" || fail "non-role load error message missing"
grep -q "Comptage des lignes" "$WORK/out.txt" && fail "counts should not run after a real load error"
assert_container_removed
assert_no_passphrase_in_traces
assert_no_decrypted_left
pass "restore-test-offsite.sh fails on a load error other than a missing role"

# 17. a lone missing-role error is expected and must not fail the restore
reset_traces
OUT=$(SWISSBACKUP_DIR="$WORK/local-dumps" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=full \
  FAKE_DOCKER_LOAD_ERROR='ERROR:  role "postgres" does not exist' \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : benevoles_2026-09-02_02-00.sql.gz.enc" || fail "a lone missing-role error should still succeed:\n$OUT"
echo "$OUT" | grep -q "1 ligne(s) ERROR, 0 hors rôle absent" || fail "the missing-role error should be reported and tolerated:\n$OUT"
echo "$OUT" | grep -q "Organization.*42" || fail "counts should run after a tolerated role error:\n$OUT"
assert_container_removed
assert_no_passphrase_in_traces
assert_no_decrypted_left
pass "restore-test-offsite.sh tolerates a lone missing-role error"

# 18. psql may prefix its errors with "psql:<stdin>:<line>: ": still counted as load errors
reset_traces
if SWISSBACKUP_DIR="$WORK/local-dumps" BACKUP_PASSPHRASE="$PASSPHRASE" RESTORE_MODE=full \
     FAKE_DOCKER_LOAD_ERROR='psql:<stdin>:12: ERROR:  relation "public.Organization" does not exist' \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh missed a prefixed load error:\n$(cat "$WORK/out.txt")"
fi
grep -q "non liée(s) à un rôle absent" "$WORK/out.txt" || fail "prefixed load error message missing"
assert_container_removed
assert_no_decrypted_left
pass "restore-test-offsite.sh counts psql-prefixed load errors"

echo "All offsite backup tests passed."
