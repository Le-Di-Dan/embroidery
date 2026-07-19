-- REL-033 (second edge, deferred from G4 with owner G7) —
-- assets.uploaded_via_session_id -> design_sessions.
--
-- Hand-authored for two reasons:
-- 1. Declaring it in assets.ts would create a module-import cycle
--    (assets -> design-sessions -> product-sides -> assets), the same class
--    of cycle REL-102 hit in G2; the sanctioned mechanism is a reviewed
--    custom SQL migration owned by this file (drizzle-kit diffs against its
--    own snapshots, so it will neither drop nor duplicate this constraint).
-- 2. The FK could not exist before this migration because its target table
--    is created in 0009 (DB4_DB6_HANDOFF nullable-ref + follow-up-FK
--    pattern). Migration 0006 is not edited.
--
-- ON DELETE SET NULL, not restrict: DB4 marks this edge `set-null-cand` and
-- the parent is a hard-TTL-deleted temp table — provenance must clear when
-- the session is purged, otherwise TTL cleanup would be blocked by every
-- asset uploaded through a session. (The REL-033 customers edge kept
-- `restrict` in G4 because customers are never hard-deleted; the two edges
-- legitimately differ.)

ALTER TABLE "assets"
  ADD CONSTRAINT "fk_assets__uploaded_via_session_id"
  FOREIGN KEY ("uploaded_via_session_id")
  REFERENCES "public"."design_sessions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
