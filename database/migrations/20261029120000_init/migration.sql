-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('OWNER');

-- CreateEnum
CREATE TYPE "session_role" AS ENUM ('OWNER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "order_source" AS ENUM ('WHATSAPP', 'FOODPANDA', 'PHONE', 'OTHER');

-- CreateEnum
CREATE TYPE "order_status" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "order_event_type" AS ENUM ('CREATED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "user_role" NOT NULL DEFAULT 'OWNER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "role" "session_role" NOT NULL,
    "user_id" UUID,
    "device_label" TEXT,
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_pairing_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code_hash" TEXT NOT NULL,
    "device_label" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),

    CONSTRAINT "kitchen_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_day_counters" (
    "business_date" DATE NOT NULL,
    "last_number" INTEGER NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "order_day_counters_pkey" PRIMARY KEY ("business_date")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "business_date" DATE NOT NULL,
    "daily_number" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "request_hash" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" "order_source" NOT NULL,
    "prep_minutes" SMALLINT NOT NULL,
    "status" "order_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "completed_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "closed_by_user_id" UUID,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" BIGSERIAL NOT NULL,
    "order_id" UUID NOT NULL,
    "type" "order_event_type" NOT NULL,
    "actor_user_id" UUID,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "request_id" TEXT,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_role_revoked_idx" ON "sessions"("role", "revoked_at");

-- CreateIndex
CREATE INDEX "sessions_user_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_pairing_codes_code_hash_key" ON "kitchen_pairing_codes"("code_hash");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_status_created_asc_idx" ON "orders"("status", "created_at", "id");

-- CreateIndex
CREATE INDEX "orders_history_idx" ON "orders"("business_date", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "orders_business_status_idx" ON "orders"("business_date", "status", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_business_date_daily_number_key" ON "orders"("business_date", "daily_number");

-- CreateIndex
CREATE INDEX "order_events_order_occurred_idx" ON "order_events"("order_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_pairing_codes" ADD CONSTRAINT "kitchen_pairing_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma does not model CHECKs). DATABASE.md §2.
-- Verified by apps/server/tests/integration/schema-constraints.int.test.ts.
-- ---------------------------------------------------------------------------

ALTER TABLE "users"
  ADD CONSTRAINT "users_username_lowercase_chk" CHECK ("username" = lower("username")),
  ADD CONSTRAINT "users_username_length_chk" CHECK (char_length("username") BETWEEN 3 AND 32),
  ADD CONSTRAINT "users_username_charset_chk" CHECK ("username" ~ '^[a-z0-9._-]+$');

ALTER TABLE "sessions"
  ADD CONSTRAINT "sessions_device_label_length_chk" CHECK ("device_label" IS NULL OR char_length("device_label") <= 40),
  ADD CONSTRAINT "sessions_role_shape_chk" CHECK (
    ("role" = 'OWNER' AND "user_id" IS NOT NULL AND "device_label" IS NULL)
    OR ("role" = 'KITCHEN' AND "user_id" IS NULL AND "device_label" IS NOT NULL)
  );

ALTER TABLE "kitchen_pairing_codes"
  ADD CONSTRAINT "kitchen_pairing_codes_device_label_length_chk" CHECK (char_length("device_label") BETWEEN 1 AND 40);

ALTER TABLE "order_day_counters"
  ADD CONSTRAINT "order_day_counters_last_number_positive_chk" CHECK ("last_number" > 0);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_daily_number_positive_chk" CHECK ("daily_number" > 0),
  ADD CONSTRAINT "orders_text_length_chk" CHECK (char_length("text") BETWEEN 1 AND 5000),
  ADD CONSTRAINT "orders_prep_minutes_chk" CHECK ("prep_minutes" IN (20, 25)),
  ADD CONSTRAINT "orders_deadline_chk" CHECK ("deadline_at" = "created_at" + make_interval(mins => "prep_minutes")),
  ADD CONSTRAINT "orders_version_positive_chk" CHECK ("version" > 0),
  ADD CONSTRAINT "orders_status_timestamps_chk" CHECK (
    ("status" = 'ACTIVE' AND "completed_at" IS NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "cancelled_at" IS NULL)
    OR ("status" = 'CANCELLED' AND "cancelled_at" IS NOT NULL AND "completed_at" IS NULL)
  );
