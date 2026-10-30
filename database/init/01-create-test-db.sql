-- LOCAL DEVELOPMENT ONLY (docker-compose.dev.yml). Runs once, on an empty data volume.
-- Mirrors production (ADR-022): the app connects as the non-superuser owner `rkds_app`.
-- `rkds_admin` (the image's superuser) is only for `prisma migrate dev`, which needs a shadow DB.

CREATE ROLE rkds_app LOGIN PASSWORD 'rkds_app_dev' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;

ALTER DATABASE rkds_dev OWNER TO rkds_app;
\connect rkds_dev
ALTER SCHEMA public OWNER TO rkds_app;

CREATE DATABASE rkds_test OWNER rkds_app;
\connect rkds_test
ALTER SCHEMA public OWNER TO rkds_app;

-- Shadow database for `prisma migrate dev` (owned by rkds_app, so no superuser URL is needed).
CREATE DATABASE rkds_shadow OWNER rkds_app;
\connect rkds_shadow
ALTER SCHEMA public OWNER TO rkds_app;
