# DB4 — Context Schema: Content, Gallery & Agreement (CTX-CNT / CTX-GAL)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-064..069.

## 1. Structures

| Table | Role |
|---|---|
| `content_pages` (TBL-066) | SEO/content pages by `page_type` + slug; publication state; **no version history in MVP** (DB2 explicit non-goal — edits audited with before/after summaries) |
| `redirect_rules` (TBL-067) | unique source path → target, permanent/temporary |
| `gallery_entries` + `gallery_entry_assets` (TBL-064/065) | published showcase with required text context, ordering, SEO VO columns, optional product link; asset associations |
| `agreements` (TBL-068) | one container per policy type (type unique; set is config-extensible — no CHECK on the type set) |
| `agreement_versions` (TBL-069) | immutable-once-published versions: content text + `content_hash` + `language` + `effective_from` + DRAFT/PUBLISHED/SUPERSEDED/WITHDRAWN |

## 2. Modeling assertions (task §15.6)

1. **Agreement Version immutable:** publish freezes content + computes
   `content_hash` (SHA-256 over canonical content bytes; rich-text
   canonicalization detail is a package/DB6 implementation note per the
   DB2 terms decision); CST-096 trigger rejects mutation; withdrawn/
   superseded rows are retained while referenced (ADR-DB1-011).
2. **Effective/published/withdrawn states:** stored states per DB3;
   **EFFECTIVE is derived** (PUBLISHED + effective window + not
   superseded/withdrawn) and never stored; at most one effective version
   per agreement is guarded in the publish tx with an exclusion-constraint
   candidate at DB6 (CST-046).
3. **Approval linkage:** `approval_snapshot_agreement_acceptances`
   (TBL-033, Design context) stores per accepted type: exact
   `agreement_version_id` + frozen `agreement_type` + `content_hash` at
   accept time + timestamp — GRD-008 compares hashes in the approval tx;
   historical acceptance survives any later agreement change (immutable
   snapshot child).
4. **Locale:** `language` = 'vi' MVP readiness attribute; no i18n
   machinery.
5. **Gallery privacy:** `gallery_entry_assets` may only associate
   public-classification material; private originals are never exposed —
   classification lives on the asset row (INV-09), enforced App-side with
   D7 representation tests (CST-123).
6. **Publication machine:** gallery/content reuse the LC-04 publication
   pattern (Tier C history: state + `archived_at` + audit).

## 3. Retention

All commercial(archive); agreement versions retained while any approval
snapshot references them (restrict FKs REL-055/097 make premature deletion
impossible).
