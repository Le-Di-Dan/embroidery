# ADR-DB3-004 — Secure Grant Expiry, Revocation and Re-Verification

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `0563866e0c1a53472a07e892e6cc1ecabe086b5a`
- Decision IDs: DEC-26 (O-005 policy portion; provider stays open)
- Requirement IDs: REQ-GRANT-001..004, REQ-VERIF-001
- Invariant IDs: INV-08, INV-14
- Gap IDs: GAP-12

## Context

Secure links must be unguessable, revocable/expiring, scoped to one
customer/request (`09 §2`, REQ-GRANT-002); "sensitive actions may require
re-verification" without naming the actions (GAP-12). ADR-DB2-001 locked
grants as request-access, not identity. Providers/OTP mechanics remain open
(O-005/DEC-29) — this ADR locks the policy model only.

## Decision Drivers

- The grant link travels over email/SMS/chat — it must be safe to treat as
  semi-exposed: fine for *viewing*, insufficient alone for *consequential*
  actions.
- One admin: revocation and reissue must be simple, audited operations.
- Races (revoke vs in-flight action) must have a defined winner.

## Options Considered

- One-time links per action — maximal safety, hostile UX for a review flow
  that customers revisit repeatedly.
- Long-lived reusable link with no step-up — link leakage = full account of
  the request, including money actions.
- **Reusable scoped grant + step-up re-verification for sensitive actions**
  (chosen).

## Decision

### Grant model (locked)

1. **One grant type — request-access grant** — scoped to exactly one
   (Customer, Request) with an action-scope set: `view` (request, quotation,
   versions, previews, payment status), `comment/request-revision`,
   `accept-quotation`, `approve-design`, `initiate-payment`,
   `request-change` (contact/shipping/reopen). One active grant per request
   per customer at a time; reissue supersedes.
2. **Reusable within validity:** the link is multi-use for `view`/`comment`
   until expiry/revocation. **No one-time links** for viewing.
3. **Expiry:** every grant has explicit `expires_at` from a config expiry
   class (`grant.standard`; duration = policy config, deferred value).
   Expired grants are re-issuable (rule 6).
4. **Sensitive actions require step-up re-verification** (fresh OTP
   challenge to a verified contact of the owning customer; challenge model =
   LC-02). Locked sensitive set: **request submission** (inherent — the
   verification that creates the customer), **quotation acceptance**,
   **design approval**, **payment initiation**, **contact change**,
   **shipping-detail change request**, **reopen approved design**,
   **customer-initiated cancellation from stage S5 onward**
   (ADR-DB3-002). A completed step-up authorizes sensitive actions within a
   short re-verification window (`grant.step-up-window` config class);
   window expiry → new challenge.
5. **Revocation triggers (locked):** admin manual (with reason); automatic
   on: grant reissue (old token invalidated), contact
   change (all grants issued to the old contact context), customer merge,
   suspected abuse (rate-limit/abuse signals per `09 §7`), and terminal
   request/order states after a config grace window.
6. **Reissue/rotation:** reissue always generates a **new token**; tokens
   are never reused or extended in place. Old token → grant `REVOKED`
   (reason: superseded).
7. **Token handling:** tokens are high-entropy secrets, stored only in
   non-reversible form (hashed) — **no plaintext at rest** anywhere,
   including notifications (ADR-DB2-003). Storage detail → DB4/security
   design.
8. **Concurrent use:** multiple devices may hold the same link; sensitive
   actions serialize on the target aggregate's transaction, not on the
   grant.
9. **In-flight revoke race (locked winner):** the grant's active status is
   checked **inside the action's transaction**; revocation committed first
   wins — a sensitive action lands only if the grant is active at commit
   time (DB8 race CC-16).
10. **Rate limits/abuse:** challenge issuance and failed-attempt limits are
    config-classed (values deferred); breach → challenge lockout + abuse
    signal (`09 §7`), audited.
11. **Ownership/audit:** grants owned by Customer context (AGG-04); issue,
    use-for-sensitive-action, revoke, reissue, step-up success/failure are
    audited (INV-14).

## Consequences

## Positive Consequences

- Leaked link exposes read access at worst for a bounded window; money and
  approval always require possession of the verified contact **now**.
- Deterministic revoke-vs-action semantics; simple mental model (one grant,
  one step-up window).

## Negative Consequences

- Customers perform an OTP step for approval/acceptance/payment — accepted
  friction on exactly the actions BR-008/`09 §2` care about.

## Risks and Mitigations

- **Risk:** OTP channel unavailable (provider outage).
  **Mitigation:** step-up is provider-agnostic (any verified contact
  channel); operational concern, not model concern.
- **Risk:** grace-window values never configured.
  **Mitigation:** deferred-parameter register entry; default-safe = grants
  expire on `expires_at` regardless.

## Rejected Alternatives

One-time action links (UX cost, no added safety over step-up); no step-up
(link leakage = full control); password accounts (out of MVP scope,
ADR-DB2-001).

## Deferred Details

- Expiry-class durations, step-up window, attempt limits/cooldowns = policy
  config values (CON-144; business sign-off; acceptance: configured before
  secure-flow feature ships). OTP provider/channels = O-005/DEC-29 (open).

## Implementation Checkpoint

DB4 (grant/challenge shapes), backend customer/security checkpoints.

## Verification Checkpoint

DB7 (token non-plaintext, single-active-grant), DB8 (revoke-vs-action,
concurrent challenges), DB10 (abuse/rate-limit audit).

## Reversal / Migration Cost

Low: tightening to one-time links or loosening the sensitive set is guard
configuration over the same records.

## References

- `docs/09-SECURITY-AND-ABUSE-PREVENTION.md` §2/§7; `docs/01-PRODUCT-REQUIREMENTS.md` §4;
  `docs/04-BUSINESS-RULES.md` BR-008; ADR-DB2-001, ADR-DB2-003
