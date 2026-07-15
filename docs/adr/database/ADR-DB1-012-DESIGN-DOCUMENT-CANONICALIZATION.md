# ADR-DB1-012 — Design-Document Ownership, Canonical Serialization and Hashing

- Status: Accepted with Deferred Parameters
- Date: 2026-07-15
- Git HEAD: `563d9863c5d9591095038a28887e217058d816e4`
- Decision IDs: DEC-06
- Requirement IDs: REQ-SESS-003, REQ-DVER-002, REQ-DVER-006, REQ-APPR-001,
  REQ-INT-006
- Invariant IDs: INV-03, INV-32
- Gap IDs: —

## Context

Design versions and approval snapshots bind to an **integrity hash** of the
design document (`05 §9`, `06 §4/§9`), and production must reference the
exact approved artifact (INV-03). Hashes must be reproducible on any machine
(INV-32). `packages/design-document` exists as an approved empty stub;
`REPOSITORY_STRUCTURE` already assigns it "design-document types, validation,
serialization, and migrations". The full document schema is **not** designed
here (DB2/DB4 + package-owning checkpoint).

## Decision Drivers

- Bit-identical hash input across machines, Node versions, and (potentially)
  languages → a *specified* canonical form, not incidental serializer
  behavior.
- Historical snapshots live for years → explicit document schema versioning
  with backward-read.
- Hash purpose is **integrity linkage** (approval ↔ version ↔ production),
  not authentication — no keys/MAC involved.

## Options Considered

| Option | Deterministic? | Notes |
| --- | --- | --- |
| Naive `JSON.stringify` | No — property order = insertion order, engine-dependent number edge cases | rejected |
| Stable key sorting (ad hoc) | Mostly — but numbers/unicode edge cases unspecified | rejected as unspecified |
| **RFC 8785 JCS (JSON Canonicalization Scheme)** | Yes — published spec: sorted keys, exact ES-number serialization, UTF-8 | **chosen** |
| Custom domain serializer | Yes if done right — but we'd be writing an unreviewed private spec | rejected |

## Decision

### Ownership (locked)

1. **`packages/design-document` owns** the design-document type definitions,
   validation, canonical serialization, hashing, and **document-format
   migrations** (per REPOSITORY_STRUCTURE). Backend modules and the editor
   consume it; no other package may re-implement serialization or hashing.
2. **The database stores the versioned document payload opaquely**: a
   `jsonb` payload + `document_schema_version` + hash columns on
   design-version rows (shape finalized at DB4). PostgreSQL never interprets
   or migrates document internals.
3. **Document migrations ≠ database migrations.** Document-format upgrades
   are code in the owning package with their own version bumps; they never
   appear as SQL migrations.

### Versioning (locked)

4. Every persisted document carries an integer `document_schema_version`.
5. **Backward-read policy:** the package must read all historical versions
   (upgrade-on-read into the current in-memory model).
6. **Historical snapshots are never migrated in place** — an approved/sent
   snapshot's stored bytes (and therefore its hash) are frozen
   (ADR-DB1-010); they are *interpreted by version* on read. Re-serialized
   upgrades may exist only as **new** versions/derived copies, never
   overwrites.

### Canonicalization and hashing (locked direction)

7. **Canonical form: RFC 8785 JCS** applied to the document payload.
   Constraints the document schema must honor (enforced by the package's
   validation, detailed at the package checkpoint):
   - Numbers must be JSON-interoperable (IEEE-754 doubles, serialized per
     JCS/ECMAScript rules); values needing exactness beyond that (if any)
     are stored as strings by the schema.
   - `undefined`/omitted fields are **omitted entirely** (no nulls standing
     in for absence unless the schema says a field is nullable).
   - **Array order is significant** (z-order/layers) and is preserved as
     authored — JCS does not reorder arrays.
   - **Unicode normalization: NFC applied at the input boundary** (editor →
     API validation) before persistence; JCS itself does not normalize, so
     the package normalizes strings on ingest to keep hashes stable across
     input sources.
8. **Hash algorithm: SHA-256** over the UTF-8 bytes of the JCS form.
9. **Hash input boundary:** the canonical document payload **only** —
   excluding envelope/DB metadata (IDs, timestamps, schema-version column,
   author). `document_schema_version` is recorded alongside the hash, so the
   hash is always interpreted with its version.
10. **Storage format:** lowercase hex with algorithm prefix —
    `sha256:<64 hex>` — in `*_hash` columns (ADR-DB1-006).
11. **Preview hash is separate:** SHA-256 over the preview binary bytes
    (`preview_hash`), independent of the document hash (approval snapshot
    stores both per `06 §9`).
12. **Purpose:** integrity linkage between version ↔ approval ↔ production
    artifacts. Not authentication, not tamper-proofing against a privileged
    attacker — those are handled by immutability enforcement (ADR-DB1-010)
    and access control.
13. **Cross-language expectation:** because JCS + SHA-256 are specified
    standards, any future non-TypeScript consumer can reproduce hashes; the
    package's test vectors (DB7) are the compatibility contract.

## Consequences

## Positive Consequences

- Hash reproducibility is grounded in a published spec + test vectors, not
  in one library's incidental behavior (INV-32).
- Approval/production linkage (INV-03) gets a stable, verifiable primitive.

## Negative Consequences

- The document schema must live within JSON-interoperable numbers (JCS
  constraint) — a real design constraint on the editor model, documented for
  the package checkpoint.

## Risks and Mitigations

- **Risk:** a JS JCS implementation deviates on edge cases.
  **Mitigation:** package ships RFC 8785 test vectors + golden-hash fixture
  tests run in CI on every machine (DB7 gate).
- **Risk:** accidental double-normalization or non-NFC input sneaks in.
  **Mitigation:** validation rejects non-NFC strings at ingest (normalize +
  compare), covered by package tests.

## Rejected Alternatives

- Naive `JSON.stringify` (non-deterministic property order);
  ad hoc key sorting (unspecified number/unicode behavior);
  custom binary serialization (private spec burden);
  hashing the DB row (couples hash to storage details).

## Deferred Details

- **Deferred:** the design-document JSON schema itself, element/layer model,
  exact validation rules, JCS library choice vs in-package implementation,
  document-migration mechanics. **Owners:** DB2 (conceptual placement), DB4
  (column shape), package-owning checkpoint (schema + implementation).
- **Why DB2 is safe:** DB2 only needs ownership, versioning, and hash
  semantics — all locked above. Acceptance to close: package implements JCS
  + SHA-256 with test vectors; DB7 proves cross-machine hash equality.

## Implementation Checkpoint

Package-owning checkpoint + DB6 (columns wired), DB4 (row shape).

## Verification Checkpoint

DB7 (golden-hash/cross-machine tests), DB8 (approval linkage transactional
tests).

## Reversal / Migration Cost

Algorithm change later = new hash column + dual-hash transition for new
records (old hashes stay valid for their era); moderate, contained.

## References

- RFC 8785 — JSON Canonicalization Scheme — https://www.rfc-editor.org/rfc/rfc8785
- RFC 9562 context for IDs (separate) — see ADR-DB1-007
- SHA-256 (FIPS 180-4) — https://csrc.nist.gov/pubs/fips/180-4/upd1/final
- `docs/05-DESIGN-STUDIO-SPEC.md` §9; `docs/06-ORDER-AND-DESIGN-LIFECYCLE.md`
  §4, §9; `docs/architecture/REPOSITORY_STRUCTURE.md` (`packages/design-document`)
