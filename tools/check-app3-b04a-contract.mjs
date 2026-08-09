#!/usr/bin/env node
/**
 * The published restore contract: the request body, and the two client
 * boundaries either side of it.
 *
 * Split from `check-app3-b04a.mjs` by responsibility — that module rules on the
 * *transition*, this one on what the transition publishes — and because the
 * checker would otherwise sit well past its size budget.
 *
 * The rule worth reading twice is the curated-client one. `APP3-B04A` is
 * backend-only: the generated client publishes restore because the contract
 * does, and the handwritten Admin boundary deliberately does not, because
 * `APP3-A04` activates all four lifecycle operations together against design
 * rows that are still `REVIEW_REQUIRED`. A single export crossed early would put
 * a control on a screen no design has approved, and nothing else would notice.
 *
 * Read-only, cross-platform pure Node.
 *
 * @param read `(key) => string | undefined` over the checker's canonical files
 * @param files the checker's `CANONICAL_FILES`, for message paths
 */

/** The generated client must carry restore; the curated Admin boundary must not. */
export function checkClientBoundary(read, fail, files) {
  const clientSchemas = read('clientSchemas') ?? '';
  const match = /export type AdminDesignTemplateRestore200 = ([^;]+);/.exec(clientSchemas);
  if (match === null) {
    fail(`${files.clientSchemas}: no generated type AdminDesignTemplateRestore200`);
  } else if (/\b(void|any|unknown|object)\b|Record<string, unknown>/.test(match[1])) {
    // The `APP3-B08-C1` defect: a response published without a schema generates
    // as `void`, and the client then types away the whole answer.
    fail(`${files.clientSchemas}: the restore response generates as "${match[1].trim()}"`);
  }
  if (!/RestoreDesignTemplateBody/.test(clientSchemas)) {
    fail(`${files.clientSchemas}: the restore body is not generated`);
  }
  if (!/adminDesignTemplateRestore/i.test(read('client') ?? '')) {
    fail(`${files.client}: the generated client carries no restore operation`);
  }

  const curated = read('curatedClient') ?? '';
  if (/[Rr]estore/.test(curated)) {
    fail(`${files.curatedClient}: exports restore — APP3-A04 owns lifecycle on the client`);
  }
}

/** The body: `APP3-B04`'s token, a bounded non-blank reason, and nothing else. */
export function checkRequestContract(read, fail, files) {
  const request = read('request') ?? '';
  const schema = /restoreDesignTemplateBodySchema = ([\s\S]*?)\n\nexport class/.exec(request);
  if (schema === null) {
    fail(`${files.request}: the restore body schema is not identifiable`);
    return;
  }
  const body = schema[1];
  if (!/expectedCurrentVersion: z\.number\(\)\.int\(\)\.min\(0\)/.test(body)) {
    fail(`${files.request}: restore takes no non-negative expected version`);
  }
  // Trimmed and non-empty: a blank reason satisfies "required" and none of its
  // purpose. `IMP-D042` PO-03 requires one for archive and restore alike.
  if (!/reason: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(/.test(body)) {
    fail(`${files.request}: restore does not require a bounded non-blank reason`);
  }
  if (!/\.strict\(\)/.test(body)) {
    fail(`${files.request}: the restore body accepts unknown fields`);
  }
  // Nothing server-owned, and above all no target state: a body that could name
  // one could ask for the `ARCHIVED → PUBLISHED` that LC-24 forbids outright.
  for (const owned of ['status', 'archivedAt', 'publishedAt', 'document', 'force', 'productId']) {
    if (new RegExp(`\\b${owned}\\b`).test(body)) {
      fail(`${files.request}: the restore body accepts server-owned "${owned}"`);
    }
  }
  const registered = /registerZodDtos\([\s\S]*?RestoreDesignTemplateBody/.test(request);
  if (!/RestoreDesignTemplateBody/.test(request) || !registered) {
    fail(`${files.request}: the restore DTO is not registered for publication`);
  }
}
