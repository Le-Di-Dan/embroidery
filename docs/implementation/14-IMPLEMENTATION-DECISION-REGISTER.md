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

## 2. Decisions owned by future phases

These remain unresolved until the owning phase audits current repository ADRs and evidence. They must not be invented inside implementation.

| ID | Decision | Owner | Blocking point |
|---|---|---|---|
| IMP-O001 | Concrete staff/customer authentication/session provider or mechanism | APP1 | Before production auth backend |
| IMP-O002 | Concrete object-storage product/adapter configuration, if not already locked | APP2 | Before asset integration |
| IMP-O003 | Concrete queue/broker and job runtime, if not already locked | APP0/APP4 | Before production worker delivery |
| IMP-O004 | Canvas/SVG library and rendering architecture | APP0 | Before APP3 engineering |
| IMP-O005 | Frontend component test tool and browser E2E tool (only these remain open; Jest is already selected for unit/integration — see IMP-D016) | APP0 | Before test harness closure |
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
