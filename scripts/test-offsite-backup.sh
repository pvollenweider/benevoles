#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# Local regression test for the off-site backup copy to Swiss Backup (#524, #697). No network,
# no real rclone, no real docker: fake rclone, wget and docker binaries on PATH record their
# arguments so this runs offline and never touches Swiss Backup, a container or the health
# endpoint.
#
# Covers:
#   1. The CronJob's inline script (k8s/cronjob-backup-offsite.yaml), extracted verbatim from
#      between the "OFFSITE_SCRIPT_START"/"OFFSITE_SCRIPT_END" markers: remote selection, the
#      unset-OFFSITE_BUCKET error case, and DRY_RUN=true.
#   2. scripts/restore-test-offsite.sh end to end, against fixtures encrypted the same way
#      cronjob-backup.yaml encrypts real dumps:
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
  lsf) echo "benevoles_2026-09-01_01-00.sql.gz.enc" ;;
  copy)
    # Download direction ("rclone copy <remote>/<file> <localdir> ..."): find whichever
    # argument is an existing local directory and drop a fixture file there. The upload
    # direction ("rclone copy /backups <remote> ...") has no such argument in this test, so
    # nothing is copied for it.
    dest=""
    for arg in "$@"; do
      [ -d "$arg" ] && dest="$arg"
    done
    [ -n "$dest" ] && cp "$FAKE_FIXTURE" "$dest/benevoles_2026-09-01_01-00.sql.gz.enc"
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

export PATH="$FAKEBIN:$PATH"
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

# ---- restore-test-offsite.sh, against real encrypted fixtures ----------------------------
PASSPHRASE="test-passphrase-524"

# Same first lines as a real pg_dump: the banner is on line 2, not line 1.
printf -- '--\n-- PostgreSQL database dump\n--\nSELECT 1;\n' > "$WORK/dump.sql"
gzip -c "$WORK/dump.sql" > "$WORK/dump.sql.gz"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:${PASSPHRASE}" \
  -in "$WORK/dump.sql.gz" -out "$WORK/fixture.enc"
export FAKE_FIXTURE="$WORK/fixture.enc"

# A local Swiss Backup mount with two dumps: the script must pick the most recent one.
mkdir -p "$WORK/local-dumps"
cp "$WORK/fixture.enc" "$WORK/local-dumps/benevoles_2026-09-01_01-00.sql.gz.enc"
printf -- '--\n-- PostgreSQL database dump\n--\n-- newer dump\nSELECT 2;\n' > "$WORK/dump-newer.sql"
gzip -c "$WORK/dump-newer.sql" > "$WORK/dump-newer.sql.gz"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:${PASSPHRASE}" \
  -in "$WORK/dump-newer.sql.gz" -out "$WORK/local-dumps/benevoles_2026-09-02_02-00.sql.gz.enc"

# 4. rclone mode, full restore by default
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

# 5. no bucket and no local mount: must fail fast, before calling rclone
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

# 6. wrong passphrase: rejected, and its temporary dump is removed
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

# 7. local mount, header mode: picks the most recent dump and never uses Docker
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

# 8. local mount, full restore: the image can be overridden
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

# 9. a load error that is not a missing role must fail the restore
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

# 10. a lone missing-role error is expected and must not fail the restore
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

# 11. psql may prefix its errors with "psql:<stdin>:<line>: ": still counted as load errors
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
