#!/usr/bin/env bash
# Starts the docker-less local stack used for development and E2E tests.
# Expects binaries in $STACK (default /home/claude/stack): pgdata, postgrest, auth/.
set -euo pipefail
STACK=${STACK:-/home/claude/stack}
APP=$(cd "$(dirname "$0")/../.." && pwd)
PG=${PG_BIN:-/usr/lib/postgresql/16/bin}
up() { curl -s -o /dev/null --max-time 1 "$1"; }
if ! pg_isready -h localhost -p 54322 -q; then
  su claude -c "$PG/pg_ctl -D $STACK/pgdata -o '-p 54322 -k /tmp -c listen_addresses=localhost' -l $STACK/pg.log start" >/dev/null
  for _ in $(seq 30); do pg_isready -h localhost -p 54322 -q && break; sleep 0.5; done
fi
pgrep -f "smtp-sink.py" >/dev/null || (cd "$STACK" && nohup python3 "$APP/scripts/local-stack/smtp-sink.py" "$STACK/mail" > smtp.log 2>&1 &)
pgrep -x auth >/dev/null || (cd "$STACK/auth" && set -a && . ../auth.env && set +a && nohup ./auth > ../auth.log 2>&1 &)
pgrep -f "postgrest postgrest.conf" >/dev/null || (cd "$STACK" && nohup ./postgrest postgrest.conf > postgrest.log 2>&1 &)
pgrep -f "local-stack/gateway.mjs" >/dev/null || (cd "$STACK" && nohup node "$APP/scripts/local-stack/gateway.mjs" > gateway.log 2>&1 &)
for _ in $(seq 40); do up http://localhost:54321/auth/v1/health && up http://localhost:54321/rest/v1/ && break; sleep 0.5; done
echo "stack up: db :54322, auth :9999, rest :3001, gateway :54321, smtp :2500"
