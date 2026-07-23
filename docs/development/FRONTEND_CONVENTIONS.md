# Frontend Conventions

**Status:** Approved technical baseline  
**Version:** 0.2.0

## 1. Scope

These rules apply to:

- `apps/storefront`.
- `apps/admin`.
- Frontend-facing workspace packages.

The stack is Next.js App Router with strict TypeScript, TanStack Query for server state, and Zustand for browser-only interaction state.

## 2. Server-first rule

Server Components are the default.

Add `"use client"` only when the file requires browser capabilities such as:

- State or effects.
- Event handlers.
- Canvas interaction.
- Browser APIs.
- Client-side TanStack Query hooks.
- Zustand hooks.

Do not mark an entire route tree as client-side because one child needs interaction. Push Client Components to the smallest practical boundary.

## 3. Rendering rules

### Public SEO pages

Use static or revalidated server rendering where possible.

SEO-critical data and copy must be available in server-rendered HTML. Do not hide essential product or gallery content only inside canvas or client-side effects.

### Private customer pages

Use dynamic server rendering and mark them non-indexable.

### Interactive tools

The Design Studio is client-interactive but must be embedded in a server-rendered route shell with appropriate metadata, loading, and error boundaries.

## 4. App Router files

`page.tsx`, `layout.tsx`, route handlers, and metadata files must remain thin.

They may:

- Parse route input.
- Perform server-side composition.
- Call feature-level server functions.
- Configure metadata.
- Render feature entry components.

They must not:

- Contain business rules.
- Contain large data mappers.
- Define reusable UI.
- Own TanStack Query or Zustand architecture.
- Access persistence directly.

## 5. Feature structure

Every feature uses responsibility-based subfolders as defined in `REPOSITORY_STRUCTURE.md`.

Do not create flat folders like:

```text
features/catalog/
├── product-card.tsx
├── use-products.ts
├── catalog-utils.ts
├── catalog-types.ts
└── catalog-constants.ts
```

Use:

```text
features/catalog/
├── components/
├── hooks/
├── services/
├── schemas/
├── constants/
├── utils/
├── mappers/
├── types/
└── tests/
```

## 6. Single component per file

Each production `.tsx` file contains exactly one React component.

Allowed colocated items:

- Component-specific types.
- A small constant used only by that component.
- Non-component helper functions that remain highly local and do not obscure the file.

If a JSX-producing function has its own responsibility, treat it as a component and move it to its own file.

## 7. Component design

Components should:

- Have one clear UI responsibility.
- Receive explicit props.
- Avoid hidden global dependencies.
- Keep rendering separate from data transformation.
- Prefer composition over large conditional components.
- Expose loading, empty, error, disabled, and success states where relevant.

Business decisions do not belong in components.

## 8. HTTP client and API envelope

Axios is the only approved HTTP client for internal application API calls.

Required rules:

- Do not use `fetch` in components, hooks, feature services, Server Components, route composition, or shared API utilities for internal business APIs.
- Do not instantiate Axios ad hoc inside a feature.
- Use centrally configured browser and server Axios clients.
- Feature API services wrap Axios calls.
- React components and pages do not call Axios directly.
- TanStack Query query and mutation functions call feature services.
- Configure base URL, timeout, authentication, request correlation, and safe error normalization centrally.
- Interceptors must remain small and infrastructure-focused; they must not contain feature business logic.
- Do not perform automatic retries for non-idempotent mutations unless the operation has an approved idempotency strategy.
- Do not leak raw Axios errors into UI components.

Internal JSON responses follow the standard API envelope:

```ts
interface ApiSuccessResponse<TData, TMeta = ApiResponseMeta> {
  success: true;
  code: string;
  message: string;
  data: TData;
  meta: TMeta;
}

interface ApiErrorResponse<TError = ApiFieldError> {
  success: false;
  code: string;
  message: string;
  errors?: TError[];
  meta: ApiResponseMeta;
}
```

Frontend handling rules:

- Validate or type the envelope at the API boundary.
- Unwrap `data` in the feature service or API-client layer, not repeatedly inside components.
- Preserve `code`, `requestId`, HTTP status, and structured errors for UI and observability.
- Do not use the human-readable `message` as a programmatic condition.
- Programmatic branching uses stable error codes and HTTP status.
- Pagination belongs under `meta.pagination`.
- Binary downloads and third-party protocols may bypass the JSON envelope according to backend conventions.

## 10. Server state with TanStack Query

TanStack Query owns remote state.

Rules:

- Query keys are centralized per feature.
- Query functions live in feature services or API modules.
- Mutations invalidate or update only relevant queries.
- Avoid broad invalidation without reason.
- Validate external response data at the boundary when required.
- Do not copy entire query results into Zustand.
- Do not use effects to manually reproduce query-cache behavior.
- Hydration and prefetching must preserve server-first rendering where useful.

## 10. Client state with Zustand

Zustand owns interaction state that is not authoritative server data.

Appropriate examples:

- Editor tool selection.
- Canvas viewport.
- Selected layers.
- Local history.
- Unsaved design state.
- Panel visibility.

Rules:

- Prefer multiple cohesive stores or slices over one global store.
- Store actions must remain small and deterministic.
- Complex geometry belongs in `design-engine` or feature services, not store actions.
- Persist only explicitly approved state.
- Avoid subscribing entire component trees to large store objects.
- Use selectors to minimize rendering.
- Server data identifiers may be referenced, but server entities are not duplicated as a second source of truth.

