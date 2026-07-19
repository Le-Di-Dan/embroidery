-- REL-083 — payment_obligations.satisfied_by_attempt_id -> payment_attempts:
-- exactly-once application evidence (CC-10).
--
-- Hand-authored because the pointer completes a header<->child cycle
-- (payment_attempts.payment_obligation_id -> payment_obligations via
-- REL-084 lives in the schema; declaring the reverse pointer there too
-- would need a circular module import). Same sanctioned mechanism as
-- REL-044 (0016), REL-098 (0019), REL-062 (0013) and REL-068/REL-062-e2
-- (0022); drizzle-kit diffs against its own snapshots, so it neither drops
-- nor duplicates this constraint. payment_attempts is created in 0024;
-- this FK follows in the same checkpoint.
--
-- Nullable by design: an obligation exists (PENDING) before any attempt
-- has succeeded against it, so a NOT NULL pointer would make the first
-- insert unwritable. RESTRICT: the attempt an obligation currently points
-- at as its satisfying evidence must not disappear underneath it — pointer
-- moves are TX-owned (header-pointer consistency rule, DB4 REL legend).
-- Which attempt wins the satisfaction race (CC-10) is TX/App-enforced, not
-- a database-level guard, same tier as REL-044/REL-098/REL-068 — no
-- trigger or composite FK invented here.

ALTER TABLE "payment_obligations"
  ADD CONSTRAINT "fk_payment_obligations__satisfied_by_attempt_id"
  FOREIGN KEY ("satisfied_by_attempt_id")
  REFERENCES "public"."payment_attempts"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;