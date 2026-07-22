# Phase and Checkpoint Model

## 1. Canonical hierarchy

```text
Implementation stage
└── Application phase (APPn)
    ├── Phase scope and dependency lock
    ├── Design audit
    ├── Design package — optional, waterfall, no checkpoints
    ├── Contract checkpoints
    ├── Backend checkpoints
    ├── Admin frontend checkpoints
    ├── Storefront frontend checkpoints
    ├── Worker/integration checkpoints
    ├── End-to-end checkpoint
    └── Phase closure
```

A design package is part of phase planning but is not represented as a coding checkpoint series.

## 2. Phase entry gate

Before a phase begins:

- Previous required dependencies are complete.
- Relevant product and lifecycle rules are identified.
- Database ownership and repositories are known.
- Existing design coverage is audited.
- Open decisions that block implementation are resolved or isolated.
- Phase scope is frozen.
- Candidate checkpoints are listed and sized.
- Release impact is known.

## 3. Design classification

Each phase records one classification:

- `NONE`: no user-facing design work.
- `REUSE`: approved design already covers the phase.
- `SUPPLEMENT`: approved design exists but gaps must be completed in one phase package.
- `NEW`: the phase requires a new complete design package.

Classification is performed from repository/Figma evidence, not assumed from chat memory.

## 4. Checkpoint taxonomy

### C — Contract

Locks a small API slice before or with backend implementation.

### B — Backend

Implements command/query, repository behavior, controller, validation, authorization, and tests for a bounded capability.

### A — Admin frontend

Implements one Admin screen or capability against the real contract.

### S — Storefront frontend

Implements one Storefront screen or capability against the real contract.

### W — Worker/integration

Implements asynchronous or external consequences.

### E — End-to-end

Validates a critical cross-surface journey.

### X — Closure

Audits evidence and closes only the phase.

Checkpoint IDs use:

```text
APP2-C01
APP2-B01
APP2-A01
APP2-S01
APP2-W01
APP2-E01
APP2-X01
```

Numbers need not align across types.

## 5. Default sequencing rules

- Contract precedes the frontend that consumes it.
- Backend precedes or is paired with its contract checkpoint.
- Admin authoring/operations normally precede Storefront consumption by one capability.
- Storefront follows immediately after the required operational capability exists.
- Worker checkpoints follow the transaction/outbox behavior they consume.
- End-to-end validation does not replace lower-level tests.
- Closure never contains new feature implementation.

## 6. Phase exit gate

A phase closes only when:

- Design classification is resolved and any required package passed.
- Every planned checkpoint is accepted or explicitly deferred with no broken journey.
- Contract, backend, UI, worker, and integration artifacts agree.
- Critical end-to-end journey passes.
- No production path relies on mock data.
- Security and authorization tests pass.
- Phase completion report records evidence and bounded deferred work.
- The next phase handoff is explicit.

## 7. Re-planning rule

A phase plan may change after discovery, but changes must be explicit:

- Add or remove checkpoints in the phase plan.
- State why the original scope was wrong.
- Preserve accepted checkpoint history.
- Do not silently broaden a currently executing checkpoint.
- Consequential architecture changes require an ADR.
