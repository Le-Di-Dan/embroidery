-- REL-098 — agreements.current_version_id -> agreement_versions: the
-- agreement container's current-effective-published-version pointer.
--
-- Hand-authored because the pointer completes a header<->child cycle
-- (agreement_versions.agreement_id -> agreements via REL-097 lives in the
-- schema; declaring the reverse pointer there too would need a circular
-- module import). Same sanctioned mechanism as REL-044 (0016), REL-062
-- (0013), REL-102 (0004) and REL-033 (0010); drizzle-kit diffs against its
-- own snapshots, so it neither drops nor duplicates this constraint.
-- agreement_versions is created in 0018; this FK follows in the same
-- checkpoint per DB4_DB6_HANDOFF §1.
--
-- Nullable by design: an agreement container exists before its first
-- published version, so a NOT NULL pointer would make the first insert
-- unwritable. RESTRICT: the version an agreement currently points at must
-- not disappear underneath it — pointer moves are TX-owned (header-pointer
-- consistency rule, DB4 REL legend). Same-agreement ownership of the
-- pointed-to version is TX/App-enforced (REL-098 documented "TX
-- consistency"), same tier as REL-044/design_cases — not a database-level
-- guard, no trigger or composite FK invented here.

ALTER TABLE "agreements"
  ADD CONSTRAINT "fk_agreements__current_version_id"
  FOREIGN KEY ("current_version_id")
  REFERENCES "public"."agreement_versions"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
