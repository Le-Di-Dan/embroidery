# ADR-DB2-001 — Customer Identity Model

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `f90f78c0cb6891f46874723ae50c3b73de405675`
- Decision IDs: DEC-21
- Requirement IDs: REQ-CUST-001..003, REQ-VERIF-001, REQ-GRANT-001..003,
  REQ-SESS-001/004
- Invariant IDs: INV-08, INV-14
- Gap IDs: — (interacts with GAP-12, not resolved here)

## Context

Customers start as guests in the Design Studio and must verify email or phone
before submitting a request (BR-014, `01 §4`). There is no password/account
requirement in scope (`01 §4`: "Khách không bắt buộc tạo tài khoản bằng mật
khẩu"; no customer login portal exists in any journey). Access to a submitted
case happens through secure links (grants). B2B readiness requires business
profile fields later (`01 §13`). DB2 must fix the conceptual identity model so
Ordering, Quotation, Payment and Design can reference a stable CustomerId.

## Decision Drivers

- Privacy: guests who never submit must leave no permanent identity residue.
- No silent identity merging on raw contact-string matches.
- Secure-link tokens must not become de facto identity.
- Multi-device continuation happens through secure links, not sessions.
- Auditability of any identity linking/merging (INV-14).
- B2B profile attachment later without remodeling.

## Options Considered

### Option A — Customer exists only after verification; guest session is not a Customer

Design Session stays anonymous (session-scoped secret only). At submission,
the verified contact either links to an existing Customer (verified-possession
match) or creates a new Customer.

### Option B — Provisional Customer created at guest session start

Every editor visit creates a Customer row upgraded later.

### Option C — Separate Anonymous Principal entity, merged into Customer at verification

A distinct guest-identity concept with an explicit merge step.

## Decision

**Option A.** The Customer aggregate (AGG-02) is created or linked **only at
successful contact verification during submission**. Detailed rules below.

## Detailed Rules

1. **Guest ≠ Customer.** A Design Session carries only its own session
   identity; it is temporary data (LC-07) and is never promoted into a
   permanent identity by itself. Abandoned sessions are cleaned per retention
   (transient class) with no Customer residue.
2. **No password/account in MVP.** Customer identity = verified contact
   possession + secure grants. A future auth provider (DEC-29, open) may add
   credentials additively; nothing in this model assumes a login.
3. **Verified contact is the identity proof** — at the strength of
   channel possession at verification time, nothing more. Sensitive-action
   re-verification triggers remain DB3 (GAP-12).
4. **Contact normalization:** emails lowercased/trimmed; phone numbers
   normalized to a canonical form (E.164-style direction) before any
   comparison. Normalization rules are VO-level (CON-163/164).
5. **Linking rule (no silent merge):** at verification, if the **normalized,
   just-verified** contact has an active verified link to an existing
   Customer, the submission attaches to that Customer. Raw string matches on
   *unverified* contacts never link identities. Every link/attach is audited.
6. **Uniqueness (conceptual):** one active verified link per contact point →
   at most one Customer at a time. Shared-contact scenarios (family/B2B staff
   sharing a phone) are handled later via Business Profile contacts or
   re-assignment-with-audit; the model reserves this by making the link (not
   the raw string) the unique thing. Constraint design → DB4.
7. **Multiple contacts per customer** are allowed; exactly one **primary**
   contact for outbound notifications.
8. **Merge operation exists but is exceptional:** an admin-initiated, audited
   merge (reason + before/after references) for genuine duplicates; never
   automatic. Merge mechanics (what moves, tombstone) → DB3/DB4 detail.
9. **Secure Access Grant is request-access, not identity** (AGG-04): scoped
   to (Customer, Request), revocable/expiring (policy DEC-26 → DB3). A grant
   token is never used as CustomerId anywhere.
10. **Request ownership:** Custom Request references CustomerId; commercial
    snapshots capture a frozen Contact Snapshot (CON-018) so later
    anonymization does not corrupt evidence (privacy interplay → DB3).
11. **Admin identity is fully separate** (CTX-IDN); no shared tables,
    concepts, or credential model with Customer.
12. **B2B readiness:** Business Profile (CON-012) is a dormant child of
    Customer; attaching it later changes nothing above.
13. **Guest cleanup:** sessions expire per O-008 policy; verification
    challenges are transient; no Customer rows are created by abandonment.

## Consequences

## Positive Consequences

- Zero identity residue for the (majority) anonymous browsing/design traffic;
  privacy-by-default.
- No false merges from typo'd or recycled contacts — only verified possession
  links identities.
- Payment/order/design contexts get one stable CustomerId reference model.

## Negative Consequences

- Returning guests on a new device cannot see prior requests until they
  verify the same contact again (acceptable: secure links are the designed
  re-entry path).
- Duplicate Customers are possible when one person uses different contacts —
  accepted; audited merge is the correction path.

## Risks and Mitigations

- **Risk:** verified-contact reassignment (phone number recycled by telco).
  **Mitigation:** link is re-pointable with audit at a new verification;
  historical snapshots keep frozen contact evidence.
- **Risk:** dedup pressure leads to future silent auto-merge.
  **Mitigation:** rule 5/8 are locked conceptually; changing them needs a
  superseding ADR.

## Rejected Alternatives

- **Option B:** creates PII-bearing permanent rows for every curious visitor;
  contradicts session disposability (BR-013) and privacy minimization
  (`10 §12`).
- **Option C:** an extra entity + merge machinery whose only benefit (guest
  continuity) is already provided by session TTL + secure links; over-modeled
  for a no-login product.
- Secure-link-token-as-identity; global raw email/phone auto-merge — both
  explicitly prohibited by the task and by rules 5/9.

## Deferred Details

- Attempt limits, cooldowns, re-verification triggers → DB3 (GAP-12/DEC-26).
- Merge mechanics, uniqueness constraint design, anonymization column shape →
  DB3/DB4.
- Auth/OTP provider → DEC-29 (open).
- Deferral is safe: Ordering/Quotation/Payment/Design need only the
  CustomerId reference model + snapshot rule, both locked here.

## Implementation Checkpoint

DB4 (shapes), DB6 (constraints), backend identity checkpoint (flows).

## Verification Checkpoint

DB7 (uniqueness/link constraints), DB8 (concurrent verification races),
DB10 (privacy cleanup audit).

## Reversal / Migration Cost

Low→medium: adding accounts/credentials later is additive; switching to
provisional-customer (Option B) later would require data backfill but no
reference remodeling (CustomerId stays).

## References

- `docs/01-PRODUCT-REQUIREMENTS.md` §4, §13; `docs/04-BUSINESS-RULES.md`
  BR-014; `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §2, §7;
  `docs/03-USER-JOURNEYS.md` J2/J9
- ADR-DB1-007 (IDs), ADR-DB1-011 (retention/anonymization)
- `docs/database/DB2_CONCEPT_INVENTORY.md` CON-010..018
