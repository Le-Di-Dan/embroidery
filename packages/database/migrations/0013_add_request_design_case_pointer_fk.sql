-- REL-062 (first edge) — custom_requests.current_design_case_id ->
-- design_cases: the request header's current-design-thread pointer.
--
-- Hand-authored because the pointer completes a header<->child cycle
-- (design_cases.custom_request_id -> custom_requests via REL-043 lives in
-- the schema; declaring the reverse pointer there too would need a circular
-- module import). Same sanctioned mechanism as REL-102 (0004) and REL-033
-- (0010); drizzle-kit diffs against its own snapshots, so it neither drops
-- nor duplicates this constraint. Both tables are created in 0012; this FK
-- follows in the same checkpoint per DB4_DB6_HANDOFF §1.
--
-- Nullable by design: a request exists before its design case (the case is
-- created later in the design workflow), so a NOT NULL pointer would make
-- the first insert unwritable. RESTRICT: a case the request currently points
-- at must not disappear underneath it — pointer moves are TX-owned
-- (header-pointer consistency rule, DB4 REL legend).
--
-- The second REL-062 edge (current_quotation_id -> quotations) stays
-- deferred with owner G14: its target table does not exist yet.

ALTER TABLE "custom_requests"
  ADD CONSTRAINT "fk_custom_requests__current_design_case_id"
  FOREIGN KEY ("current_design_case_id")
  REFERENCES "public"."design_cases"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
