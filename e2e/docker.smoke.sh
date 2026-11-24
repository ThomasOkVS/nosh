#!/usr/bin/env bash
# Builds the production image and checks it end to end against a throwaway
# Postgres: health, SPA + nosniff (SEC-60), yt-dlp (design s3), and that boot
# fails naming SESSION_SECRET when it is missing (SEC-57).
# Everything it creates is removed on exit, pass or fail.
set -euo pipefail

cd "$(dirname "$0")/.."

run_id="nosh-smoke-$$-$RANDOM"
image="$run_id:test"
net="$run_id-net"
db="$run_id-db"
app="$run_id-app"
nosec="$run_id-nosecret"

cleanup() {
  docker rm -f "$app" "$nosec" "$db" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  docker image rm -f "$image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
pass() { echo "PASS: $*"; }

rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
pg_pass="$(rand)"
session_secret="$(rand)"
db_url="postgres://nosh:$pg_pass@$db:5432/nosh"

docker build --build-arg COMMIT_SHA=smoke -t "$image" . >&2

docker network create "$net" >/dev/null
docker run -d --name "$db" --network "$net" \
  -e POSTGRES_USER=nosh -e POSTGRES_PASSWORD="$pg_pass" -e POSTGRES_DB=nosh \
  postgres:17-alpine >/dev/null

# The postgres image first runs a temporary server that listens on the unix
# socket only, then restarts. Probe over TCP so we only pass once the real
# server accepts network connections, which is what the app uses.
db_ready=""
for _ in $(seq 1 90); do
  if docker exec "$db" psql -h 127.0.0.1 -U nosh -d nosh -c 'select 1' >/dev/null 2>&1; then
    db_ready=1
    break
  fi
  sleep 1
done
[ -n "$db_ready" ] || { docker logs "$db" >&2; fail "postgres did not accept TCP connections in time"; }

prod_env=(
  -e NODE_ENV=production
  -e DATABASE_URL="$db_url"
  -e ALLOWED_ORIGINS=https://example.test
  -e TRUSTED_PROXIES=192.0.2.1
)

docker run -d --name "$app" --network "$net" "${prod_env[@]}" \
  -e SESSION_SECRET="$session_secret" "$image" >/dev/null

# Probe from inside the container: no published port, nothing to collide with.
probe() { docker exec "$app" wget -qS -O - --header "Accept: text/html" "http://127.0.0.1:3001$1" 2>&1; }

ready=""
for _ in $(seq 1 60); do
  if probe /health >/dev/null 2>&1; then ready=1; break; fi
  [ "$(docker inspect -f '{{.State.Running}}' "$app")" = "true" ] || break
  sleep 1
done
[ -n "$ready" ] || { docker logs "$app" >&2; fail "app did not become healthy"; }

health="$(docker exec "$app" wget -qO - http://127.0.0.1:3001/health)"
[ "$health" = '{"status":"ok"}' ] || fail "/health returned: $health"
pass "GET /health -> {\"status\":\"ok\"}"

root="$(probe /)"
echo "$root" | grep -qi '<!doctype html' || fail "GET / is not HTML"
echo "$root" | grep -qi 'x-content-type-options: nosniff' || fail "GET / lacks nosniff"
pass "GET / -> HTML with nosniff (SEC-60)"

ytdlp="$(docker exec "$app" yt-dlp --version)"
[ -n "$ytdlp" ] || fail "yt-dlp --version printed nothing"
pass "yt-dlp $ytdlp"

# Login depends on argon2's native binding (musl prebuild on alpine).
# (cd inside sh -c: a bare "-w /app/server" gets path-mangled by Git Bash on Windows.)
docker exec "$app" sh -c 'cd /app/server && node -e "
import(\"argon2\").then(async (m) => {
  const a = m.default ?? m;
  const h = await a.hash(\"smoke\");
  if (!(await a.verify(h, \"smoke\"))) throw new Error(\"verify failed\");
}).then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
"' || fail "argon2 does not load or work in the runtime image"
pass "argon2 hashes and verifies in the runtime image"

uid="$(docker exec "$app" id -u)"
[ "$uid" != "0" ] || fail "container runs as root"
pass "runs as non-root (uid $uid)"

set +e
docker run --name "$nosec" --network "$net" "${prod_env[@]}" "$image" >/dev/null 2>"$run_id.err"
code=$?
set -e
logs="$(docker logs "$nosec" 2>&1)$(cat "$run_id.err")"
rm -f "$run_id.err"
[ "$code" -ne 0 ] || fail "boot without SESSION_SECRET exited 0"
echo "$logs" | grep -q SESSION_SECRET || fail "log does not name SESSION_SECRET: $logs"
pass "boot without SESSION_SECRET exits $code and names it (SEC-57)"

echo "docker smoke: all checks passed"
