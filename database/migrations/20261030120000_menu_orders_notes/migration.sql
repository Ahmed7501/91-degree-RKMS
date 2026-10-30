-- ADR-027: menu orders and kitchen notes. Expand-only and backward compatible (DATABASE.md §5):
-- existing rows become kind 'TEXT' with no items and no notes; nothing is rewritten or dropped.

-- CreateEnum
CREATE TYPE "order_kind" AS ENUM ('TEXT', 'MENU');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "items" JSONB,
ADD COLUMN     "kind" "order_kind" NOT NULL DEFAULT 'TEXT',
ADD COLUMN     "notes" TEXT;

-- ---------------------------------------------------------------------------
-- Hand-written constraints (Prisma does not model CHECKs). DATABASE.md §2.
-- Verified by apps/server/tests/integration/schema-constraints.int.test.ts.
-- ---------------------------------------------------------------------------

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_notes_length_chk" CHECK ("notes" IS NULL OR char_length("notes") BETWEEN 1 AND 500),
  ADD CONSTRAINT "orders_items_shape_chk" CHECK (
    ("kind" = 'TEXT' AND "items" IS NULL)
    OR (
      "kind" = 'MENU'
      AND "items" IS NOT NULL
      AND jsonb_typeof("items") = 'array'
      AND jsonb_array_length("items") BETWEEN 1 AND 50
    )
  );
