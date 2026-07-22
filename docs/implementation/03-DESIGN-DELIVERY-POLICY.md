# Design Delivery Policy

## 1. Delivery model

Design is managed differently from code. It is produced and reviewed as a coherent phase-level package because isolated screen fragments do not provide enough context to judge navigation, hierarchy, consistency, responsive behavior, and user journey quality.

Design work is therefore waterfall-style inside a phase and is not split into implementation checkpoints.

## 2. Phase design audit

Before frontend coding, audit:

- Existing Figma pages, sections, components, variables, and statuses.
- Approved versus draft artifacts.
- Existing wireframes and high-fidelity screens.
- Desktop, tablet, and mobile coverage.
- Loading, empty, error, permission, conflict, and success states.
- Interaction and navigation continuity.
- Admin versus Storefront coverage.
- Design-system component coverage.
- Accessibility annotations.
- Any divergence between Figma and product/lifecycle truth.

The result must classify the phase as `NONE`, `REUSE`, `SUPPLEMENT`, or `NEW`.

## 3. Whole phase design package

When classification is `SUPPLEMENT` or `NEW`, the package must cover the complete phase journey, including all required screens and states. It is reviewed once as a coherent package, then corrected until it passes.

A package should contain:

- Scope and source-of-truth statement.
- Actors and entry points.
- Journey map.
- Screen inventory.
- Desktop/mobile scope.
- State inventory.
- Navigation and interaction notes.
- Component mapping.
- Design token mapping.
- Content requirements.
- Accessibility notes.
- Deferred design items.
- Integrity audit proving existing approved artifacts were not damaged.

## 4. Design source hierarchy

For visual implementation:

```text
Design Vision
→ Design System Foundation
→ Figma Architecture
→ Approved design tokens and components
→ Approved high-fidelity screens
→ Approved wireframes for structure/behavior only
→ Phase-specific composition
```

Production colors must never be derived from grayscale wireframes. A wireframe informs structure and behavior, not final visual tokens.

## 5. No design work in every phase

Backend-only, infrastructure, concurrency, worker, and operational phases may have `NONE` design scope.

A phase with already approved complete design uses `REUSE` and does not reopen design merely because engineering begins.

## 6. Design pass criteria

A phase design package is `PASS` only when:

- Required screens are present.
- The complete journey is understandable.
- Cross-screen navigation is coherent.
- Components use the approved design system.
- Token usage is correct.
- Responsive scope is complete.
- Required states are represented.
- Admin destructive/permission-sensitive actions are explicit.
- Storefront customer recovery paths are explicit.
- Accessibility requirements are documented.
- No product or lifecycle rule is invented by design.
- Deferred items are bounded and do not block implementation.

## 7. Design-to-code handoff

The handoff must provide:

- Exact Figma file/page/section/node references.
- Approved status.
- Screen-to-route mapping.
- Component-to-code ownership mapping.
- Token names.
- Responsive behavior.
- Interaction notes.
- Copy source.
- Assets and licensing/status.
- Known gaps.

Frontend checkpoints implement the approved package incrementally. They do not redesign individual screens in code.

## 8. Design change after coding begins

A material design change requires:

1. Impact statement.
2. Updated whole-phase design package or approved addendum.
3. Identification of affected accepted checkpoints.
4. New frontend correction checkpoints.

Do not silently change Figma and treat existing implementation as wrong without a recorded change.
