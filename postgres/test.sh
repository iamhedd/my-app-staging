#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PSQL_BIN="${PSQL_BIN:-psql}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required and must point to a disposable test database." >&2
  exit 1
fi

if ! command -v "$PSQL_BIN" >/dev/null 2>&1; then
  echo "psql was not found. Install the PostgreSQL 17 client or set PSQL_BIN." >&2
  exit 1
fi

"$ROOT_DIR/migrate.sh"
"$PSQL_BIN" -X "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/tests/security.sql"
echo "PostgreSQL security smoke test passed."
