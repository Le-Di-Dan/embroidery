# DB6 Migration Matrix Report (S26)

## 1. Migration integrity

- 31 migrations, `0000`–`0031` (idx 17 is a permanent, intentional gap — no file, no journal
  entry — carried since the migration folder was first assembled).
- Journal (`packages/database/migrations/meta/_journal.json`) has exactly 31 entries, one
  per migration file, unique `idx` sequence, deterministic ordering.
- All 31 `.sql` files exist on disk; every journal entry's `tag` matches its file's
  basename.
- No historical file (`0000`–`0030`) was edited in this slice — confirmed by re-running the
  fresh/upgrade matrix (§2) with no diff against the already-committed files.
- `npx drizzle-kit check` clean before and after this slice.

## 2. Fresh install matrix (fresh-A / fresh-B)

Two independent disposable databases, each `empty → 0031`:

| DB | Tables | Columns | FK | PK | UQ | CHECK | Indexes | Partial | JSONB | Triggers | Fns |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `embroidery_s26_fresh_a` | 78 | 833 | 160 | 78 | 50 | 189 | 211 | 46 | 9 | 30 | 1 |
| `embroidery_s26_fresh_b` | 78 | 833 | 160 | 78 | 50 | 189 | 211 | 46 | 9 | 30 | 1 |

Identical on every metric. Both dropped after use.

## 3. Upgrade prefix matrix

Four representative prefixes, each: apply the prefix migrations only → seed one
`admin_accounts` row + one `customers` row (chosen because both tables exist from
migration `0000`/`0005`, present in every prefix) → apply the remaining migrations through
`0031` → verify.

| Prefix | Boundary migration | Seed survived | Final metrics match §2 | No table rebuild |
|---|---|---|---|---|
| G10 | `0014_create_secure_grants_soft_holds_and_customer_merge.sql` | yes (1/1 admin, 1/1 customer) | yes | yes |
| G15 | `0023_create_order_reservation_shipping_tables.sql` | yes (1/1, 1/1) | yes | yes |
| G19 | `0029_create_audit_events_table.sql` | yes (1/1, 1/1) | yes | yes |
| S24 | `0030_add_integrity_triggers.sql` | yes (1/1, 1/1) | yes | yes |

"No table rebuild" is verified structurally: every migration in this project is additive
(`CREATE TABLE`/`ALTER TABLE ADD CONSTRAINT`/`CREATE INDEX`/`CREATE FUNCTION`/
`CREATE TRIGGER`), so applying the suffix after a prefix never rewrites an existing table —
confirmed by the seed rows surviving byte-identical and by the identical post-upgrade
fingerprint (§4).

## 4. Deterministic schema fingerprint

`packages/database/tools/db-schema-fingerprint.mjs` normalizes the live catalog (columns
with type/nullability/default; constraint definitions; index definitions; function
definitions; trigger definitions) into canonical JSON — excluding OIDs, creation
timestamps, and any other unstable/physical-storage identifier — and SHA-256 hashes it.

All six databases (2 fresh installs + 4 upgrade prefixes) produce the **identical**
fingerprint:

```
4ca56a5967730d257edb34e72d6c40373156704cab7c87e3a684803c8321672f
```

Re-running `drizzle-kit generate`'s underlying migration application a second time on
`embroidery_s26_fresh_a` (no-op reapply — journal already covers all 31 entries) reproduced
the same fingerprint, confirming no drift from reapplication.

## 5. No-op / drift

On `embroidery_s26_fresh_a` after the full matrix:

- Migration reapply: no-op (journal already at idx 31, `migrate()` applied zero additional
  files).
- `drizzle-kit check`: `Everything's fine`.
- Duplicate object scan (`tools/db-live-indexes-check.mjs`): 0 duplicate index definitions.
- Fingerprint after reapply: unchanged (§4).

## 6. Negative fixtures (disposable only)

Run inside a single rolled-back transaction on `embroidery_s26_fresh_a` — nothing
persisted, atomic rollback confirmed:

| Case | Expected | SQLSTATE | Result |
|---|---|---|---|
| Fractional VND insert (`products.base_price_amount = 100.50`) | rejected | `23514` (CHECK) | PASS |
| Duplicate `admin_accounts.email` | rejected | `23505` (UNIQUE) | PASS |
| `UPDATE audit_events` post-S24 (append-only trigger) | rejected | `23000` (custom, no PII in message) | PASS |

No silent repair attempted; each failure aborted only its own savepoint, the encompassing
transaction was rolled back in full, and the database was dropped immediately after.

## 7. Persistent dev DB policy compliance

Read-only query at the start and end of this slice: `SELECT max(id) FROM
drizzle.__drizzle_migrations` → `29` both times. Never upgraded, reset, seeded, repaired, or
used for any negative fixture during S26. All mutating validation used six disposable
databases, all dropped after use.
