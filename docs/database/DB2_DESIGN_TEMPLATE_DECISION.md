# DB2 Decision Record — Design Template Ownership & Structure (GAP-08)

**Date:** 2026-07-15 · **Git HEAD:** `f90f78c` · **Status:** Accepted with Deferred Parameters
**Gap:** GAP-08 · **REQ:** REQ-TMPL-001 (was AMBIGUOUS), REQ-TMPL-002 · **INV:** INV-21 (no export), INV-09 (private assets)

## Questions and decisions

| Question | Decision |
|---|---|
| Catalog or Design ownership? | **Design context (CTX-DSN, AGG-12).** A template is a store-authored *design document*, validated/serialized by `packages/design-document` — the Design module owns that capability. Catalog only *references* suggested TemplateIds for product-page display ("gợi ý mẫu thiết kế"). |
| Product-specific, area-specific, or global? | **Optional scoping:** a template may be global or scoped to ProductId (optionally side/area constraints). Both supported conceptually; display filtering uses the scope. |
| Uses design-document schema? | **Yes** — the same versioned document payload (`document_schema_version`, ADR-DB1-012). No parallel template format. |
| Store-owned artwork placement? | Referenced as **Assets (AGG-08)** with production-sensitive/private-by-default classification (REQ-TMPL-002); templates hold AssetId references only. |
| Publication state? | **Yes** — draft → published → archived (final names DB3); only published templates appear to customers. |
| Customer clone into session? | **Yes — clone-on-use:** applying a template copies the document into the Design Session as an **independent working document**; the session records the origin (TemplateId + template version) for provenance only. **No live reference.** |
| Template update vs old sessions/versions? | Updates **never mutate** existing clones, sessions, or historical design versions (aligned with the no-retro-mutation rule family, INV-12 spirit). |
| Customer download/export? | **Prohibited** — same export policy as all design content (BR-011, `05 §11`). |
| Versioning? | **Yes, lightweight:** publishing a change bumps a template version; clones stamp the version they came from. Full immutable-version-rows machinery is *not* required (templates are store-authored inputs, not commercial records) — DB4 decides the minimal shape. |

## Rationale

Templates behave exactly like design documents (validation, serialization,
hashing capability, element model) — Catalog ownership would duplicate the
design-document dependency into a module that otherwise never touches it.
Clone-on-use is the only model consistent with immutable design history:
a live template reference inside customer designs would let a template edit
retroactively change submitted/approved designs, violating BR-009/INV-01
semantics downstream.

## Deferred

- Publication state names, template curation workflow → DB3/admin checkpoint.
- Template shape/scoping columns → DB4. Catalog display association shape →
  DB4.

## Handoff

DB3 (publication lifecycle), DB4 (shapes), DB7 (clone-independence test:
template update does not alter cloned session/version content).
