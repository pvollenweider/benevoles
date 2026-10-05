#!/bin/sh

# SPDX-FileCopyrightText: 2026 Philippe Vollenweider
# SPDX-License-Identifier: AGPL-3.0-only

# Local regression test for the off-site backup provider switch (#524). No network, no real
# rclone: a fake rclone and wget on PATH record their arguments so this runs offline and never
# touches Dropbox, Swiss Backup, or the health endpoint.
#
# Covers:
#   1. The CronJob's inline script (k8s/cronjob-backup-offsite.yaml), extracted verbatim from
#      between the "OFFSITE_SCRIPT_START"/"OFFSITE_SCRIPT_END" markers, for both providers,
#      the unset-OFFSITE_BUCKET error case, the unknown-provider error case, and DRY_RUN=true.
#   2. scripts/restore-test-offsite.sh end to end, for both providers, against a fixture
#      encrypted the same way cronjob-backup.yaml encrypts real dumps.
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

export PATH="$FAKEBIN:$PATH"
export FAKE_RCLONE_LOG="$WORK/rclone.log"
export FAKE_WGET_LOG="$WORK/wget.log"

run_cronjob_script() {
  # Same env the CronJob container would get, minus what we override per case.
  : > "$FAKE_RCLONE_LOG"; : > "$FAKE_WGET_LOG"
  ( CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN="${DRY_RUN:-false}" \
    OFFSITE_PROVIDER="$OFFSITE_PROVIDER" OFFSITE_BUCKET="$OFFSITE_BUCKET" \
    sh "$WORK/cronjob-script.sh" )
}

# 1. dropbox (default): remote must be dropbox:/benevol-backups
OFFSITE_PROVIDER=dropbox OFFSITE_BUCKET="" run_cronjob_script
grep -q 'rclone copy /backups dropbox:/benevol-backups' "$FAKE_RCLONE_LOG" || fail "dropbox copy target"
grep -q 'rclone delete dropbox:/benevol-backups' "$FAKE_RCLONE_LOG" || fail "dropbox delete target"
grep -q -- '--min-age 90d' "$FAKE_RCLONE_LOG" || fail "90-day retention flag missing"
pass "dropbox remote selection"

# 2. swissbackup with a bucket: remote must be swissbackup:<bucket>/benevol-backups
OFFSITE_PROVIDER=swissbackup OFFSITE_BUCKET=my-bucket run_cronjob_script
grep -q 'rclone copy /backups swissbackup:my-bucket/benevol-backups' "$FAKE_RCLONE_LOG" || fail "swissbackup copy target"
pass "swissbackup remote selection"

# 3. swissbackup without a bucket: must fail fast, before calling rclone
: > "$FAKE_RCLONE_LOG"
if ( OFFSITE_PROVIDER=swissbackup OFFSITE_BUCKET="" CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN=false \
     sh "$WORK/cronjob-script.sh" ) 2>"$WORK/err.txt"; then
  fail "swissbackup with no OFFSITE_BUCKET should have failed"
fi
grep -q "OFFSITE_BUCKET" "$WORK/err.txt" || fail "missing-bucket error message"
[ -s "$FAKE_RCLONE_LOG" ] && fail "rclone should not run when OFFSITE_BUCKET is missing"
pass "swissbackup without a bucket fails before touching rclone"

# 4. unknown provider: must fail fast
if ( OFFSITE_PROVIDER=onedrive OFFSITE_BUCKET="" CRON_SECRET=x APP_URL=http://example.invalid DRY_RUN=false \
     sh "$WORK/cronjob-script.sh" ) 2>"$WORK/err.txt"; then
  fail "unknown provider should have failed"
fi
grep -q "OFFSITE_PROVIDER inconnu" "$WORK/err.txt" || fail "unknown-provider error message"
pass "unknown OFFSITE_PROVIDER fails before touching rclone"

# 5. DRY_RUN=true appends --dry-run to copy and delete
DRY_RUN=true OFFSITE_PROVIDER=dropbox OFFSITE_BUCKET="" run_cronjob_script
[ "$(grep -c -- '--dry-run' "$FAKE_RCLONE_LOG")" = 2 ] || fail "DRY_RUN=true should add --dry-run to copy and delete (got: $(cat "$FAKE_RCLONE_LOG"))"
pass "DRY_RUN=true passes --dry-run to rclone copy and delete"

# ---- restore-test-offsite.sh, against a real encrypted fixture ----------------------------
PASSPHRASE="test-passphrase-524"
# Same first lines as a real pg_dump: the banner is on line 2, not line 1.
printf -- '--\n-- PostgreSQL database dump\n--\nSELECT 1;\n' > "$WORK/dump.sql"
gzip -c "$WORK/dump.sql" > "$WORK/dump.sql.gz"
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -pass "pass:${PASSPHRASE}" \
  -in "$WORK/dump.sql.gz" -out "$WORK/fixture.enc"
export FAKE_FIXTURE="$WORK/fixture.enc"

: > "$FAKE_RCLONE_LOG"
OUT=$(OFFSITE_PROVIDER=dropbox BACKUP_PASSPHRASE="$PASSPHRASE" RCLONE_CONFIG=/dev/null \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : benevoles_2026-09-01_01-00.sql.gz.enc" || fail "restore-test-offsite.sh (dropbox) did not report success:\n$OUT"
grep -q '^rclone lsl dropbox:/benevol-backups' "$FAKE_RCLONE_LOG" || fail "restore-test-offsite.sh should list the dropbox remote"
grep -q '^rclone copy dropbox:/benevol-backups/benevoles_2026-09-01_01-00.sql.gz.enc' "$FAKE_RCLONE_LOG" || fail "restore-test-offsite.sh should copy FROM the remote"
grep -q 'delete' "$FAKE_RCLONE_LOG" && fail "restore-test-offsite.sh must never call rclone delete (read-only on the remote)"
pass "restore-test-offsite.sh (dropbox): downloads, decrypts, validates a real fixture"

: > "$FAKE_RCLONE_LOG"
OUT=$(OFFSITE_PROVIDER=swissbackup OFFSITE_BUCKET=my-bucket BACKUP_PASSPHRASE="$PASSPHRASE" RCLONE_CONFIG=/dev/null \
  sh "$RESTORE_SCRIPT")
echo "$OUT" | grep -q "OK : benevoles_2026-09-01_01-00.sql.gz.enc" || fail "restore-test-offsite.sh (swissbackup) did not report success:\n$OUT"
grep -q '^rclone lsl swissbackup:my-bucket/benevol-backups' "$FAKE_RCLONE_LOG" || fail "restore-test-offsite.sh should list the swissbackup remote"
pass "restore-test-offsite.sh (swissbackup): downloads, decrypts, validates a real fixture"

# wrong passphrase must be rejected, not silently accepted
: > "$FAKE_RCLONE_LOG"
if OFFSITE_PROVIDER=dropbox BACKUP_PASSPHRASE="wrong-passphrase" RCLONE_CONFIG=/dev/null \
     sh "$RESTORE_SCRIPT" >"$WORK/out.txt" 2>&1; then
  fail "restore-test-offsite.sh accepted a wrong passphrase:\n$(cat "$WORK/out.txt")"
fi
pass "restore-test-offsite.sh rejects a wrong passphrase"

echo "All offsite backup tests passed."
