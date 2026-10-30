-- Owner decision Q-08: preparation targets 15, 20, 25 and 30 minutes.
-- Widens the hand-written CHECK only; every existing row (20 or 25) stays valid. No data changes.
-- Verified by apps/server/tests/integration/schema-constraints.int.test.ts.

ALTER TABLE "orders" DROP CONSTRAINT "orders_prep_minutes_chk";
ALTER TABLE "orders"
  ADD CONSTRAINT "orders_prep_minutes_chk" CHECK ("prep_minutes" IN (15, 20, 25, 30));
