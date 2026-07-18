# DB5 — Index Design: Identity & Customer (CTX-IDN / CTX-CUS)

**Date:** 2026-07-18 · **Git HEAD:** `456e101`
**Tables:** TBL-001..TBL-010, TBL-078 · **Owner:** IDN, CUS
**Index IDs:** IDX-001..009, 062, 105..107, 111, 112, 120, 121, 129, 130,
134, 135

This context holds the platform's **authorization boundary**. Index design
here is a security concern before it is a performance concern.

## 1. Admin login and session

| Path | Predicate | Index | Notes |
|---|---|---|---|
| Admin login by email | `email = ?` | IDX-001 (CST-002) | Population A, bytewise `C`; values stored normalized (ADR-DB5-002 R3) so **no `lower()` index** |
| One active admin | `status='ACTIVE'` | IDX-002 (CST-003) | partial unique holding ≤1 row |
| Session resolve | `token_hash = ?` | IDX-003 (CST-004) | [SEC]; hashed only — D7-12 asserts no plaintext column exists |
| Sessions by account (revoke-all) | `admin_account_id = ?` | IDX-120 | recommended |
| Session expiry sweep | `status='ACTIVE' AND expires_at < now()` | IDX-121 | partial; time comparison is a **range scan on the key**, never in the predicate (ADR-DB5-003 R3) |

`admin_credentials` (TBL-002) gets **no index beyond its PK**: the
credential is fetched via the already-resolved account, the table holds a
handful of rows, and `credential_reference` is `[SEC]` opaque — indexing it
would create a lookup path that no legitimate flow needs.

## 2. Normalized contact points

`customer_contact_points.normalized_value` (COL-TBL005-03) is the system's
identity-matching key.

| Path | Predicate | Index |
|---|---|---|
| Active verified link (uniqueness + lookup) | `(contact_kind, normalized_value) WHERE verified_at IS NOT NULL AND deactivated_at IS NULL` | IDX-004 (CST-005) |
| Primary contact | `(customer_id) WHERE is_primary` | IDX-005 (CST-006) |
| **All** contacts of a customer | `customer_id = ?` | **IDX-134** |

IDX-134 is required and is **not** redundant with IDX-005. CST-006's index
is partial to `is_primary`, so it cannot answer "every contact of this
customer" — which is exactly what the merge path (CC-27) and the customer
detail view need. Relying on the partial index would silently return only
the primary contact: a correctness bug that would surface as *missing data
during a merge*, not as slowness.

`display_value` (COL-TBL005-04) is never indexed — it is the as-entered
copy and is never a lookup key (ADR-DB5-002 R3).

## 3. Verification challenges and rate limiting

| Path | Predicate | Index | Guard |
|---|---|---|---|
| **Q-31** active challenge | `(contact_kind, normalized_value, purpose) WHERE status='ISSUED'` | IDX-006 (CST-007) | CC-17 arbiter — one open challenge per (target, purpose) |
| Challenge by contact point | `contact_point_id IS NOT NULL` | IDX-130 | REL-006 |
| Challenge expiry | `(expires_at, id) WHERE status='ISSUED'` | IDX-112 | hard-TTL |
| **QX-11** attempt rate window | `(challenge_id, attempted_at)` | IDX-111 | **GRD-026** |

IDX-006 does double duty: it is the uniqueness arbiter that makes concurrent
challenge issuance safe (CC-17), and it is the exact access path for Q-31.
No separate performance index is permitted on this path.

IDX-111 is the **only** non-PK index on `contact_verification_attempts`,
which is append-only and security-hot. The rate window (GRD-026) is
evaluated inside the issuing/verifying transaction, so this index is on the
critical path of every OTP entry — but one index is the correct number: the
`(challenge_id, attempted_at)` composite serves both the per-challenge count
and the time-window range in one scan.

## 4. Secure access grants — the authorization boundary

| Path | Predicate | Index | Priority |
|---|---|---|---|
| **Q-08** token → grant | `token_hash = ?` | **IDX-007** (CST-008) | **P0** |
| Single active grant | `(customer_id, custom_request_id) WHERE status='ACTIVE'` | IDX-008 (CST-009) | integrity |
| Grants for a request | `custom_request_id = ?` | IDX-106 | required |
| **All** grants of a customer | `customer_id = ?` | **IDX-107** | required |
| Expiry sweep | `(expires_at, id) WHERE status='ACTIVE'` | IDX-105 | hygiene |

Three decisions here are load-bearing:

