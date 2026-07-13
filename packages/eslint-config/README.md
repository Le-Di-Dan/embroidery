# @embroidery/eslint-config

Shared flat ESLint configurations (D-031).

## Variants

- `@embroidery/eslint-config/base` — strict TypeScript rules for every workspace:
  no `any`, no floating promises, no unused vars, no deep imports into other
  workspace packages, Prettier conflict rules disabled.
- `@embroidery/eslint-config/next` — base + Next.js recommended and
  Core Web Vitals rules.
- `@embroidery/eslint-config/nest` — base + Node globals for NestJS apps.

## Boundary

Lint configuration only. Feature-specific lint exceptions belong in the
consuming workspace's `eslint.config.js`, not here.
