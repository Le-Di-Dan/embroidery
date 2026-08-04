/**
 * `APP3-B01-C1` — the placement concurrency contract, as a published contract.
 *
 * Split out of `check-app3-b01.mjs` for the 400-line limit, the same way
 * `check-app3-db01-placement.mjs` sits beside `check-app3-db01.mjs`. It owns one
 * question: can a client actually *see* and *use* the compare-and-set?
 *
 * The delivered checkpoint enforced the CAS correctly and published the replace
 * body as an empty object, so every functional test passed while the generated
 * client had no way to type the token. That is the failure this file exists to
 * make impossible: it reads the **committed** OpenAPI document and the
 * **generated** client, not the source that produced them.
 *
 * Read-only, cross-platform pure Node.
 */

/** The Catalog-wide concurrency vocabulary; placement may not invent a second. */
export const TOKEN_RESPONSE_FIELD = 'updatedAt';
export const TOKEN_REQUEST_FIELD = 'expectedUpdatedAt';

/** The safe error a stale write maps to. */
export const STALE_WRITE_CODE = 'PLACEMENT_VERSION_CONFLICT';

const ADMIN_PATH = '/api/admin/products/{productId}/placement';

/**
 * Every concurrency-contract invariant, as failures pushed onto `fail`.
 *
 * `sources` carries the already-read texts so the caller keeps one set of file
 * reads: `document` (parsed OpenAPI), `client`, `request`, `response`,
 * `service`, `repository`, `errors`, and the two spec texts.
 */
export function checkPlacementConcurrency(sources, fail) {
  checkPublishedContract(sources, fail);
  checkGeneratedClient(sources, fail);
  checkImplementation(sources, fail);
  checkTests(sources, fail);
}

/** 2, 3, 4, 5 — the token is readable, required, returned, and never public. */
function checkPublishedContract({ document }, fail) {
  const schemas = document.components?.schemas ?? {};

  const response = schemas.AdminProductPlacementResponse;
  if (response?.properties?.[TOKEN_RESPONSE_FIELD] === undefined) {
    fail(`the Admin placement response does not expose \`${TOKEN_RESPONSE_FIELD}\``);
  } else if (!(response.required ?? []).includes(TOKEN_RESPONSE_FIELD)) {
    // Optional would mean a client may legitimately receive no token and then
    // has nothing to send back.
    fail(`\`${TOKEN_RESPONSE_FIELD}\` is optional in the Admin placement response`);
  }

  const body = schemas.ReplaceProductPlacementBody;
  if (body?.properties?.[TOKEN_REQUEST_FIELD] === undefined) {
    fail(`the replace body does not document \`${TOKEN_REQUEST_FIELD}\``);
  } else if (!(body.required ?? []).includes(TOKEN_REQUEST_FIELD)) {
    fail(`\`${TOKEN_REQUEST_FIELD}\` is optional in the replace body`);
  }
  // An empty documented body is what shipped the first time: the schema existed,
  // carried no property, and nothing noticed.
  if (Object.keys(body?.properties ?? {}).length === 0) {
    fail('the replace body publishes no properties at all');
  }

  // A successful replace must hand back the whole model, which is where the
  // fresh token lives; returning 204 would strand the client on a stale value.
  const success = document.paths?.[ADMIN_PATH]?.put?.responses?.['200'];
  if (success === undefined) {
    fail('the replace declares no 200 response');
  } else if (!JSON.stringify(success).includes('AdminProductPlacementResponse')) {
    fail('a successful replace does not return the model carrying the fresh token');
  }

  const publicSchemas = Object.entries(schemas).filter(([name]) => name.startsWith('Public'));
  const serialized = JSON.stringify(Object.fromEntries(publicSchemas));
  for (const field of [TOKEN_RESPONSE_FIELD, TOKEN_REQUEST_FIELD]) {
    if (serialized.includes(field)) fail(`the public manifest exposes \`${field}\``);
  }
}

