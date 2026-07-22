# APP0 — Application Delivery Foundation

## 1. Outcome

Create the engineering control plane required for all later phases: application module ownership, Swagger/OpenAPI, generated Axios client, global SCSS foundation, testing harness, request/audit context, and bounded technical spikes.

## 2. Dependencies

Completed database/persistence baseline, existing system architecture, repository structure, backend/frontend conventions, and approved design-system sources.

## 3. Design policy

Classification: `NONE` for product screen design. Verify the approved design tokens and Figma architecture only to create the SCSS foundation. The 2D editor spike is a technical feasibility artifact, not a production screen design package.

Design, when required, is delivered as one complete phase package and is not split into coding checkpoints.

## 4. In scope

- Application module ownership and dependency map.
- Swagger/OpenAPI bootstrap and generation command.
- API envelope and error mapping foundation.
- Generated TypeScript/Axios client package.
- Per-app `main.scss` entries and shared global SCSS package.
- Test database and API/frontend/E2E harness foundations.
- Request ID, actor context, structured logging and audit context foundation.
- Technical spike for selected 2D canvas/SVG approach.
- CI-quality commands and implementation documentation integration.

## 5. Out of scope

- Product feature APIs.
- Staff/customer production authentication flows.
- Full Design Studio implementation.
- New database schema unless an approved blocker change is created.
- New visual screen design.

## 6. Candidate engineering checkpoints

These are planning slices. Execute and review one at a time. Any backend slice remains subject to the maximum of five tightly related HTTP endpoints.

- **APP0-C01 — Application module map:** Map bounded contexts, public application services, repository ownership, allowed dependencies, and circular-dependency prohibitions.
- **APP0-B01 — Swagger/OpenAPI foundation:** Configure NestJS Swagger, stable operation IDs, schema generation, and validation without feature endpoints.
- **APP0-B02 — Response/error foundation:** Implement standard envelope, safe exception mapping, validation behavior, and correlation metadata.
- **APP0-C02 — Generated client contract:** Create reproducible OpenAPI export and generated TypeScript/Axios client package; no handwritten DTO duplication.
- **APP0-S01 — Global SCSS foundation:** Create shared Sass modules plus one `main.scss` entry per Next.js app; add static checks for prohibited styling patterns.
- **APP0-T01 — Backend test harness:** Provide disposable PostgreSQL/API integration harness and fixture conventions.
- **APP0-T02 — Frontend/E2E harness:** Provide component, network boundary, accessibility, and browser E2E foundations using approved tools/ADR.
- **APP0-B03 — Request and actor context:** Establish request ID propagation, structured logs, current actor abstraction, and audit metadata plumbing.
- **APP0-R01 — 2D editor technical spike:** Evaluate the approved/selected canvas or SVG approach for text/image layers, transforms, mobile pointer behavior, serialization, watermark, and performance.
- **APP0-X01 — Foundation closure:** Run all foundation gates, record selected tools/ADRs, verify no feature scope leaked, and hand off APP1.

## 7. Critical end-to-end journey

A minimal diagnostic route is represented in generated OpenAPI, consumed through the generated Axios client in both app test harnesses, and correlated through gateway/API logging. The SCSS entries compile with no CSS Modules or inline styling.

## 8. Exit gate

- All commands are reproducible from a clean checkout.
- Swagger generation and client generation pass.
- SCSS architecture compiles for both apps.
- Testing harnesses run.
- Editor spike ends in a documented selection or a precise blocker.
- No product feature is falsely claimed complete.

## 9. Handoff

APP1 receives stable auth/actor abstractions, API/error conventions, client generation, SCSS structure, and test harnesses.