## 11. Forms and validation

- Client validation improves UX but never replaces API validation.
- Validation schemas belong to the narrowest responsible feature.
- Display field-level and form-level errors.
- Preserve user input after recoverable errors.
- Do not hard-code validation messages throughout components.
- Prevent accidental double submission.
- Handle pending, retry, and server-conflict states.

The concrete form library remains subject to technical selection unless already decided by an ADR.

## 12. Design Studio conventions

- Keep the design-document model framework-independent.
- Canvas rendering code must not become the source of truth for the scene.
- Geometry and transformations live outside React components.
- Commands should be deterministic and testable.
- Autosave is debounced or scheduled using named configuration values.
- Undo/redo must operate on explicit commands or snapshots according to the approved design.
- Product coordinate conversion must be centralized.
- Watermark rendering must be consistent between customer-visible preview paths.
- Browser preview never grants access to private production assets.
- Touch behavior is designed explicitly; it is not assumed to match desktop pointer behavior.

## 13. Styling

The UI styling system is **locked to global SCSS**. Canonical rules live in
[`docs/implementation/05-FRONTEND-AND-SCSS-STANDARD.md`](../implementation/05-FRONTEND-AND-SCSS-STANDARD.md);
this section is a summary and must not diverge from it.

Core rules:

- SCSS is the only project-owned styling system.
- Each Next.js app imports exactly one `main.scss` entry; internal composition uses `@use`/`@forward` partials/modules.
- Shared foundations and reusable primitives live in the shared styles package; app-specific composite styles stay app-owned.
- No inline `style` prop or inline `<style>`.
- No React CSS Modules (`*.module.css`, `*.module.scss`).
- No CSS-in-JS (styled-components, Emotion, or equivalent).
- No Tailwind utility styling and no shadcn/ui styling baseline.
- Headless behavior primitives may be used only when all visuals are implemented in project SCSS.

General discipline (applies within the SCSS system):

- Avoid one-off magic values; use design tokens for spacing, typography, radius, breakpoints, and z-index.
- Do not duplicate brand values.
- Keep feature-specific styles with the feature; avoid globally scoped selectors unless intentional.
- Responsive behavior must be mobile-first.
- Interactive elements require visible focus and adequate touch targets.

## 14. Text and constants

Do not scatter user-facing copy through components.

Use feature-local message catalogs or a future localization system.

Extract:

- Business labels.
- Status labels.
- Routes.
- Query keys.
- Limits.
- Timeouts.
- Repeated UI copy.
- Analytics event names.

Do not create meaningless constants for obvious local values such as an empty string or an array index where no business meaning exists.

## 15. Accessibility

Mandatory expectations:

- Semantic HTML.
- Keyboard access.
- Visible focus.
- Form labels.
- Error announcements.
- Sufficient contrast.
- Non-color status indicators.
- Alternative text.
- Correct dialog and menu behavior.
- Accessible fallback controls for important canvas operations where feasible.

Accessibility defects are product defects.

## 16. Error handling

Every data-driven feature must define:

- Loading state.
- Empty state.
- Recoverable error state.
- Unrecoverable error boundary.
- Retry behavior where safe.
- Permission-denied state.
- Stale or conflicting data state where relevant.

Do not swallow errors or log them only to the browser console.

## 17. Performance

- Avoid unnecessary Client Components.
- Avoid large barrel imports.
- Lazy-load heavy editor functionality.
- Optimize product and gallery images.
- Keep public-page JavaScript minimal.
- Use selectors for Zustand.
- Avoid unstable object props in hot render paths.
- Measure before introducing memoization.
- Respect future performance budgets.

## 18. Testing expectations

Frontend testing must cover:

- Pure logic.
- Components and interaction.
- Server/client boundaries where relevant.
- TanStack Query behavior.
- Zustand store behavior.
- Form validation.
- Accessibility.
- Critical end-to-end journeys.
- Design geometry and coordinate conversion.
- Mobile interaction for critical editor tasks.

A snapshot alone is not sufficient evidence for meaningful behavior.

The component-test stack is locked by `APP0-DEC-COMPONENT-TEST` (IMP-D024) and founded by APP0-T02A: **Jest** with **`next/jest`**, **`jsdom`**, **React Testing Library**, **`@testing-library/user-event`** and **`@testing-library/jest-dom`**. Frontend tests live under `apps/<app>/test/**` (never production `src/**`): `test/components/**` (jsdom), `test/smoke/**` (Node), `test/fixtures/**`, `test/support/**`. Shared render helpers, the `QueryClient` factory and `next/navigation` mocks come from `@embroidery/frontend-testing`; async Server Components are covered by E2E rather than `jsdom`; there is no live network (mock the injected Axios instance or the generated operation). Canonical gate rules live in [`docs/implementation/07-TESTING-AND-ACCEPTANCE-GATES.md`](../implementation/07-TESTING-AND-ACCEPTANCE-GATES.md) §3.1.

## 19. Prohibited patterns

- Multiple production React components in one file.
- Business logic in `page.tsx`.
- Direct API calls scattered inside components.
- Remote-state duplication in Zustand.
- Catch-all `utils` or `helpers` files.
- Deep imports into another feature.
- Inline secrets or provider credentials.
- Large components kept below 400 lines only through compressed formatting.
- `any` used to bypass type design.
- Unvalidated unsafe HTML or SVG.
