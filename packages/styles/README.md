# @embroidery/styles

Shared Sass **design-token foundation** for the storefront and admin apps.

This package owns approved design tokens and a small set of shared Sass tools.
It is the single source of truth for token values in SCSS. It **emits no CSS**:
`@use`-ing it has no side effects. Global CSS (resets, base elements,
components, utilities) and per-app `main.scss` integration are owned by later
checkpoints (APP0-S01B onward), not here.

## Usage

```scss
@use "@embroidery/styles" as styles;

.c-button {
  color: styles.$color-text-primary;
  background: styles.$color-action-primary;
  padding: styles.spacing(16);
  border-radius: styles.$radius-button;

  @include styles.motion-safe {
    transition: background styles.$motion-duration-fast styles.$motion-easing-standard;
  }
}
```

- Only `@use` / `@forward` are permitted; `@import` is prohibited.
- Read spacing through `spacing($step)` so off-scale values are rejected at
  compile time.

## Module layout

```text
src/
├── index.scss          # public entry (@forward settings + tools)
├── settings/           # approved tokens (values only, no CSS)
│   ├── _color.scss
│   ├── _typography.scss
│   ├── _spacing.scss
│   ├── _radius.scss
│   ├── _motion.scss
│   ├── _layout.scss
│   └── _index.scss
└── tools/              # shared functions/mixins (may use settings)
    ├── _functions.scss
    ├── _mixins.scss
    └── _index.scss
```

`settings` never depends on `tools`. This maps onto the "abstracts" layer of the
recommended structure in `docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md`;
the `foundations`/`components`/`utilities` layers are out of scope for this
checkpoint.

## Token traceability

Canonical sources: `docs/design/DESIGN_SYSTEM_FOUNDATION.md` (Approved
Foundation) and the approved Figma foundation variables
(file `BQwqV8GdfUIELvsQDB1UQE`, node `101-13`). No token is derived from
grayscale wireframes.

| Token family | Design source | Implementation | Status |
| --- | --- | --- | --- |
| Color | Foundation §4 + Figma `Color/*` | `settings/_color.scss` | Implemented |
| Typography (family, size, weight) | Foundation §5 + Figma `Typography/*` | `settings/_typography.scss` | Implemented |
| Spacing | Foundation §6 | `settings/_spacing.scss` | Implemented |
| Radius | Foundation §7 + Figma `Radius/*` | `settings/_radius.scss` | Implemented |
| Motion (duration, easing) | Foundation §9 | `settings/_motion.scss` | Implemented |
| Layout / control size | Foundation §6, §10, §11, §15 | `settings/_layout.scss` | Implemented |
| Elevation / shadow | Foundation §8 (philosophy + level names only) | — | Deferred (no canonical value) |
| Breakpoints | Foundation §10, §16 (columns/widths only) | — | Deferred (no canonical value) |
| Z-index | — | — | Deferred (no canonical value) |
| Opacity | — | — | Deferred (no canonical value) |
| Line-height / letter-spacing | — | — | Deferred (not locked) |

Deferred families have no locked numeric values in either approved source. They
are intentionally **not** invented here; they will be added when the design
sources lock concrete values.

## Validation

```bash
pnpm --filter @embroidery/styles validate
```

Compiles the public entry with the Sass JS API (cross-platform), asserting the
entry emits no CSS, that no `@import` exists, and that tokens resolve to their
approved values.
