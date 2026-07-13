# 13 — Acceptance Principles

**Status:** Baseline for future delivery  
**Version:** 0.1.0

## 1. No implementation-only acceptance

A feature is not accepted because code exists.

Acceptance requires evidence that the feature:

- Matches product requirement.
- Handles success state.
- Handles loading state.
- Handles empty state.
- Handles error state.
- Enforces authorization.
- Preserves data integrity.
- Has automated tests.
- Has demonstrated end-to-end behavior where applicable.

## 2. Mandatory evidence

Each development slice should include:

- Scope summary.
- Files changed.
- Tests added.
- Test results.
- Manual verification steps.
- Screenshots or recordings for UI where appropriate.
- Migration evidence if schema changes.
- Security notes.
- Known limitations.
- Rollback notes.

## 3. Critical end-to-end journeys

At minimum, the final product must prove:

### E2E-01

Browse product → Customize → Submit request → Verify identity.

### E2E-02

Admin review → Quote → Digitize → Send design version.

### E2E-03

Customer requests revision → New version → Previous version preserved.

### E2E-04

Customer approves exact version → Approval snapshot created.

### E2E-05

Deposit 40% verified → Inventory reserved → Production allowed.

### E2E-06

Production completed → Final payment 60% verified → Delivery allowed.

### E2E-07

Customer-owned product request with uploaded images and manual review.

### E2E-08

Abandoned temporary design expires safely.

### E2E-09

Customer cannot export original or high-resolution preview.

### E2E-10

Duplicate payment callback does not duplicate payment or transition.

## 4. Quality gates

Future technical planning must define gates for:

- Lint.
- Format.
- Type checking.
- Unit tests.
- Integration tests.
- API contract tests.
- E2E tests.
- Accessibility checks.
- Security checks.
- Dependency scanning.
- Migration testing.
- Backup/restore verification.
- Performance checks.

## 5. Claude delivery rule

Claude must not be asked to implement a broad capability without:

- Source documents.
- Exact slice boundary.
- Acceptance criteria.
- Test expectations.
- Forbidden changes.
- Evidence format.

## 6. Definition of done

A slice is done only when:

- All agreed requirements are satisfied.
- Required tests pass.
- No known critical defect remains.
- Documentation is updated.
- Evidence is reviewable by a human.
- The change can be rolled back or recovered safely.
