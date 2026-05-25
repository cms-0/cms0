#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ADMIN_ENV_FILE="$ROOT_DIR/apps/admin/.env.e2e"
GENERATED_ENV_DIR="$ROOT_DIR/scripts/generated-env/e2e"

TARGET="admin"
MODE="reset"

usage() {
  cat >&2 <<'USAGE'
usage:
  bash scripts/e2e/prepare.sh [--target admin] [--mode preflight|reset|seed]

Defaults to --target admin --mode reset.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --)
      shift
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

case "$TARGET" in
  admin) ;;
  *)
    echo "--target must be admin for the core repo." >&2
    exit 1
    ;;
esac

case "$MODE" in
  preflight|reset|seed) ;;
  *)
    echo "--mode must be preflight, reset, or seed." >&2
    exit 1
    ;;
esac

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

resolve_command() {
  local name="$1"
  shift

  if command -v "$name" >/dev/null 2>&1; then
    command -v "$name"
    return
  fi

  for candidate in "$@"; do
    if [[ -x "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return
    fi
  done

  echo "Missing required command: $name" >&2
  exit 1
}

resolve_pg_command() {
  local name="$1"
  local candidates=()

  if [[ -n "${E2E_PG_BIN_DIR:-}" ]]; then
    candidates+=("$E2E_PG_BIN_DIR/$name")
  fi

  candidates+=(
    "/opt/homebrew/opt/libpq/bin/$name"
    "/opt/homebrew/opt/postgresql@16/bin/$name"
    "/usr/local/opt/libpq/bin/$name"
    "/usr/local/opt/postgresql@16/bin/$name"
    "/usr/bin/$name"
  )

  resolve_command "$name" "${candidates[@]}"
}

load_env_file() {
  local file="$1"
  if [[ ! -f "$file" ]]; then
    echo "Missing env file: $file" >&2
    exit 1
  fi

  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "${line//[[:space:]]/}" ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" != *"="* ]] && continue

    key="${line%%=*}"
    value="${line#*=}"
    key="${key//[[:space:]]/}"

    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue

    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" =~ ^# ]]; then
      value=""
    elif [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
      value="${value:1:${#value}-2}"
    fi

    export "$key=$value"
  done < "$file"
}

resolve_database_parts() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL must be set for E2E preparation." >&2
    exit 1
  fi

  eval "$(
    DATABASE_URL="$DATABASE_URL" node <<'NODE'
const url = new URL(process.env.DATABASE_URL);
const write = (key, value) => {
  process.stdout.write(`${key}=${JSON.stringify(value)}\n`);
};

write("DB_HOST", url.hostname);
write("DB_PORT", url.port || "5432");
write("DB_USER", decodeURIComponent(url.username || "postgres"));
write("DB_PASSWORD", decodeURIComponent(url.password || ""));
write("DB_NAME", decodeURIComponent(url.pathname.replace(/^\//, "")));
NODE
  )"
}

reset_postgres_database() {
  local label="$1"
  local pg_isready_bin dropdb_bin createdb_bin
  pg_isready_bin="$(resolve_pg_command pg_isready)"
  dropdb_bin="$(resolve_pg_command dropdb)"
  createdb_bin="$(resolve_pg_command createdb)"

  resolve_database_parts
  export PGPASSWORD="$DB_PASSWORD"

  "$pg_isready_bin" -h "$DB_HOST" -p "$DB_PORT" >/dev/null

  if [[ "$MODE" == "preflight" ]]; then
    echo "[$label] postgres preflight ok: $DB_HOST:$DB_PORT/$DB_NAME"
    return
  fi

  "$dropdb_bin" --if-exists -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  "$createdb_bin" -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"
  echo "[$label] reset postgres database: $DB_NAME"
}

resolve_path() {
  node -e 'const path = require("path"); console.log(path.resolve(process.argv[1], process.argv[2]));' "$1" "$2"
}

reset_directory() {
  local label="$1"
  local base_dir="$2"
  local configured_path="$3"
  local resolved

  if [[ -z "$configured_path" ]]; then
    return
  fi

  resolved="$(resolve_path "$base_dir" "$configured_path")"
  if [[ "$MODE" == "preflight" ]]; then
    echo "[$label] filesystem preflight ok: $resolved"
    return
  fi

  rm -rf "$resolved"
  mkdir -p "$resolved"
  echo "[$label] reset directory: $resolved"
}

run_drizzle_push() {
  local label="$1"
  local config_path="$2"
  local config_dir config_file

  config_dir="$(dirname "$config_path")"
  config_file="$(basename "$config_path")"
  if [[ "$config_dir" == "." ]]; then
    config_dir="$ROOT_DIR"
  else
    config_dir="$ROOT_DIR/$config_dir"
  fi

  if [[ "$MODE" == "preflight" ]]; then
    return
  fi

  (
    cd "$config_dir"
    DATABASE_URL="$DATABASE_URL" pnpm exec drizzle-kit push \
      --config="$config_file" \
      --force \
      >/dev/null
  )

  echo "[$label] applied drizzle schema: $config_path"
}

write_generated_env_summary() {
  local label="$1"
  mkdir -p "$GENERATED_ENV_DIR"
  {
    printf 'TARGET=%s\n' "$label"
    printf 'MODE=%s\n' "$MODE"
    printf 'DATABASE_URL=%s\n' "${DATABASE_URL:-}"
    printf 'GENERATED_AT=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "$GENERATED_ENV_DIR/$label.env"
}

ensure_admin_generated_schema_file() {
  local schema_path="$ROOT_DIR/apps/admin/db/generated/schema.ts"

  if [[ "$MODE" == "preflight" && -f "$schema_path" ]]; then
    return
  fi

  mkdir -p "$(dirname "$schema_path")"
  {
    printf '// AUTO-GENERATED FILE: cms0 content tables. Do not edit by hand.\n'
    printf 'export {};\n'
  } > "$schema_path"
}

prepare_admin() {
  load_env_file "$ADMIN_ENV_FILE"

  require_command node
  require_command pnpm
  ensure_admin_generated_schema_file
  reset_postgres_database "admin"

  if [[ -z "${CMS0_STORAGE_PATH:-}" || -z "${CMS0_BACKUPS_PATH:-}" ]]; then
    echo "CMS0_STORAGE_PATH and CMS0_BACKUPS_PATH must be set for admin E2E." >&2
    exit 1
  fi

  reset_directory "admin" "$ROOT_DIR/apps/admin" "$CMS0_STORAGE_PATH"
  reset_directory "admin" "$ROOT_DIR/apps/admin" "$CMS0_BACKUPS_PATH"
  run_drizzle_push "admin" "drizzle.e2e.config.ts"
  write_generated_env_summary "admin"
}

prepare_admin

echo "cms0 core E2E prepare complete: target=$TARGET mode=$MODE"
