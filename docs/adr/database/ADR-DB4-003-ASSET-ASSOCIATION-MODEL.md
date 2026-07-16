# ADR-DB4-003 — Asset Association Model

- Status: Accepted
- Date: 2026-07-15
- Git HEAD: `a79f5235fd35f76076148cfc53a3eb18f538730b`
- Decision IDs: — (DB4-owned modeling decision)
- Requirement IDs: REQ-ASSET-001..007, REQ-MEDIA-001, REQ-GAL-001,
  REQ-PROD-003, REQ-TMPL-002
- Invariant IDs: INV-09, INV-10, INV-21, INV-22, INV-25
- Gap IDs: —

## Context

The Asset module owns Asset rows (metadata + object-storage reference);
**semantic meaning** of an asset to a consumer (product photo, COP image,
design upload, production file, gallery image, template artwork) is owned by
the consuming module (DB2 AGG-08, ownership matrix). DB4 must fix how those
associations are stored without weak generic polymorphism.

## Decision Drivers

- INV-25: associations need real FKs on both ends.
- Module ownership: the association row lives with (and is migrated/retained
  with) its consumer, not with Asset.
- Association metadata differs per consumer (role, display order, preview
  hash) — a generic link table flattens these into untyped columns.
- Some references are structurally 1–1/0..1 and need no link table at all.

## Options Considered

1. **Generic `asset_links`** (`owner_type`, `owner_id`, `asset_id`) — no FK
   to owners, no typed metadata, ownership leak into Asset context.
   Prohibited by task §8.3 for core relationships.
2. **Context-specific association tables** — typed, FK-integral, owned by
   the consumer.
3. **Direct asset reference columns** — for single-valued references.
4. **Hybrid of 2 + 3 (chosen).**

## Decision

**Hybrid: direct FK columns for single-valued references; context-owned
association tables for multi-valued or metadata-bearing associations. No
generic polymorphic link table exists.**

### Direct reference columns (locked)

| Column | Table | Meaning |
|---|---|---|
| `background_asset_id` | `product_sides` | side background image |
| `preview_derivative_id` | `design_versions` | watermarked preview (asset derivative) |
| `preview_derivative_id` | `design_templates` | listing preview |

### Context-owned association tables (locked)

| Table | Owner ctx | Association meaning |
|---|---|---|
| `product_media` (TBL-017) | CAT | product gallery/media, role + display order |
| `design_session_assets` (TBL-026) | DSN | uploads used by a session |
| `design_version_assets` (TBL-029) | DSN | uploads frozen into a formal version |
| `design_template_assets` (TBL-036) | DSN | store-authored artwork sources (private) |
| `custom_request_assets` (TBL-040) | ORD | COP images / request attachments, role |
| `production_artifacts` (TBL-061) | PRD | digitized/machine files, photos (internal, unwatermarked) |
| `gallery_entry_assets` (TBL-065) | GAL | published showcase images (public derivatives only) |

### Rules (locked)

1. Every association row has NOT NULL FKs to **both** its owner aggregate
   and `assets.id` (restrict-on-delete; asset deletion is two-phase
   tombstone coordination per ADR-DB1-011, never a cascade into consumers).
2. Association tables carry their own typed metadata (`role`,
   `display_order`, captions) — no shared generic shape.
3. **Access classification stays on the Asset** (`classification` +
   derivative `is_watermarked`); consumers never override it. Gallery may
   associate only public-derivative material; production artifacts are
   internal-only (INV-21/22) — enforced App-side with DB7 representation
   tests (cross-table CHECKs are not expressible as column constraints).
4. Derivatives (`asset_derivatives`) are children of Asset; consumers that
   need a specific derivative (preview) reference `asset_derivatives.id`
   directly.
5. New consumers add **their own** association table; extending a generic
   table is not an option (it does not exist).

## Consequences

### Positive

- Full FK integrity + per-consumer retention/migration autonomy; deleting
  or archiving a consumer never touches Asset internals.

### Negative

- Seven small tables instead of one generic one — accepted, they are
  trivially uniform to implement.

## Rejected Alternatives

Generic `asset_links` (weak polymorphism, no FK); associations owned by the
Asset module (ownership inversion — Asset must not know consumers).

## Deferred Details

None.

## Implementation / Verification Checkpoints

DB6 (tables/FKs) · DB7 (FK tests; gallery/production classification
representation tests) · DB10 (two-phase deletion audit).

## Reversal / Migration Cost

Low — associations are additive structures.

## References

- DB2 AGG-08 / `DB2_OWNERSHIP_MATRIX.md` (CON-040 row); ADR-DB1-011 (asset
  two-phase deletion); `DB3_LIFECYCLE_SPECIFICATIONS.md` LC-06
