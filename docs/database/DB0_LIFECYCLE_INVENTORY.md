# DB0 — Lifecycle Inventory

**Audit date:** 2026-07-15 · **Audited Git HEAD:** `223e4db`
**Purpose:** Enumerate every lifecycle that must be formalized at DB3. DB0 does **not** complete any state machine — missing states/transitions are recorded, not invented.

---

## 1. How to read this file

For each lifecycle: `LC-<nn>`, source, known states, known transition rules,
missing states/ambiguities, critical preconditions, critical side effects,
audit requirement, and transaction/concurrency importance. Provisional state
names come from `06-ORDER-AND-DESIGN-LIFECYCLE.md`, which states final names are
decided in technical design (→ resolved at DB3, not DB0).

---

## LC-01 — Admin account

- **Source:** `07 §1`, `09 §3`.
- **Known states:** active (implied); no explicit disabled/locked/recovering
  states documented.
- **Transitions:** none formalized.
- **Missing/ambiguous:** account disable, lockout after failed logins, recovery
  state, credential rotation — all unspecified.
- **Preconditions:** must not be an unreplaceable hard-coded identity (`07 §1`).
- **Side effects:** login alerts where practical.
- **Audit:** Yes — login and security-config changes (`07 §12`).
- **Tx/concurrency:** low; session handling needs care.

## LC-02 — Contact verification

- **Source:** `01 §4`, `09 §2`, REQ-VERIF-001.
- **Known states:** unverified → challenge issued → verified; possible expired.
- **Transitions:** issue challenge → verify (success) / expire / fail.
- **Missing/ambiguous:** challenge attempt limits, cooldown, re-verification
  triggers ("sensitive actions may require re-verification" — which actions?).
- **Preconditions:** required before request submission.
- **Side effects:** enables submission; issues secure grant.
- **Audit:** Yes.
- **Tx/concurrency:** idempotent issuance; race on concurrent challenges.

## LC-03 — Secure access grant

- **Source:** `01 §4`, `09 §2`, REQ-GRANT-001..003.
- **Known states:** active → expired / revoked.
- **Transitions:** issue → (use) → expire / revoke.
- **Missing/ambiguous:** exact expiry duration, revocation triggers, re-issue on
  expiry (O-005).
- **Preconditions:** scoped to one customer/request.
- **Side effects:** grants view/approve/pay actions.
- **Audit:** Yes (sensitive access).
- **Tx/concurrency:** token lookup must be safe; revocation vs in-flight use.

## LC-04 — Product publication

- **Source:** `07 §3`, REQ-CAT-003.
- **Known states:** draft/created ↔ published → archived; out-of-stock is an
  inventory-availability overlay, not a publication state.
- **Transitions:** create → publish → **unpublish (back to draft)** → archive;
  edit in place while draft. Unpublish was added as TR-LC04-05 by
  `APP2-B03-G01` (IMP-D035); it removes public visibility without archiving.
- **Missing/ambiguous:** explicit draft vs published distinction not named.
- **Preconditions:** required fields present for public display.
- **Side effects:** SEO index/noindex; storefront visibility.
- **Audit:** Yes (product changes).
- **Tx/concurrency:** low.

## LC-05 — SKU availability

- **Source:** `01 §2.2`, `07 §3,§10`, REQ-VAR-002.
- **Known states:** available → out_of_stock; admin can mark out of stock.
- **Transitions:** stock changes flip availability; manual override.
- **Missing/ambiguous:** relationship between computed availability and manual
  override precedence.
- **Preconditions:** stock/reservation counts.
- **Side effects:** storefront display; reservation eligibility.
- **Audit:** Yes (stock changes).
- **Tx/concurrency:** High — availability derived under concurrent reservation.

## LC-06 — Asset processing

- **Source:** `09 §4`, `05 §4.2`, REQ-ASSET-002/003.
- **Known states:** uploaded → inspecting → accepted / rejected; derivative
  states processing → ready / failed.
- **Transitions:** upload → validate (size/MIME/signature/decode/sanitize) →
  accept/reject; enqueue derivative jobs.
- **Missing/ambiguous:** quarantine state; retry/backoff policy for failed
  inspection; malware-scan outcome states ("where practical").
- **Preconditions:** validation before use.
- **Side effects:** worker jobs; storage isolation.
- **Audit:** partial (security-relevant).
- **Tx/concurrency:** idempotent callbacks; concurrent processing.

## LC-07 — Design session

