# Frontend and SCSS Standard

## 1. Scope

Applies to:

- `apps/storefront`.
- `apps/admin`.
- Frontend-facing workspace packages.

Existing Next.js App Router, strict TypeScript, server-first rendering, TanStack Query, Zustand, Axios, and one-component-per-file rules remain in force.

## 2. Styling decision

The styling system is now locked to global SCSS.

Mandatory rules:

- SCSS is the only project-owned visual styling system.
- No `*.module.css` or `*.module.scss`.
- No React `style` prop.
- No inline `<style>` tags.
- No Tailwind utility styling.
- No styled-components, Emotion, or equivalent CSS-in-JS.
- No shadcn/ui baseline because its default styling model conflicts with the locked SCSS system.
- Third-party headless behavior primitives may be approved, but project visuals must be implemented in SCSS.

## 3. Entry-point rule

Each Next.js application has exactly one imported SCSS entry:

```text
apps/storefront/src/styles/main.scss
apps/admin/src/styles/main.scss
```

Each root layout imports only its application `main.scss`.

Components, pages, hooks, and features must not import SCSS files directly. Internal Sass composition uses `@use` and `@forward` from the application entry.

## 4. Shared architecture

Recommended structure:

```text
packages/styles/src/
├── abstracts/
│   ├── _tokens.scss
│   ├── _functions.scss
│   ├── _mixins.scss
│   ├── _breakpoints.scss
│   ├── _z-index.scss
│   └── _index.scss
├── foundations/
│   ├── _reset.scss
│   ├── _base.scss
│   ├── _typography.scss
│   ├── _accessibility.scss
│   └── _index.scss
├── components/
│   ├── _button.scss
│   ├── _form-field.scss
│   ├── _dialog.scss
│   └── _index.scss
├── layouts/
├── utilities/
└── index.scss

apps/storefront/src/styles/
├── main.scss
├── components/
├── features/
├── layouts/
├── pages/
└── _index.scss

apps/admin/src/styles/
├── main.scss
├── components/
├── features/
├── layouts/
├── pages/
└── _index.scss
```

Shared styles contain only truly shared foundations and primitives. Storefront and Admin composite styles remain application-owned.

## 5. Selector naming

Use BEM-style naming with ownership prefixes:

- `c-`: shared component.
- `l-`: shared layout.
- `u-`: utility.
- `sf-`: Storefront-specific component/feature.
- `adm-`: Admin-specific component/feature.
- `p-`: route/page scope where needed.
- `is-` / `has-`: state class.
- `js-`: JavaScript hook only when unavoidable; never style it.

Examples:

```scss
.c-button {}
.c-button__icon {}
.c-button--primary {}
.adm-product-table {}
.sf-product-card {}
.is-loading {}
```

Avoid element selectors and deep nesting that accidentally styles unrelated UI.

## 6. Design tokens

Tokens are sourced from approved design-system documents/Figma variables, not wireframe grayscale.

Token categories include:

- Color roles.
- Typography.
- Spacing.
- Radius.
- Shadow.
- Breakpoints.
- Motion.
- Z-index.
- Control sizes.

Do not hard-code repeated brand values or one-off magic numbers in feature SCSS. A truly local value may remain local when it does not represent a reusable token.

## 7. Responsive and accessibility rules

- Mobile-first SCSS.
- Named breakpoints through shared mixins.
- Visible focus states.
- Adequate touch targets.
- Non-color-only status indicators.
- Reduced-motion handling where motion exists.
- Semantic HTML remains the primary accessibility mechanism; styling must not destroy it.

## 8. Dynamic visual behavior without inline styles

Project code must not use React inline styles or CSS custom properties assigned through `style`.

Use:

- State classes.
- Data attributes with predefined selectors.
- Native semantic attributes.
- Canvas/SVG rendering APIs for Design Studio geometry rather than DOM CSS positioning.
- Bounded class variants defined in SCSS.

A capability that appears impossible without inline styling must stop for architectural review; it must not bypass this rule silently.

## 9. Frontend checkpoint size

A standard checkpoint includes:

- One route-level screen or one bounded complex-screen capability.
- Real API integration.
- Relevant loading, empty, error, forbidden, stale/conflict, pending, and success states.
- Responsive behavior required by the design package.
- Accessibility behavior.
- Tests appropriate to the capability.

Large screens split by behavior. Example Design Studio slices:

- Studio route shell and data bootstrapping.
- Canvas renderer.
- Text layer controls.
- Image layer controls.
- Transform tools.
- Watermark and preview.
- Autosave and recovery.

## 10. API and state use

- Generated Axios client is the transport source.
- TanStack Query hooks are written feature-locally for explicit cache behavior.
- Do not duplicate remote entities in Zustand.
- Zustand owns only browser interaction state.
- Public SEO data is fetched/rendered server-first where practical.
- Direct scattered Axios calls inside components are prohibited.

## 11. Completion evidence

Frontend checkpoint evidence includes:

- Type check and lint.
- Component/interaction tests.
- API integration behavior.
- Accessibility checks for critical interactions.
- Responsive screenshots or equivalent review evidence.
- Design reference mapping.
- Confirmation that no CSS Module, inline style, Tailwind, or CSS-in-JS was introduced.
