# DB4 — Context Schema: Identity & Customer (CTX-IDN / CTX-CUS)

**Date:** 2026-07-15 · **Git HEAD:** `a79f523` · Logical only.
Tables: TBL-001..010, TBL-078 ([`DB4_TABLE_CATALOG.md`](./DB4_TABLE_CATALOG.md));
columns in [`DB4_COLUMN_DICTIONARY.md`](./DB4_COLUMN_DICTIONARY.md);
constraints CST-* / relationships REL-* per their catalogs.

## 1. Structures

| Table | Role |
|---|---|
| `admin_accounts` / `admin_credentials` / `admin_sessions` (TBL-001..003) | single-operator identity; credential model provider-abstract (DEC-29 open); sessions hashed-token, revocable |
| `customers` (TBL-004) | verified customer root; `merged_into_customer_id` tombstone pointer; `anonymized_at` scrub marker |
| `business_profiles` (TBL-078) | dormant B2B child (0..1) — additive readiness only |
| `customer_contact_points` (TBL-005) | normalized email/phone; the **verified link** is the unique object (CST-005), one primary (CST-006) |
| `contact_verification_challenges` + `_attempts` (TBL-006/007) | transient OTP challenges (purposes SUBMISSION/STEP_UP), hashed code, append-only attempts |
| `secure_access_grants` (TBL-008) | hashed-token request-access grants, scope = (customer, request) |
| `customer_merge_cases` + `_events` (TBL-009/010) | admin-only merge workflow + append-only transfer evidence |

## 2. Modeling assertions (task §15.1)

1. **Customer creation only after verified submission** (ADR-DB2-001
   Option A): `customers.verified_at` NOT NULL — a row cannot exist
   unverified; challenges reference sessions (REL-007), not customers,
   pre-creation. Guest sessions leave no identity residue (TBL-025 is the
   only guest structure; hard-TTL).
2. **No password customer in MVP:** no credential columns exist on
   `customers`; admin credentials are a separate context (TBL-002).
3. **Normalized contacts:** `normalized_value` (lowercase email /
   E.164-style phone per CON-163/164) + `display_value` copy;
   `verified_at`/`verified_source` record proof.
4. **No raw auto-merge:** uniqueness applies to the **active verified
   link** (CST-005 partial unique), not the raw string; unverified matches
   never link (App rule, ADR-DB2-001 r5); merge is the only identity-join
   path and is an audited admin workflow (TBL-009/010, CC-27/D8-18).
5. **Grant token hash only** (CST-008; D7-12 asserts no plaintext);
   `scope_kind = REQUEST_ACCESS` single grant type (ADR-DB3-004 r1) bound
   to exactly one (customer, request) with NOT NULL FKs (REL-009/010);
   single active grant per pair (CST-009); expiry mandatory
   (`expires_at` NOT NULL, value from config); revocation columns +
   supersede chain (REL-011). Revoke-vs-use race resolved in the action
   transaction (CST-116, D8-20).
6. **Step-up verification:** STEP_UP-purpose challenges (TBL-006) are
   referenced as evidence columns by every sensitive-action record
   (approval snapshot, quotation acceptance, payment attempt, cancellation
   request, fee acknowledgement, design review APPROVE) — see REL-050/053/
   070/080/085.
7. **Merge never rewrites history:** merge repoints live identity refs and
   revokes loser grants (TBL-010 steps); immutable snapshots keep their
   frozen contact copies (approval_snapshots §TBL-031 note); loser row is
   tombstoned via `merged_into_customer_id`, never deleted.

## 3. State & history

LC-01 (account ACTIVE/LOCKED/DISABLED; session ACTIVE/EXPIRED/REVOKED),
LC-02 (challenge), LC-03 (grant), merge process REQUESTED/EXECUTED/REJECTED
— all `status text + CHECK` (CST-060). History: Tier B/C per ADR-DB4-002
(attempts, merge events, state timestamps + audit).

## 4. Retention

Challenges/attempts transient (hard-TTL); sessions oper; customers/contacts
commercial + field anonymization; grants operational retained as evidence;
merge records retained. Loser anonymization follows the survivor schedule
(DB3 merge spec §5).