- **Source:** `06 §2`, `04 BR-013`, `03 J9`, REQ-SESS-001.
- **Known states:** `ACTIVE`, `EXPIRED`, `SUBMITTED`, `ABANDONED`, `DELETED`.
- **Transitions:** ACTIVE → SUBMITTED (on request) / EXPIRED (timeout) /
  ABANDONED → DELETED (retention).
- **Missing/ambiguous:** exact expiry period (O-008); ABANDONED vs EXPIRED
  distinction criteria; anonymize-vs-delete choice.
- **Preconditions:** none to start (guest allowed).
- **Side effects:** autosave writes; cleanup job on expiry.
- **Audit:** low (temporary data), but deletion/anonymization tracked for
  privacy.
- **Tx/concurrency:** High — autosave stale/concurrent writes.

## LC-08 — Design version

- **Source:** `06 §4`, `05 §9`, REQ-DVER-001..006.
- **Known states:** `DRAFT`, `SENT_FOR_REVIEW`, `REVISION_REQUESTED`,
  `APPROVED`, `SUPERSEDED`, `VOID`.
- **Transitions:** DRAFT → SENT_FOR_REVIEW → (REVISION_REQUESTED → new version
  supersedes) / APPROVED; APPROVED is terminal & immutable; unapproved may be
  SUPERSEDED or VOID.
- **Missing/ambiguous:** final names (DB3); who can VOID; concurrency rule
  "only one version awaiting review at a time" enforcement.
- **Preconditions:** approved cannot return to draft; approval binds exact
  version ID + hash.
- **Side effects:** creates approval snapshot on APPROVED.
- **Audit:** Yes (version creation, approval).
- **Tx/concurrency:** High — single active-review invariant; approval tx.

## LC-24 — Design Template (publication)

- **Source:** `05 §9`, DB2 GAP-08, `docs/database/DB3_LIFECYCLE_SPECIFICATIONS.md`
  §LC-24. Formalised by `APP3-G02` (IMP-D042).
- **Known states:** `DRAFT`, `PUBLISHED`, `ARCHIVED`.
- **Transitions:** `TR-LC24-01` create → DRAFT; `-02` publish DRAFT →
  PUBLISHED; `-03` unpublish PUBLISHED → DRAFT; `-04` archive DRAFT →
  ARCHIVED; `-05` archive PUBLISHED → ARCHIVED; `-06` restore ARCHIVED →
  DRAFT. No direct ARCHIVED → PUBLISHED; no hard delete in APP3.
- **Missing/ambiguous:** none remaining — the pre-APP3 record named the states
  but assigned no transition identifiers, guards or concurrency rule.
- **Preconditions:** publish requires the full GRD-T01 guard set (§LC-24).
- **Side effects:** version `published_at` set once at first publish; no
  cascade to cloned Design Sessions.
- **Audit:** yes; archive and restore additionally require a reason.
- **Tx/concurrency:** header optimistic token on every transition.

## LC-09 — Customer review

- **Source:** `03 J5`, `07 §6`, REQ-REVIEW-001.
- **Known states:** pending → approved / revision_requested.
- **Transitions:** open version → approve / request revision (with feedback).
- **Missing/ambiguous:** expiry of a pending review; multiple feedback rounds
  record shape.
- **Preconditions:** valid secure grant; only latest sent version.
- **Side effects:** triggers approval snapshot or new version.
- **Audit:** Yes.
- **Tx/concurrency:** medium.

## LC-10 — Approval

- **Source:** `06 §9`, `04 BR-009`, REQ-APPR-001..003.
- **Known states:** not-approved → approved (immutable snapshot created).
- **Transitions:** approve exact version → snapshot; post-approval change →
  new version + new approval (previous approval retained historically).
- **Missing/ambiguous:** whether a superseding approval marks the prior order as
  paused automatically; deposit reuse on re-approval (O-009).
- **Preconditions:** explicit secure-flow approval only (BR-008); exact version
  + hash.
- **Side effects:** enables deposit; official inventory reservation later;
  production linkage.
- **Audit:** Yes (critical).
- **Tx/concurrency:** High — snapshot creation is transactional & immutable.

## LC-11 — Custom request

- **Source:** `06 §3`, REQ-REQ-002.
- **Known states:** `NEW`, `NEEDS_CLARIFICATION`, `UNDER_REVIEW`, `REJECTED`,
  `QUOTED`, `DIGITIZING`, `DESIGN_REVIEW`, `APPROVED`, `CANCELLED`.
- **Transitions:** NEW → UNDER_REVIEW → (NEEDS_CLARIFICATION loop / REJECTED /
  QUOTED) → DIGITIZING → DESIGN_REVIEW → APPROVED; CANCELLED reachable from
  several states.
