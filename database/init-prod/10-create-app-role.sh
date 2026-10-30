#!/bin/sh
# PRODUCTION first-init only (runs once, on an empty data volume). ADR-022, SECURITY §8.
# Creates the non-superuser `rkds_app` and makes it owner of the application database.
# The image's POSTGRES_USER (superuser) is then used only for admin and backups.
set -eu

if [ -z "${RKDS_DB_APP_PASSWORD:-}" ]; then
  echo "RKDS_DB_APP_PASSWORD is not set; refusing to create rkds_app without a password." >&2
  exit 1
fi

# Values are passed as psql variables (:'x' quotes literals, :"x" quotes identifiers): no injection.
psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v app_password="$RKDS_DB_APP_PASSWORD" -v db="$POSTGRES_DB" <<'EOSQL'
CREATE ROLE rkds_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
ALTER DATABASE :"db" OWNER TO rkds_app;
ALTER SCHEMA public OWNER TO rkds_app;
EOSQL
echo "rkds_app created and set as owner of $POSTGRES_DB."
