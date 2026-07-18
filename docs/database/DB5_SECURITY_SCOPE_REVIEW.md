# DB5 — Security Scope Review

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Basis:** `docs/09-SECURITY-AND-ABUSE-PREVENTION.md`,
[ADR-DB3-004](../adr/database/ADR-DB3-004-SECURE-GRANT-AND-REVERIFICATION.md),
INV-08/09/20/21/22, GRD-002/003, CST-116.

**Central rule:** a security scope predicate is part of the **query**, not a
filter applied to its results. An index that makes an unscoped lookup
convenient is a liability, and this review checks for both directions —
scopes that are missing, and indexes that would invite bypassing them.

## 1. The authorization model in one paragraph

There are no customer passwords. Customer access to a request is granted by
a **secure access grant** (TBL-008): a high-entropy token, stored **hashed
only**, bound to exactly one `(customer_id, custom_request_id)` pair
(REL-009/010, INV-08). Sensitive actions additionally require a **step-up**
verification challenge (GRD-003). Admin access is session-based (TBL-003).
Grant validity — `status`, `expires_at`, scope — is evaluated **inside the
acting transaction** (CST-116, CC-16 revoke-wins), never inferred from the
lookup succeeding.

## 2. Per-query scope review

| Q | Actor | Scope predicate (must be in the query) | Index | IDOR risk if omitted | Verdict |
|---|---|---|---|---|---|
| **Q-08** | Customer | `token_hash = ?` — this *is* the boundary | IDX-007 | n/a — it establishes scope | ok |
| **Q-09** | Customer | grant's `custom_request_id` **must equal** the requested id | PK + IDX-075 | **high** — request detail by id alone exposes another customer's case | ok |
| Q-10 | Customer/Admin | grant → case ownership, or admin session | IDX-023 | medium — design history leak | ok |
| **Q-11** | Customer | grant → case ownership | IDX-024 | medium | ok |
| Q-12/Q-13 | Customer | grant → request → quotation | IDX-039/037 | medium — pricing leak | ok |
| **Q-14** | Admin/System | internal only; no customer path | IDX-025 | n/a | ok |
| **Q-15** | Customer/Admin | grant scope, or admin session | IDX-031/032 | **high** — order by `code` must never be a customer authz path | ok |
| **Q-16** | Admin | internal/financial; admin session | IDX-043/079/080/081 | **high** — financial data | ok |
| Q-17..Q-24 | Admin | admin session | various | high | ok |
| Q-25..Q-28 | System/Worker | internal; no external caller | various | n/a | ok |
| Q-29 | Admin | admin session | IDX-095..098 | high — audit trail | ok |
| **Q-30** | Customer/Admin | authorization to the **owning entity** + `assets.classification` | PK + IDX-099 | **high** — private originals / production files | ok |
| **Q-31** | System | security-sensitive; internal | IDX-006 | n/a | ok |
| Q-32 | System | internal, in-transaction | IDX-016 | n/a | ok |
| **QX-02** | System/Admin | internal saga | IDX-103/104 | n/a | ok |
| QX-09 | Admin/System | internal dispatch | IDX-035/036 | n/a | ok |
| QX-11 | System | security-sensitive rate limiting | IDX-111 | n/a | ok |

**Every customer-facing query resolves scope through the grant.** None is
served by an index that would make a bare resource-id lookup the natural
path.

## 3. Token and hash lookups

| Secret | Column | Storage | Index | Comparison |
|---|---|---|---|---|
| Customer grant token | `secure_access_grants.token_hash` | **hash only** | IDX-007 | bytewise `C`, exact |
| Admin session token | `admin_sessions.token_hash` | hash only | IDX-003 | bytewise, exact |
| Design session secret | `design_sessions.session_secret_hash` | hash only | IDX-021 | bytewise, exact |
| OTP code | `contact_verification_challenges.code_hash` | hash only | — (not a lookup key) | in-transaction compare |
| Admin credential | `admin_credentials.credential_reference` | hashed/opaque | — | not a lookup key |

Locked properties (ADR-DB5-002 R1/R2/R5):

- **No plaintext secret column exists** anywhere (COL dictionary §14.2,
  D7-12).
- Comparison is **bytewise under `C` collation** — never case-folded, never
  accent-insensitive, never a prefix or fuzzy match. A **nondeterministic
  collation on any of these columns would make two distinct tokens compare
  equal**, which is an authentication bypass. ADR-DB5-002 R5 prohibits it
  explicitly for Population A.
- `code_hash` is deliberately **not indexed**: the challenge is located by
  `(contact_kind, normalized_value, purpose)` (IDX-006) and the code is then
  compared on that row. Indexing the OTP hash would create a
  "find the challenge matching this code" path — an offline-guessing
  affordance with no legitimate use.

## 4. Grant status is not in the index predicate — deliberately

IDX-007 (`token_hash`) has **no status predicate**. Two reasons, both
security-relevant:

1. An expired or revoked token must still **resolve**, so the caller gets a
   deterministic `GRANT_INVALID` rather than an indistinguishable "not
   found". Collapsing those two outcomes leaks whether a token ever existed.
2. A grant revoked mid-request would **fall out of a partial index** between
   the lookup and the action, turning a clean authorization failure into an
   inconsistent one.

Validity is evaluated in the acting transaction (CST-116, ADR-DB3-004 r9);
**revoke wins** (CC-16). The index finds the row; the transaction decides.

