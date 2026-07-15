# DB2 Decision Record — Terms/Agreement Version Ownership (GAP-09, DB2 portion)

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c` · **Status:** Accepted with Deferred Parameters
**Gap:** GAP-09 (DB2 portion — entity/ownership; approval linkage guards remain DB3)
**REQ:** REQ-APPR-001 ("Terms version accepted") · **INV:** INV-01 family (snapshot evidence)

## Questions and decisions

| Question | Decision |
|---|---|
| Own concept or content-page subtype? | **Own concept:** Agreement (CON-127, root per policy type) + Agreement Version (CON-128, immutable once published). Policy pages rendered publicly may be backed by the same content, but the *versioned agreement* is a first-class concept because Approval Snapshots reference it as evidence — content pages have no version/immutability contract. |
| Owning context? | **Content (CTX-CNT / future `content` module).** Not Order (it doesn't author terms), not Design (it only references at approval). One admin, one authoring surface. |
| Version identity? | AgreementVersionId (business UUIDv7) + monotonic version number per agreement + **content hash** of the published text (hash rules reuse the ADR-DB1-012 hashing direction: SHA-256 over canonical content bytes; exact canonicalization of rich text → DB4/package detail). |
| Conceptual states? | draft → **published** (frozen) → superseded; one **effective** version per agreement at a time. Final state names → DB3 (GAP-01 family). |
| What does Approval Snapshot store? | **Reference + hash (CON-129):** AgreementVersionId + content hash. **Not** a full rendered copy (the version row itself is immutable and retained — duplicating content adds no integrity) and **not** a bare ID (hash makes evidence independently checkable). |
| Historical terms immutable? | **Yes** — published Agreement Versions are immutable snapshots (ADR-DB1-010 class) and retained while any Approval Snapshot references them. |
| Acceptance evidence owner? | **The Approval Snapshot (Design context)** owns the acceptance *event/evidence* — acceptance happens inside the approval act (`06 §9`). The Terms context owns only the versions. No separate "terms acceptance log" concept in MVP. |
| Multiple policy types? | **Yes, readiness built-in:** Agreement carries a policy-type discriminator (delivery/payment/return/privacy per `01 §2.1` policy pages); the approval references whichever type(s) DB3's guard requires. |
| Language/versioning? | Single-language (Vietnamese) MVP; language variant readiness = attribute on version, no i18n machinery (`02 §2` boundary). |
| Retention? | Commercial record class — versions retained while referenced; never casually deletable (ADR-DB1-011 global rule). |

## Rationale

The only hard requirement is that an Approval Snapshot can prove *which*
terms the customer accepted (`06 §9`). Reference+hash provides tamper-evident
proof at minimal storage while the immutable version row preserves the
content itself — the same integrity pattern already locked for design
documents.

## Deferred (→ DB3 / DB4)

- Which action(s) require which agreement type(s) accepted (approval guard) —
  DB3.
- Effective-dating rules, state names — DB3.
- Content canonicalization detail for hashing, version row shape — DB4.

## Handoff

DB3 (approval guard + states), DB4 (shapes + hash detail), DB7 (published
immutability test).