- **Missing/ambiguous:** final names (DB3); exact guard from QUOTED to
  DIGITIZING (does quotation acceptance gate digitizing? — GAP-03); mapping
  between request lifecycle and order lifecycle.
- **Preconditions:** verified customer.
- **Side effects:** creates quotation, design versions, order.
- **Audit:** Yes.
- **Tx/concurrency:** medium.

## LC-12 — Quotation

- **Source:** `06 §5`, REQ-QUOT-005.
- **Known states:** `DRAFT`, `SENT`, `ACCEPTED`, `EXPIRED`, `REVISED`,
  `REJECTED`, `CANCELLED`.
- **Transitions:** DRAFT → SENT → ACCEPTED / EXPIRED / REJECTED / REVISED
  (creates new version). Sent version never overwritten.
- **Missing/ambiguous:** final names; whether ACCEPTED requires design approval
  first or vice versa (GAP-03); auto-EXPIRED job cadence.
- **Preconditions:** valid totals; validity window.
- **Side effects:** derives deposit/remaining; may soft-hold inventory.
- **Audit:** Yes.
- **Tx/concurrency:** High — version creation transactional; historical
  immutability.

## LC-13 — Quotation version

- **Source:** `06 §5`, REQ-QUOT-002.
- **Known states:** each version immutable once created; header points to
  current version.
- **Transitions:** revise → new immutable version; prior versions retained.
- **Missing/ambiguous:** none major; retention of superseded versions confirmed
  required.
- **Preconditions:** revised quotation must not overwrite historical values.
- **Side effects:** none beyond header pointer move.
- **Audit:** Yes.
- **Tx/concurrency:** transactional creation.

## LC-14 — Order

- **Source:** `06 §7`, REQ-ORD-001.
- **Known states:** `AWAITING_DEPOSIT`, `DEPOSIT_PAID`, `IN_PRODUCTION`,
  `PRODUCTION_COMPLETED`, `AWAITING_FINAL_PAYMENT`, `READY_FOR_DELIVERY`,
  `DELIVERED`, `COMPLETED`, `CANCELLED`.
- **Transitions:** forward chain with guards; CANCELLED reachable per
  cancellation policy.
- **Missing/ambiguous:** final names; exact cancellation transitions after
  deposit/production (O-009); relationship to request/quotation states.
- **Preconditions:** production needs approved design + verified deposit +
  reservation; delivery needs verified remaining payment; completion after
  delivery.
- **Side effects:** inventory reservation/release; payment obligations.
- **Audit:** Yes (order transitions).
- **Tx/concurrency:** High — no duplicate orders; transactional completion.

## LC-15 — Payment obligation

- **Source:** `06 §6`, REQ-PAY-001..003.
- **Known states:** unpaid → (attempt in progress) → paid; deposit and remaining
  are two independent obligations.
- **Transitions:** create obligation → satisfied by a succeeded attempt.
- **Missing/ambiguous:** partial payment handling; obligation expiry.
- **Preconditions:** deposit after approval; remaining before delivery.
- **Side effects:** unlocks production / delivery.
- **Audit:** Yes.
- **Tx/concurrency:** High — must reconcile with attempts idempotently.

## LC-16 — Payment attempt

- **Source:** `06 §6`, REQ-PAY-004..006.
- **Known states:** `PENDING`, `PROCESSING`, `SUCCEEDED`, `FAILED`, `EXPIRED`,
  `REFUNDED`, `PARTIALLY_REFUNDED`, `REQUIRES_REVIEW`.
- **Transitions:** PENDING → PROCESSING → SUCCEEDED / FAILED / EXPIRED;
  SUCCEEDED → REFUNDED / PARTIALLY_REFUNDED; any → REQUIRES_REVIEW.
- **Missing/ambiguous:** provider-specific mapping (O-006); out-of-order callback
  handling formalization.
- **Preconditions:** server-side signature/amount/currency/reference
  verification; never trust redirect.
- **Side effects:** satisfies obligation; may trigger order transition.
- **Audit:** Yes.
- **Tx/concurrency:** Critical — idempotent callbacks, duplicate/out-of-order.

## LC-17 — Inventory reservation

- **Source:** `04 BR-015`, `06 §8`, REQ-INV-003/004/007.
- **Known states:** none official at draft/request → soft-hold (optional at
  quotation) → official reservation (after approval + deposit) → released /
  consumed / expired.
