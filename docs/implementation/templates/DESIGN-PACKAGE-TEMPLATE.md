# APPn Design Package

**Classification:** `SUPPLEMENT | NEW`  
**Status:** `DRAFT | REVIEW | PASS | FAIL`

## 1. Scope and source hierarchy

## 2. Actors and complete journey

## 3. Existing approved artifacts reused

Cite exact `FIGMA_DESIGN_INDEX.md` registry IDs and direct node links. A surface
with no `APPROVED_FOR_IMPLEMENTATION` registry entry is not proven `REUSE` — mark it
`MISSING`/`UNVERIFIED` and report the blocked downstream checkpoint.

## 4. Screen inventory

Every row must map to a `FIGMA_DESIGN_INDEX.md` registry ID; new frames are added to
the registry in this checkpoint as `REVIEW_REQUIRED` before this package is `PASS`.

| Screen | Surface | Desktop | Mobile | States | Registry ID(s) | Figma node link |
|---|---|---|---|---|---|---|

## 5. Navigation and interaction model

## 6. Component mapping

## 7. Token mapping

## 8. Content and asset requirements

## 9. Accessibility notes

## 10. Responsive notes

## 11. Deferred design items

## 12. Integrity audit

## 13. Review verdict

Design is reviewed as one complete package; do not split this document into implementation checkpoints.

`FIGMA_INDEX_CONSISTENCY = PASS` (`pnpm check:figma-design-index`) is required before this package can be `PASS`; every created/moved/superseded frame is reflected in `FIGMA_DESIGN_INDEX.md` with exact node links and explicit status.
