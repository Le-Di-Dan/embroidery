/**
 * The transport and read-only rules of APP3-B05A, split out by responsibility.
 *
 * These four answer "what leaves the process, and what may it touch on the way":
 * private storage and a reconciled length, headers an immutable version does not
 * exempt this route from, one indistinguishable answer for twelve reasons, and a
 * path with no write reachable from it.
 *
 * Kept apart from the entry point so no file crosses the repository's 400-line
 * source limit. Every consumer keeps one import: check-app3-b05a.mjs re-exports
 * all of this.
 */
import { CANONICAL_FILES, OWNED_SOURCE, code, read } from './check-app3-b05a.mjs';

/** Private storage, reconciled length, torn-down streams, no transaction. */
export function checkStreaming(rootDir, fail) {
  const service = code(rootDir, 'service');
  if (!service.includes('getObjectStream')) {
    fail(`${CANONICAL_FILES.service}: does not stream through the object-storage port`);
  }
  if (!/providerSize !== candidate\.byteSize/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not reconcile the provider size with byte_size`);
  }
  if (!/result\.body\.destroy\(\)/.test(service)) {
    fail(`${CANONICAL_FILES.service}: does not destroy the stream it refuses`);
  }
  if (!service.includes("'REQUEST_ABORTED'")) {
    fail(`${CANONICAL_FILES.service}: does not propagate a client abort as itself`);
  }
  for (const key of OWNED_SOURCE) {
    const source = code(rootDir, key);
    for (const forbidden of [
      'presign',
      'getSignedUrl',
      'amazonaws',
      'minio',
      'runInTransaction',
      'BEGIN',
    ]) {
      if (source.includes(forbidden)) {
        fail(`${CANONICAL_FILES[key]}: uses "${forbidden}" on a public streaming read`);
      }
    }
  }
  const controller = code(rootDir, 'controller');
  if (!/abort\.signal\.addEventListener\('abort'/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not tear the body down on a disconnect`);
  }
}

/** The transport rules an immutable version does not exempt this route from. */
export function checkHeaders(rootDir, fail) {
  const policy = read(rootDir, 'policy') ?? '';
  for (const [needle, complaint] of [
    ["PUBLIC_TEMPLATE_ASSET_CACHE_CONTROL = 'no-store'", 'does not send no-store'],
    ["PUBLIC_TEMPLATE_ASSET_CONTENT_TYPE_OPTIONS = 'nosniff'", 'does not send nosniff'],
    ["PUBLIC_TEMPLATE_ASSET_CONTENT_DISPOSITION = 'inline'", 'does not send an inline disposition'],
  ]) {
    if (!policy.includes(needle)) fail(`${CANONICAL_FILES.policy}: ${complaint}`);
  }
  const controller = code(rootDir, 'controller');
  for (const forbidden of ['ETag', 'Last-Modified', 'Accept-Ranges', 'max-age', 'filename']) {
    if (new RegExp(forbidden, 'i').test(controller)) {
      fail(`${CANONICAL_FILES.controller}: sends "${forbidden}"`);
    }
  }
  if (!controller.includes('length: stream.contentLengthBytes')) {
    fail(`${CANONICAL_FILES.controller}: does not send the reconciled content length`);
  }
}

/** One answer for every reason, and nothing interpolated into it. */
export function checkNonDisclosure(rootDir, fail) {
  const errors = read(rootDir, 'errors') ?? '';
  const declared = /PUBLIC_DESIGN_TEMPLATE_ASSET_ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(
    errors,
  );
  if (declared === null) {
    fail(`${CANONICAL_FILES.errors}: the error vocabulary is no longer identifiable`);
  } else {
    const codes = (declared[1].match(/'([A-Z_]+)'/g) ?? []).length;
    // Three, and no more. A fourth code is how "not found" acquires a reason.
    if (codes !== 3) fail(`${CANONICAL_FILES.errors}: ${codes} error codes, expected 3`);
  }
  for (const [needle, complaint] of [
    ['NotFoundException', 'does not map the miss to a 404'],
    ['ServiceUnavailableException', 'does not map a storage contradiction to a 503'],
    ['BadRequestException', 'does not map a malformed address to a 400'],
  ]) {
    if (!errors.includes(needle)) fail(`${CANONICAL_FILES.errors}: ${complaint}`);
  }
  // No message is assembled: every one is a literal in the table above it.
  if (/\$\{/.test(errors.replace(/`\$\{[a-zA-Z.]*(code|message)\}`/g, ''))) {
    const interpolated = /MESSAGES[\s\S]*?\};/.exec(errors)?.[0] ?? '';
    if (/\$\{/.test(interpolated)) {
      fail(`${CANONICAL_FILES.errors}: a caller-facing message is interpolated`);
    }
  }
  // Every miss reaches the one not-found rather than a code of its own.
  const service = code(rootDir, 'service');
  const misses = (service.match(/publicDesignTemplateAssetNotFound\(\)/g) ?? []).length;
  if (misses < 3) {
    fail(`${CANONICAL_FILES.service}: not every authorization term collapses into the safe miss`);
  }
}

/** A pure read: nothing here can write, append or enqueue. */
export function checkReadOnly(rootDir, fail) {
  for (const key of OWNED_SOURCE) {
    const source = code(rootDir, key);
    for (const forbidden of [
      '.insert(',
      '.update(',
      '.delete(',
      'for(',
      'AuditRecorder',
      'OutboxEventStore',
      'appendEvent',
      'enqueue',
      'normalizationRequested',
    ]) {
      if (source.includes(forbidden)) {
        fail(`${CANONICAL_FILES[key]}: reaches a write ("${forbidden}") on a read-only route`);
      }
    }
  }
  // Stripped of prose: the module's docblock names the very things it must not
  // bind, and explaining a rule must not read as breaking it.
  const module = code(rootDir, 'module');
  for (const forbidden of ['AuditModule', 'OutboxModule', 'DESIGN_TEMPLATE_REPOSITORY']) {
    if (module.includes(forbidden)) {
      fail(`${CANONICAL_FILES.module}: binds "${forbidden}", which carries a write`);
    }
  }
  for (const required of [
    'PUBLIC_DESIGN_TEMPLATE_ASSET_REPOSITORY',
    'CatalogPlacementReadModule',
    'ObjectStorageModule',
  ]) {
    if (!module.includes(required)) fail(`${CANONICAL_FILES.module}: does not bind ${required}`);
  }
}
