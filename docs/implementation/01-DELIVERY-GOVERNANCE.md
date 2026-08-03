# Delivery Governance

## 1. Core rule

One checkpoint equals one implementation task, one review boundary, and one bounded completion claim.

Do not send an agent an entire phase or module for autonomous implementation. Phase documents are planning sources; they must be converted into one checkpoint specification at a time.

## 2. Reviewable checkpoint limits

### 2.1 Backend

- Preferred: one to three endpoints.
- Hard maximum: five endpoints.
- Endpoints must share the same aggregate/use-case boundary and transaction semantics.
- A CRUD set is not automatically one checkpoint.
- State transitions, security-sensitive actions, provider callbacks, and concurrency-sensitive operations should normally be isolated from ordinary CRUD.

### 2.2 Frontend

- Preferred: one route-level screen.
- Allowed: one screen plus a directly dependent modal/drawer.
- Complex screens such as Design Studio are split by capability, not by arbitrary visual fragments.
- A screen checkpoint includes its relevant loading, empty, error, disabled, conflict, and success behavior.
- A screen is not complete while using production-path mock data.

### 2.3 Worker and integration

- One job type, provider operation, or delivery consequence per checkpoint.
- Retry, idempotency, attempt recording, terminal failure, and observability belong to the same job checkpoint.
- Do not mix unrelated provider adapters.

### 2.4 Suggested diff budget

Diff size is a warning signal, not the only measure:

- Target handwritten production change: approximately 150–500 lines.
- Review warning: more than 600 handwritten production lines or more than 12 handwritten files.
- Mandatory re-slicing by default: more than 900 handwritten production lines or more than 18 handwritten files.
- Generated OpenAPI/client output is counted separately but its contract diff must still be reviewed.
- Test code may exceed production code, but test files remain under repository file-size limits.

A larger checkpoint requires an explicit reason in the checkpoint specification before implementation.

## 3. Task specification size

Checkpoint specifications must reference shared documents instead of repeating them.

- Do not copy thousands of lines of project rules into every task.
- Include only task-specific scope, constraints, acceptance criteria, files, and commands.
- Typical checkpoint specifications should be concise enough for a human to review before execution.
- A long phase plan is never used directly as an execution prompt.

## 4. Required checkpoint lifecycle

```text
PLANNED
→ READY
→ IN_PROGRESS
→ REVIEW_REQUIRED
→ ACCEPTED
```

Alternative terminal states:

- `BLOCKED`: a true external or governance decision is required.
- `REJECTED`: implementation does not satisfy the checkpoint.
- `SUPERSEDED`: replaced before implementation by an approved re-plan.

The next checkpoint may start only after the current checkpoint is `ACCEPTED`, unless the user explicitly authorizes parallel independent work.

## 5. Definition of Ready

A checkpoint is `READY` only when it has:

- Phase and module ownership.
- Exact capability.
- In-scope and out-of-scope behavior.
- Endpoint list or screen/capability list.
- Source documents.
- Design reference where applicable.
- Authorization and actor.
- Data/lifecycle/transaction implications.
- Expected files or allowed directories.
- Acceptance criteria.
- Required tests and validation commands.
- Explicit stop boundary.

## 6. Definition of Done

A checkpoint is complete only when:

- Required behavior exists in real code.
- Tests for the checkpoint pass.
- Authorization, validation, errors, audit, and observability are handled where applicable.
- Swagger/OpenAPI is current for API changes.
- Generated client is refreshed for contract changes.
- UI uses the real contract before closure.
- No unrelated work is included.
- The scoped validations the change justifies pass — selected per
  [`VALIDATION_GOVERNANCE.md`](./VALIDATION_GOVERNANCE.md) and invoked per
  [`SCOPED_COMMAND_INDEX.md`](./SCOPED_COMMAND_INDEX.md), including
  `node tools/check-file-size.mjs` for touched production/test files. There is
  no repository-wide aggregate and no root alias for a scoped command.
- Changed files and evidence are reported.
- The working tree contains no next-checkpoint work.
- Human review accepts the result.

## 7. Commit governance

Recommended repository history:

- One accepted checkpoint has one primary implementation commit.
- Review corrections use additive commits; do not rewrite accepted history.
- Do not amend, squash, reset, stash, discard, or push unless explicitly directed.
- A phase completion report may use a separate documentation commit.
- The working tree must be clean before beginning the next checkpoint.

## 8. Prohibited execution patterns

- Whole-phase implementation in one task.
- “Build all backend APIs” or “build the entire Admin” tasks.
- More than five feature endpoints in one checkpoint.
- Implementing frontend screens before their design package is approved, when the phase requires design.
- Building UI from wireframe grayscale as production visual tokens.
- Mixing database changes into an ordinary API checkpoint.
- Mock-only completion claims.
- Broad cleanup/refactor mixed into feature work.
- Automatically continuing to the next checkpoint after producing a report.

## 9. Review focus by checkpoint type

| Type | Primary human review focus |
|---|---|
| Contract | Semantics, naming, authorization, errors, pagination, idempotency. |
| Backend | Invariants, transaction boundary, repository ownership, error mapping, tests. |
| Admin UI | Operational usability, permission behavior, destructive actions, audit visibility. |
| Storefront UI | Customer journey, responsive behavior, SEO, accessibility, recovery. |
| Worker | Idempotency, retry, failure state, duplicate delivery, monitoring. |
| Integration | Cross-module truth, provider boundary, end-to-end state transitions. |
| Closure | Scope completeness, evidence, deferred work, no overclaim. |