## 5. Grant scope binding (INV-08)

`secure_access_grants.custom_request_id` (COL-TBL008-02) binds the grant to
exactly one request. Every customer query must compare the resolved grant's
`custom_request_id` against the requested resource — a column comparison on
an already-fetched row, needing no index.

`CST-009` (IDX-008) enforces **one active grant per (customer, request)**;
reissue supersedes the prior grant (REL-011) and the chain is retained as
evidence.

**Deliberate absence:** there is no index designed to make "fetch request by
id without a grant" efficient. `custom_requests` is reached by PK (already
grant-verified) or by `code` (IDX-028, **admin only**). `code` is explicitly
**never an authorization input** (COL-TBL037-01) — the same rule applies to
`orders.code` (IDX-031).

## 6. Step-up evidence

Sensitive actions record step-up challenge references as **evidence
columns**, never as filters:

| Action | Evidence | Table |
|---|---|---|
| Design approval | `grant_id`, `step_up_challenge_id` | TBL-030, TBL-031 (COL-TBL031-10) |
| Quotation acceptance | same | TBL-053 |
| Payment initiation | same | TBL-055 |
| Cancellation ≥S5 | same | TBL-046 |
| Shipping fee acknowledgement | same | TBL-049 |

**None of these columns is indexed** — they are written as proof, never
queried as a filter. Indexing them would suggest a lookup path
("all actions performed under this challenge") that no requirement needs and
that would aggregate security evidence into a convenient target.

## 7. Asset access (Q-30) — INV-09/21/22

| Control | Mechanism |
|---|---|
| Private by default | `assets.classification` (COL-TBL022-02), `CUSTOMER_PRIVATE`/`PRODUCTION_SENSITIVE`/`PUBLIC` |
| Signed, short-lived URLs | application layer (CON-044) |
| Customer previews watermarked | `asset_derivatives.is_watermarked` (INV-22) |
| Production artifacts internal-only | INV-21; TBL-061 reached only from a job |
| Gallery exposes public derivatives only | CST-123; classification checked on the joined asset row |

The index design supports this by **what it omits**: there is no index
spanning asset consumers, and no "all associations of this asset" path
(ADR-DB4-003 — associations are context-specific, and there is no
polymorphic `asset_links` table). Lineage is walked **forward** from the
owning entity, so authorization is always checked at the owner before the
asset is resolved. A reverse index would create precisely the
cross-context read path that ADR-DB4-003 rejected — with a security
consequence, not just an architectural one.

An index cannot enforce classification; D7-12 tests the representation.

## 8. Financial and admin scope

- Q-16, Q-17, Q-18, Q-23 and refund paths are **admin-session scoped**; no
  grant grants access to them.
- `payment_reconciliations.bank_reference` and `refunds.transfer_reference`
  are `[SEC]` access-controlled and **not indexed** — no query looks a
  payment up by bank reference, and creating that path would widen exposure
  of manual-transfer evidence.
- `shipping_details.tracking_code` is **not indexed** — an
  order-by-tracking-code lookup would be an unauthenticated enumeration
  surface (D-017 keeps it internal).
- Payment success is **never** based on a browser redirect: the
  `payment_provider_events` chain with server-side `signature_valid`
  (INV-15) is the source of truth.

## 9. PII search restrictions

| Column | Class | Indexed? | Note |
|---|---|---|---|
| `customer_contact_points.normalized_value` | [PII] | yes — IDX-004 | required for identity matching (CST-005); **exact match only**, never substring |
| `customer_contact_points.display_value` | [PII] | **no** | display copy, never a lookup key |
| `customers.display_name` | [PII] | **no** | no catalogued search |
| `approval_snapshots.contact_*` | [PII] frozen | **no** | evidence; redaction only via break-glass |
| `shipping_details` / `shipping_snapshots` address fields | [PII] | **no** | read by `order_id` only |
| `business_profiles.company_name`, `tax_code` | [PII] | **no** | dormant B2B |

**No fuzzy or substring index exists on any PII column.** This is not
incidental: a trigram index on names or addresses would make bulk PII
harvesting cheap and would be a data-protection regression, so
ADR-DB5-002 R6's escalation ladder deliberately stops at prefix search on
already-normalized technical columns for MVP.

Anonymization is **field-level scrub** (`anonymized_at`), and it never
rewrites historical snapshots (§7 of the archive doc).

## 10. Findings

**No missing security-scope predicate was found.** Every customer-facing
query in the catalog carries its owner/grant scope, and every index either
supports a scoped path or belongs to an internal/admin path.

Three properties worth recording as deliberate design outcomes rather than
omissions:

1. **No index makes an unscoped resource lookup convenient** (§5).
2. **No secret is stored or compared in a form that a collation choice could
   weaken** (§3).
3. **No index aggregates security evidence or PII into a searchable
   surface** (§6, §9).

## 11. Validation handoff

- **DB7:** **D7-12** (no plaintext secret columns; notification params
  exclude OTP/token/URL; asset classification representation; gallery
  exposes public derivatives only).
- **DB8:** **D8-20** (grant revoke vs in-flight action, CC-16), D8-21
  (concurrent verify, CC-17), D8-18 (merge vs in-flight activity, CC-27).
- **DB9:** seed must include a second customer with its own request and
  grant, so IDOR tests can attempt cross-customer access with a valid token.
- **DB10:** any new index on a `[SEC]` or `[PII]` column is a governance
  review item, not a routine tuning change.
