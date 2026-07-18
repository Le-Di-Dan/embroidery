-- REL-102 (header current-version pointer) — TBL-076 -> TBL-077.
--
-- Hand-authored because the two tables reference each other: declaring this FK
-- in the schema source would require a circular module import between
-- policy-configurations.ts and policy-configuration-versions.ts. DB4_DB6_HANDOFF
-- §1 prescribes exactly this shape: create both tables, then add the header
-- current-pointer FK in a follow-up step within the same checkpoint.
--
-- The pointer is nullable by design: a configuration exists before its first
-- version is written, so a NOT NULL pointer would make the first row
-- unwritable. `restrict` because a version that a configuration currently
-- points at must not disappear underneath it.
--
-- This constraint is owned by this migration, not by the drizzle schema
-- snapshot — the same ownership model used for triggers. `drizzle-kit generate`
-- diffs the schema against its own snapshot, never against the live database,
-- so it will neither drop nor duplicate this constraint.

ALTER TABLE "policy_configurations"
  ADD CONSTRAINT "fk_policy_configurations__current_version_id"
  FOREIGN KEY ("current_version_id")
  REFERENCES "public"."policy_configuration_versions"("id")
  ON DELETE RESTRICT ON UPDATE NO ACTION;