**Status is deliberately absent from IDX-007's predicate.** A partial index
on `status='ACTIVE'` would look tighter and would be wrong twice over: an
expired or revoked token must still *resolve* so the caller receives
`GRANT_INVALID` rather than an indistinguishable "not found", and a grant
revoked mid-request would fall out of the index between the lookup and the
action. Grant validity is evaluated in the acting transaction (CST-116,
ADR-DB3-004 r9, CC-16 revoke-wins) — not by index membership.

**IDX-107 is required despite IDX-008 leading with `customer_id`.** IDX-008
is partial to `ACTIVE`; the merge path must find and revoke *every* grant of
the loser customer including expired and revoked ones (CC-27). This is the
same class of error as §2's: a partial index used as a full access path
silently omits rows.

**The lookup key is the hash, never the token.** Bytewise `C` comparison, no
case folding, no nondeterministic collation, no prefix or fuzzy match
(ADR-DB5-002 R1/R5). A nondeterministic collation here would make two
distinct tokens compare equal — a direct authentication bypass.

## 5. Customer merge

Merge (CC-27) locks both customer rows in a deterministic order, then
repoints every row owned by the loser. The indexes that make that
enumeration complete:

| Owned rows | Index | Context |
|---|---|---|
| contact points | IDX-134 | CUS |
| grants (all states) | IDX-107 | CUS |
| custom requests | IDX-117 | ORD |
| orders | IDX-118 | ORD |
| assets uploaded | IDX-119 | AST |
| merge evidence | IDX-135 | CUS |
| tombstone pointer | IDX-129 | CUS |

**Historical snapshots are never rewritten** (DB4 locked; REL-014 note).
`approval_snapshots.customer_id`, frozen contact copies
(COL-TBL031-09) and order/quotation display snapshots keep pointing at the
pre-merge values by design. No index exists to "find snapshots to rewrite",
because rewriting them is prohibited — the absence of that index is part of
the invariant.

`customer_merge_cases` (TBL-009) gets **no queue index** (IDX-R03): a
handful of rows over the product's lifetime, and CST-010's partial unique
leads with `survivor_customer_id`, which is useless for a status scan.

## 6. Owner-scoped access

Every customer-facing read is scoped by the resolved grant, never by
resource id alone. The index design supports this by making the *grant*
lookup the entry point (IDX-007) and the request-scope check a column
comparison on the fetched grant row (`custom_request_id`, INV-08). There is
deliberately **no index** that would make "fetch request by id" convenient
without a grant — see
[`DB5_SECURITY_SCOPE_REVIEW.md`](./DB5_SECURITY_SCOPE_REVIEW.md).

## 7. Business profiles

TBL-078 carries only IDX-062 (CST-051 unique `customer_id`). It is dormant
B2B readiness with no workflow reading it in MVP; `company_name` and
`tax_code` are **not** indexed — that would be a speculative index for a
feature that does not exist (ADR-DB5-004 R4).

## 8. Write-cost summary

| Table | Profile | Indexes (incl. PK) | Budget | Status |
|---|---|---|---|---|
| TBL-001 admin_accounts | read-mostly | 3 | ≤6 | ok |
| TBL-002 admin_credentials | read-mostly | 1 | ≤6 | ok |
| TBL-003 admin_sessions | moderate | 4 | ≤5 | ok |
| TBL-004 customers | low | 2 | ≤5 | ok |
| TBL-005 contact_points | low | 4 | ≤5 | ok |
| TBL-006 challenges | **temp, high churn** | 4 | ≤5 | ok — hard-TTL keeps the table tiny |
| TBL-007 attempts | **append-heavy** | 2 | ≤3 | ok |
| TBL-008 grants | moderate | 5 | ≤5 | at budget |
| TBL-009 merge_cases | rare | 2 | ≤5 | ok |
| TBL-010 merge_events | append | 2 | ≤3 | ok |
| TBL-078 business_profiles | dormant | 2 | ≤6 | ok |

`secure_access_grants` sits **at** its budget with five indexes. Justified:
it is the authorization table, four of the five are either the security
probe (IDX-007), an integrity constraint (IDX-008), or merge-correctness
paths (IDX-106/107). Its write rate is one row per issued link — bounded by
request volume, not by traffic.

## 9. Validation handoff

- **DB7:** D7-12 (no plaintext secret column; hash-only lookups), D7-13
  (uniqueness families CST-002..CST-010).
- **DB8:** D8-20 (grant revoke vs in-flight action, CC-16), D8-21
  (concurrent challenges/verify, CC-17), D8-18 (merge races, CC-27).
- **DB9:** seed must include expired and revoked grants, deactivated
  contacts, and a merged customer pair — otherwise the partial-index-as-full-path
  errors this document warns about would not be caught.