- **Transitions:** soft-hold → official → release/consume; expiry timer.
- **Missing/ambiguous:** reservation expiration period (DEC-14); soft-hold
  duration; behavior when stock insufficient at approval time.
- **Preconditions:** official reservation only after approval + successful
  deposit; prevent negative stock.
- **Side effects:** decrements available; increments held; release restores.
- **Audit:** Yes (reason recorded).
- **Tx/concurrency:** Critical — concurrent reservations, stock races.

## LC-18 — Production job

- **Source:** `07 §9`, `06 §7`, REQ-PROD-001/004.
- **Known states:** not_started → started → completed; blocked if preconditions
  unmet.
- **Transitions:** start (guarded) → complete → move to final payment.
- **Missing/ambiguous:** production revision handling after approval change;
  partial/paused production; rework state.
- **Preconditions:** approved design + verified deposit + reservation; must
  reference exact approved version.
- **Side effects:** produces production artifacts; advances order.
- **Audit:** Yes.
- **Tx/concurrency:** medium; guard transitional integrity.

## LC-19 — Delivery

- **Source:** `03 J8`, `06 §7,§8`, REQ-SHIP-004.
- **Known states:** ready_for_delivery → delivered → completed.
- **Transitions:** mark delivered → mark completed.
- **Missing/ambiguous:** address/history model (GAP-05); no carrier tracking.
- **Preconditions:** verified remaining payment before delivery; completion
  after delivery.
- **Side effects:** order completion.
- **Audit:** Yes.
- **Tx/concurrency:** low.

## LC-20 — Refund

- **Source:** `06 §11`, `07 §8`, REQ-PAY-009.
- **Known states:** attempt states REFUNDED / PARTIALLY_REFUNDED; refund
  metadata recorded.
- **Transitions:** succeeded payment → refund (full/partial).
- **Missing/ambiguous:** refund policy before/after deposit/production (O-009);
  whether refunds are automated or manual-only.
- **Preconditions:** reconciliation.
- **Side effects:** inventory release; order/cancellation state.
- **Audit:** Yes.
- **Tx/concurrency:** transactional.

## LC-21 — Cancellation

- **Source:** `06 §11`, REQ-REQ-003/ORD-001.
- **Known states:** request CANCELLED / order CANCELLED; reachable before
  deposit, after deposit, during production.
- **Transitions:** cancel with admin reason + optional customer-visible reason.
- **Missing/ambiguous:** full policy (O-009): what happens to deposit, inventory,
  in-progress production per stage.
- **Preconditions:** payment reconciliation; inventory release.
- **Side effects:** release reservation; refund per policy.
- **Audit:** Yes.
- **Tx/concurrency:** transactional.

## LC-22 — Outbox event

- **Source:** `SYSTEM_ARCHITECTURE §11`, REQ-OUTBOX-001..002.
- **Known states:** pending → dispatched → acknowledged / failed → dead-letter.
- **Transitions:** enqueue on commit → relay → ack / retry (bounded) →
  dead-letter/manual review.
- **Missing/ambiguous:** queue/broker (O-001); relay cadence; retention of
  processed events.
- **Preconditions:** written in same tx as state change; no external call inside
  tx.
- **Side effects:** triggers async work (notifications, rendering, reconciliation).
- **Audit:** operational log.
- **Tx/concurrency:** Critical — at-least-once, idempotent consumers.

## LC-23 — Idempotency record

- **Source:** `BACKEND_CONVENTIONS §12`, REQ-IDEM-001..002.
- **Known states:** unseen → in-progress → completed (result stored) → expired.
- **Transitions:** first request records key → subsequent duplicates return
  stored result → expiry cleanup.
- **Missing/ambiguous:** expiry policy per operation (DEC-15); scope granularity.
- **Preconditions:** scoped keys.
- **Side effects:** prevents duplicate payment/order/job effects.
- **Audit:** operational.
- **Tx/concurrency:** Critical.

---

## 24. Lifecycle roll-up

- **Total lifecycles inventoried:** 23 (LC-01 … LC-23).
- **With provisional state names to finalize at DB3:** LC-08, LC-11, LC-12,
  LC-14, LC-16 (state name sets marked provisional in `06`).
- **Critical concurrency/transaction lifecycles:** LC-05, LC-07, LC-08, LC-10,
  LC-12, LC-14, LC-15, LC-16, LC-17, LC-22, LC-23.
- **All lifecycles require audit** except purely temporary session data
  (LC-07), which still requires privacy-driven deletion/anonymization tracking.

All formalization (complete states, guards, side effects) is deferred to **DB3**.
Missing states/ambiguities above are **not** resolved in DB0.
