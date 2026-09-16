#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/migrations"
PSQL_BIN="${PSQL_BIN:-psql}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
  echo "psql was not found. Install the PostgreSQL 17 client or set PSQL_BIN." >&2
  exit 1
fi

checksum_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

"$PSQL_BIN" -X "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
create table if not exists public.schema_migrations (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now(),
  constraint schema_migrations_name_not_blank check (btrim(name) <> ''),
  constraint schema_migrations_checksum_sha256 check (checksum ~ '^[0-9a-f]{64}$')
);
revoke all on table public.schema_migrations from public;
SQL

shopt -s nullglob
migrations=("$MIGRATIONS_DIR"/*.sql)
if (( ${#migrations[@]} == 0 )); then
  echo "No migrations found in $MIGRATIONS_DIR" >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  name="$(basename "$migration")"
  checksum="$(checksum_file "$migration")"
  stored_checksum="$({
    "$PSQL_BIN" -X "$DATABASE_URL" -v ON_ERROR_STOP=1 -v name="$name" -Atq <<'SQL'
select checksum
from public.schema_migrations
where name = :'name';
SQL
  } | tr -d '[:space:]')"

  if [[ -n "$stored_checksum" ]]; then
    if [[ "$stored_checksum" != "$checksum" ]]; then
      echo "Checksum mismatch for already-applied migration $name." >&2
      exit 1
    fi
    echo "skip  $name"
    continue
  fi

  echo "apply $name"
  {
    printf '%s\n' 'begin;'
    printf '%s\n' "select pg_advisory_xact_lock(hashtextextended('gavapp:schema-migrations', 0));"
    sed '/^[[:space:]]*--/d' "$migration"
    printf '%s\n' "insert into public.schema_migrations (name, checksum) values (:'name', :'checksum') on conflict (name) do nothing;"
    printf '%s\n' 'commit;'
  } | "$PSQL_BIN" -X "$DATABASE_URL" \
      -v ON_ERROR_STOP=1 \
      -v name="$name" \
      -v checksum="$checksum"
done

echo "PostgreSQL migrations are up to date."
