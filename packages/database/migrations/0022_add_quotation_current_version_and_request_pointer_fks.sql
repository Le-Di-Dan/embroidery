-- REL-068 — quotations.current_version_id -> quotation_versions: the
-- quotation header's current-version pointer.
--
-- Hand-authored because the pointer completes a header<->child cycle
-- (quotation_versions.quotation_id -> quotations via REL-066 lives in the
-- schema; declaring the reverse pointer there too would need a circular
-- module import). Same sanctioned mechanism as REL-044 (0016), REL-098
-- (0019), REL-062 (0013) and REL-102 (0004); drizzle-kit diffs against its
-- own snapshots, so it neither drops nor duplicates this constraint.
-- quotation_versions is created in 0021; this FK follows in the same
-- checkpoint per DB4_DB6_HANDOFF §1.
--
-- Nullable by design: a quotation header exists before its first version
-- is drafted, so a NOT NULL pointer would make the first insert
-- unwritable. RESTRICT: the version a quotation currently points at must
-- not disappear underneath it — pointer moves are TX-owned (header-pointer
-- consistency rule, DB4 REL legend). Same-quotation ownership of the
-- pointed-to version is TX/App-enforced (REL-068 documented "TX
-- consistency"), same tier as REL-044/REL-098 — not a database-level
-- guard, no trigger or composite FK invented here.

ALTER TABLE "quotations"
  ADD CONSTRAINT "fk_quotations__current_version_id"
  FOREIGN KEY ("current_version_id")
  REFERENCES "public"."quotation_versions"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;

-- REL-062 (second edge) — custom_requests.current_quotation_id ->
-- quotations: the request's current-quotation pointer.
--
-- Hand-authored for the same reason as REL-062's first edge
-- (custom_requests.current_design_case_id -> design_cases, added in 0013):
-- custom_requests.ts cannot import quotations.ts without a circular module
-- cycle back through custom-requests.ts (quotations -> custom_requests via
-- REL-065). This edge was deferred at G9 because `quotations` did not exist
-- yet (manifest §2.2.1 deferred FK edge ledger, resolution owner G14); it
-- follows here now that 0021 has created the target table.
--
-- Nullable (already declared nullable on custom_requests since G9): a
-- request exists before it has ever been quoted. RESTRICT: the quotation a
-- request currently points at must not disappear underneath it — pointer
-- moves are TX-owned, same tier as REL-062's first edge. Same-request
-- ownership of the pointed-to quotation is TX/App-enforced, not a
-- database-level guard; no trigger or composite FK invented here.

ALTER TABLE "custom_requests"
  ADD CONSTRAINT "fk_custom_requests__current_quotation_id"
  FOREIGN KEY ("current_quotation_id")
  REFERENCES "public"."quotations"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
