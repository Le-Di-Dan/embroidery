# @embroidery/test-utils

Package-neutral integration-test helpers (APP0-T01).

## Content

- `CleanupStack` — LIFO teardown orchestration. Register acquired resources in
  order; `run()` releases them in reverse, executing every step even if one
  throws and aggregating failures, so a failing `app.close()` can never leak the
  database it was meant to precede.

## Boundary

Deliberately tool- and framework-agnostic:

- No database lifecycle — that is owned by `@embroidery/database/testing`
  (disposable databases, migrations, schema/fingerprint verification, cleanup).
- No Nest bootstrap — application integration contexts live in each app's own
  test-support directory (e.g. `apps/api/src/tests/support`), so `AppModule` is
  never imported into this shared package.
- No business rules, no schema/migration copies, no credentials.
