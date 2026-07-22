# Implementation Decision Register

## 1. Locked decisions

| ID | Decision | Status |
|---|---|---|
| IMP-D001 | Use a hybrid model: phase-level waterfall design plus checkpoint-based engineering. | LOCKED |
| IMP-D002 | A phase does not automatically contain design work; classify it as `NONE`, `REUSE`, `SUPPLEMENT`, or `NEW`. | LOCKED |
| IMP-D003 | Required design is completed and reviewed as one coherent phase package, not coding-style checkpoints. | LOCKED |
| IMP-D004 | One backend checkpoint normally has 1–3 APIs and never more than 5 tightly related APIs. | LOCKED |
| IMP-D005 | One frontend checkpoint normally owns one screen or one bounded capability of a complex screen. | LOCKED |
| IMP-D006 | One checkpoint is one human review boundary; an agent stops after it and does not continue automatically. | LOCKED |
| IMP-D007 | Admin operational capability leads Storefront by at most one capability inside the same business phase. | LOCKED |
| IMP-D008 | NestJS Swagger/OpenAPI is mandatory for backend APIs. | LOCKED |
| IMP-D009 | Generate TypeScript types and Axios client from OpenAPI; write TanStack Query hooks manually. | LOCKED |
| IMP-D010 | Frontend styling uses global SCSS only, with one `main.scss` import per Next.js app and shared Sass modules. | LOCKED |
| IMP-D011 | CSS Modules, inline style, CSS-in-JS, Tailwind and shadcn/ui styling baseline are prohibited. | LOCKED |
| IMP-D012 | Use approved Design System tokens; never derive production colors from grayscale wireframes. | LOCKED |
| IMP-D013 | Application-era schema changes require a dedicated approved database-change checkpoint. | LOCKED |
| IMP-D014 | Phase plans are not execution prompts; create one concise checkpoint specification at a time. | LOCKED |
| IMP-D015 | Production readiness may be claimed only after APP12 passes and explicit production approval is given. | LOCKED |
| IMP-D016 | Jest is the selected unit/integration test runner and already exists across `apps/*` and `packages/*`. Do not introduce a second unit/integration runner without an ADR. | LOCKED |
| IMP-D017 | The shared Sass token/foundation package lives at `packages/styles` (workspace name `@embroidery/styles`); apps consume tokens from it and do not define their own token source. Set by APP0-S01A. | LOCKED |
| IMP-D018 | Runtime-bearing workspace packages consumed by the Node backend (`@embroidery/database`, `@embroidery/persistence`) are compiled to JavaScript (`tsc` → `dist`, with declarations); their `main`/`types`/`exports` point to `dist`. The API and worker must never resolve a workspace package to `src/*.ts` at runtime, and bundlers/TS runtime loaders (webpack, esbuild, tsx, ts-node) are not used as a substitute for compilation. | LOCKED |
| IMP-D019 | The generated OpenAPI artifact is committed at `packages/contracts/openapi/openapi.generated.json` and produced by `pnpm openapi:generate`; `pnpm check:openapi` is a non-mutating drift gate in the root `quality` chain. Operation IDs follow `<domainKey>_<methodKey>` derived from the controller class and handler method, validated for presence, format and uniqueness. Documented paths carry the real `/api` global prefix and the document declares no server URL. Runtime Swagger UI is served at `/api/docs`, gated by `API_DOCS_ENABLED`, defaulting to enabled outside production and **disabled in production**. Set by APP0-B01. | LOCKED |

## 2. Decisions owned by future phases

These remain unresolved until the owning phase audits current repository ADRs and evidence. They must not be invented inside implementation.

| ID | Decision | Owner | Blocking point |
|---|---|---|---|
| IMP-O001 | Concrete staff/customer authentication/session provider or mechanism | APP1 | Before production auth backend |
| IMP-O002 | Concrete object-storage product/adapter configuration, if not already locked | APP2 | Before asset integration |
| IMP-O003 | Concrete queue/broker and job runtime, if not already locked. Owner = earliest consuming phase: APP0 first verifies whether APP2 asset-derivative/media processing needs a real job queue; if yes → APP2, otherwise the earliest later phase that introduces real asynchronous work, and only APP4 if APP2/APP3 do not require it. APP0 does not implement a real queue unless a verified APP0 requirement appears. | Earliest consuming phase (verified in APP0; not blindly APP4) | Before production worker delivery of the owning phase |
| IMP-O004 | Canvas/SVG library and rendering architecture — APP0-owned via the `APP0-R01` feasibility spike; decision recorded by ADR | APP0 (spike APP0-R01) | Before APP3 engineering |
| IMP-O005 | Two separate open tool decisions kept under one parent ID: (a) frontend component test tool (`APP0-DEC-COMPONENT-TEST`); (b) browser E2E test tool (`APP0-DEC-E2E`). Each requires its own ADR. Jest is already selected for unit/integration (see IMP-D016) and is not reopened. | APP0 | Before test harness closure |
| IMP-O011 | Generated-client codegen tool (OpenAPI → TypeScript/Axios). Must define the boundary between generated output and the existing handwritten Axios instance + error-normalization layer in `packages/api-client`, preserving the latter where compatible. Consequential → ADR (`APP0-DEC-CODEGEN`). | APP0 | Before APP0-C02 generated-client checkpoint |
| IMP-O006 | Contact/notification providers and delivery channels | APP4 | Before production notification delivery |
| IMP-O007 | Payment provider, checkout, webhook signature and sandbox | APP7 | Before payment implementation |
| IMP-O008 | Cancellation/refund policy parameters | APP9 | Before cancellation/refund checkpoints |
| IMP-O009 | Exact design classification and Figma references for every phase | Each phase | Before frontend engineering |
| IMP-O010 | Whether Storybook is worth its maintenance cost | APP0 | Optional; not a stage blocker by default |

## 3. Decision procedure

For an open consequential decision:

1. Audit existing repository ADRs and implementation.
2. Compare options against locked product/architecture constraints.
3. Run a bounded spike only when evidence is required.
4. Create or update an ADR.
5. Record the decision here or link the authoritative ADR.
6. Only then unblock dependent checkpoints.

Do not use a checkpoint implementation as an implicit ADR.