/** 10 (client half) — the token is typed in and out for a real consumer. */
function checkGeneratedClient({ client }, fail) {
  const input = new RegExp(
    `interface ReplaceProductPlacementBody[\\s\\S]{0,600}${TOKEN_REQUEST_FIELD}: string;`,
  );
  const output = new RegExp(
    `interface AdminProductPlacementResponse[\\s\\S]{0,900}${TOKEN_RESPONSE_FIELD}: string;`,
  );
  if (!input.test(client)) {
    fail(`the generated client does not type \`${TOKEN_REQUEST_FIELD}\`; regenerate it`);
  }
  if (!output.test(client)) {
    fail(`the generated client does not type \`${TOKEN_RESPONSE_FIELD}\`; regenerate it`);
  }
}

/** 6, 7, 8 — the CAS opens the transaction, and there is no way around it. */
function checkImplementation({ request, service, repository, errors }, fail) {
  // The Catalog convention, offset included. A bare `datetime()` refuses a token
  // carrying `+07:00` that every other Admin Product write accepts.
  if (
    !/expectedUpdatedAt:\s*z\s*\.?\s*string\(\)\s*\.datetime\(\{\s*offset:\s*true\s*\}\)/.test(
      request,
    )
  ) {
    fail('the replace body does not use the Catalog `datetime({ offset: true })` token format');
  }
  if (/expectedUpdatedAt[\s\S]{0,80}\.optional\(\)/.test(request)) {
    fail('the concurrency token is optional in the request schema');
  }

  if (!errors.includes(`'${STALE_WRITE_CODE}'`)) {
    fail(`the placement error union is missing ${STALE_WRITE_CODE}`);
  }
  if (!new RegExp(`VERSION[\\s\\S]{0,80}${STALE_WRITE_CODE}|${STALE_WRITE_CODE}`).test(service)) {
    fail(`a failed compare-and-set does not map to ${STALE_WRITE_CODE}`);
  }

  // The CAS is one statement carrying both the identity and the expected token.
  if (!/eq\(products\.updatedAt,\s*expectedUpdatedAt\)/.test(repository)) {
    fail('the guarded update does not compare the caller token against products.updated_at');
  }
  if (!/\.returning\(/.test(repository)) {
    fail('the guarded update does not return the fresh token');
  }
  // A read, a decision and then an unconditional write would leave a window in
  // which two replaces both believed they held the current version.
  if (/select[\s\S]{0,200}products\.updatedAt[\s\S]{0,200}update\(products\)/.test(repository)) {
    fail('the repository appears to read products.updated_at before updating it');
  }

  // Ordering: nothing may be written before the lock is held. Measured inside
  // the method body, because the import block names these symbols first and
  // indexing the whole file would compare declaration order, not call order.
  const body = service.slice(service.indexOf('async replace('));
  const lockAt = body.indexOf('lockProductForReplace');
  const planAt = body.indexOf('planPlacementReplace');
  const applyAt = body.indexOf('this.apply(');
  if (lockAt < 0 || planAt < 0 || applyAt < 0) {
    fail('the replace no longer locks, plans and applies as three ordered steps');
  } else if (!(lockAt < planAt && planAt < applyAt)) {
    fail('the compare-and-set is not the opening write of the replacement transaction');
  }

  // No fallback that would let a missing token through.
  for (const [pattern, complaint] of [
    [/expectedUpdatedAt\s*\?\?/, 'a default for a missing token'],
    [/expectedUpdatedAt\s*===\s*undefined/, 'a missing-token branch'],
    [/new Date\(\)\s*,?\s*\/\/\s*token/i, 'a server-generated token'],
  ]) {
    if (pattern.test(service) || pattern.test(request)) {
      fail(`the concurrency contract has ${complaint}`);
    }
  }
}

/** 9 — the focused proofs exist and name what they prove. */
function checkTests({ contractSpec, concurrencySpec }, fail) {
  for (const proof of [
    'is returned by the Admin read, and required there',
    'is required by the Admin replace body',
    'never appears in the public manifest',
    'is typed by the generated client, in and out',
  ]) {
    if (!contractSpec.includes(proof)) fail(`the contract regression "${proof}" is missing`);
  }
  for (const proof of [
    'is the exact products.updated_at value, in canonical wire format',
    'is advanced and returned by a successful replace',
    'writes no side or area when the compare-and-set fails',
    'lets exactly one commit, and the winner holds the stored token',
    'lets the loser succeed on a retry with the returned fresh token',
  ]) {
    if (!concurrencySpec.includes(proof)) fail(`the concurrency regression "${proof}" is missing`);
  }
}
