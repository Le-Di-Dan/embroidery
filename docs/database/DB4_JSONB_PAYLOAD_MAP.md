# DB4 — JSONB & Structured Payload Map

**Date:** 2026-07-15 · **Git HEAD:** `a79f523`
**Normative:** [ADR-DB4-004](../adr/database/ADR-DB4-004-JSONB-BOUNDARIES.md).
This is the **closed allowed set** — any JSONB column not listed here is a
schema defect (D7 scan).

| # | Column | Purpose | Schema owner | Version key | Validation | Canonical/hash | Size direction | Sensitive/redaction | Query expectation | Migration | Why not relational / why it hides no invariant |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `design_sessions.design_document` (COL-TBL025-03) | working design document | `packages/design-document` | `document_schema_version` | package validation on write | JCS-capable; not hashed while mutable | editor budget [cfg] | customer content [PII-adjacent]; session hard-TTL | opaque read-whole | upgrade-on-read (ADR-DB1-012) | open-ended element/layer model is the document's nature; no guard reads its internals |
| 2 | `design_versions.design_document` (COL-TBL028-05) | frozen formal document | same | same | same | **JCS + SHA-256 → `document_hash` column** | same | frozen customer content | opaque; hash column is the queryable fact | historical rows never migrated in place | invariant facts (hash, placement, dims) are **extracted to columns**; payload is evidence |
| 3 | `design_template_versions.design_document` (COL-TBL035-03) | template document | same | same | same | JCS-capable | same | store-authored | opaque | new version per change | same as #2 |
| 4 | `outbox_events.payload` (COL-TBL073-03) | event payload for consumers | owning context per event_type | `payload_schema_version` | producer-side typed serialization | fingerprint via canonical JSON where consumers dedup | minimized payload rule (SE catalog) | redacted by construction — no OTP/tokens/provider bodies | opaque; claims filter on relational status columns | versioned consumers; rows transient | payload varies per event type; dispatch state is relational |
| 5 | `idempotency_records.result` (COL-TBL074-05) | minimal replayable outcome (refs + status) | PLT service | fixed internal shape (documented at DB6) | service-side | fingerprint column separate | minimal-result rule (ADR-DB1-017 r4) | redacted | opaque replay blob | rows transient (TTL) | uniqueness/fingerprint/status — the invariant fields — are columns |
| 6 | `payment_provider_events.redacted_payload` (COL-TBL056-06) | provider callback evidence | PAY adapter per provider_key | provider_key discriminates | adapter-side redaction schema | — | bounded evidence | **redacted**: no secrets/PAN/signatures beyond verification outcome | opaque evidence; reconciliation filters on relational columns (provider_ref, amount, outcome) | provider mapping [cfg/O-006] | verification facts (amount, currency, ref, signature_valid, outcome) are columns |
| 7 | `audit_events.summary` (COL-TBL072-07) | before/after reference summary | AUD service | fixed internal shape | service-side | — | summary-only rule (audit spec) | redaction per `§18`; masked contacts | opaque; audit queries filter on actor/action/target/time columns | append-only, never rewritten | actor/action/target/reason/correlation — the queryable facts — are columns |
| 8 | `notification_intents.params` (COL-TBL070-06) | redacted template parameters | NTF service + template registry | `template_version` column | typed-reference construction (ADR-DB2-003 r2) | — | small by construction | **structural exclusion of OTP/tokens/URLs** (D7-12) | opaque; ops filter on status/template/channel columns | template versioning | recipients/status/template — relational; params are display inputs only |
| 9 | `policy_configuration_versions.value` (COL-TBL077-03) | versioned policy/config payload | PLT config service | `value_schema_version` | service-side per config_key schema | — | small | no secrets in config values (audit spec) | read-whole per key | new version per change [R] | heterogeneous config value shapes; key/version/effective_from are columns |

## Prohibitions (restated, normative)

No JSONB for: product/variant/SKU fields · money · statuses · order items ·
payment obligations · inventory quantities · shipping address snapshots ·
quotation line items · relationships · any guard/constraint input.
Approval snapshots, quotation versions, order items, shipping snapshots and
production specifications contain **zero JSONB columns**. Design hash
reproducibility (INV-32) is guaranteed by columns #2/#3 + ADR-DB1-012 test
vectors (D7-15).
