-- REL-044 — design_cases.current_version_id -> design_versions: the
-- design thread's current-version pointer.
--
-- Hand-authored because the pointer completes a header<->child cycle
-- (design_versions.design_case_id -> design_cases via REL-045 lives in the
-- schema; declaring the reverse pointer there too would need a circular
-- module import). Same sanctioned mechanism as REL-062 (0013), REL-102
-- (0004) and REL-033 (0010); drizzle-kit diffs against its own snapshots,
-- so it neither drops nor duplicates this constraint. design_versions is
-- created in 0015; this FK follows in the same checkpoint per
-- DB4_DB6_HANDOFF §1.
--
-- Nullable by design: a design case exists before its first version (the
-- case is created with the request, versions are authored afterward), so a
-- NOT NULL pointer would make the first insert unwritable. RESTRICT: the
-- version a case currently points at must not disappear underneath it —
-- pointer moves are TX-owned (header-pointer consistency rule, DB4 REL
-- legend).

ALTER TABLE "design_cases"
  ADD CONSTRAINT "fk_design_cases__current_version_id"
  FOREIGN KEY ("current_version_id")
  REFERENCES "public"."design_versions"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
