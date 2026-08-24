#!/usr/bin/env sh
set -eu

container="${GITLEAP_POSTGRES_CONTAINER:-infra-postgres-1}"
database="gitleap_upgrade_$$"
tmp="$(mktemp -d)"

cleanup() {
  docker exec "$container" dropdb -U gitleap --if-exists "$database" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

docker exec "$container" dropdb -U gitleap --if-exists "$database" >/dev/null 2>&1 || true
docker exec "$container" createdb -U gitleap "$database"

mkdir -p "$tmp/schema" "$tmp/migrations"
cp packages/db/prisma/schema/*.prisma "$tmp/schema/"
cp packages/db/prisma/migrations/migration_lock.toml "$tmp/migrations/"
cp -R packages/db/prisma/migrations/20260814195000_processing_kernel "$tmp/migrations/"
printf 'import { defineConfig } from "prisma/config";\nexport default defineConfig({ schema: "%s/schema", migrations: { path: "%s/migrations" }, datasource: { url: process.env.DATABASE_URL } });\n' "$tmp" "$tmp" > "$tmp/prisma.config.ts"

url="postgresql://gitleap:gitleap@localhost:55432/$database"
DATABASE_URL="$url" bunx --bun prisma migrate deploy --config="$tmp/prisma.config.ts"

cp -R packages/db/prisma/migrations/20260814210000_submission_quota "$tmp/migrations/"
cp -R packages/db/prisma/migrations/20260814223000_stage_outputs "$tmp/migrations/"
cp -R packages/db/prisma/migrations/20260824130000_usage_reconciliation_marker "$tmp/migrations/"
DATABASE_URL="$url" bunx --bun prisma migrate deploy --config="$tmp/prisma.config.ts"

printf '%s\n' '{"migrationUpgrade":true,"phases":2,"migrationCount":4,"status":"passed"}'
