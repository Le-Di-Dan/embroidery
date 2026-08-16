#!/usr/bin/env node
/**
 * `APP4-S02` — the Storefront secure-link landing gate.
 *
 * The failures this gate exists for are the ones that ship looking correct:
 *
 * - **The strip drifts late.** Somebody moves `history.replaceState` into an
 *   `onSuccess`, a `finally`, or a second effect "for tidiness". The screen
 *   behaves identically, every component test passes, and the credential is now
 *   in the address bar while the request is in flight — visible to a shoulder,
 *   a screenshot, a bookmark and any script that reads `location`.
 * - **The token is persisted "so a reload works".** A reload after the strip
 *   genuinely cannot recover it, which looks like a bug until you remember that
 *   is the entire design. `sessionStorage` makes the bug go away and the
 *   security property with it.
 * - **`mutate(token)`.** The ordinary way to write it, and the one that parks
 *   the credential in TanStack's retained `variables`.
 * - **A helpful error screen.** "Liên kết đã hết hạn" is kinder copy and an
 *   enumeration oracle: the browser cannot know that, so writing it means
 *   guessing, and guessing right sometimes is what makes it a probe.
 * - **A query fallback.** `?t=` "for links that lose the fragment" — which
 *   writes the credential into every access log the fragment exists to avoid.
 * - **The authorized content grows an identifier.** A request id here, an asset
 *   id there, and the page has invited a lookup surface for a value the
 *   customer cannot use and `G01 §5` refuses to authorize.
 * - **A chained resolve.** `publicSecureLinkResolve` in front of
 *   `publicCustomRequestStatus` "because that is how you resolve a link". The
 *   page renders identically and the token is authorized twice, the abuse
 *   budget spent twice, the credential held across two flights.
 *
 * ### Scope, after `APP5-S02`
 *
 * The landing is now two features: `secure-link-access` owns the fragment, the
 * strip, the credential lifetime and the three access states `APP4-D01` drew;
 * `custom-request-status` fills the authorized slot with the request, which is
 * what `APP5-D01` asked for when it reused these frames rather than redrawing
 * them (`661:335`). Every rule below is unchanged and now sweeps both — the
 * consumer moved, the security contract did not.
 *
 * Assertions read **real source with comments stripped**, the **registry**, and
 * the **generated contract** — never prose and never the completion report.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 *
 * Usage: node tools/check-app4-s02.mjs [rootDir]
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { stripComments } from './check-app4-b01.mjs';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const STOREFRONT = 'apps/storefront/src';
export const FEATURE_DIR = `${STOREFRONT}/features/secure-link-access`;

/**
 * The APP5 consumer of the same machinery (`APP5-S02`).
 *
 * `APP4-D01` drew the authorized state as an empty handoff slot and `APP5-D01`
 * reuses these frames rather than redrawing them, so the authorized card is now
 * APP5's request content and the credential is spent on `APP5-B03`. Every
 * fragment and token rule below is unchanged and is swept across **both**
 * directories: the consumer changed, the security contract did not, and a
 * checker that stopped at the old directory would have stopped checking the
 * exact file that now holds a live credential.
 */
export const STATUS_FEATURE_DIR = `${STOREFRONT}/features/custom-request-status`;

/** The one approved route. */
export const S02_ROUTE = 'truy-cap';

export const CANONICAL_FILES = Object.freeze({
  page: `${STOREFRONT}/app/${S02_ROUTE}/page.tsx`,
  index: `${FEATURE_DIR}/index.ts`,
  client: `${STATUS_FEATURE_DIR}/api/custom-request-status.client.ts`,
  controller: `${FEATURE_DIR}/hooks/use-secure-link-bootstrap.ts`,
  fragment: `${FEATURE_DIR}/model/secure-link-fragment.ts`,
  state: `${FEATURE_DIR}/model/secure-link-state.ts`,
  copy: `${FEATURE_DIR}/model/secure-link-copy.ts`,
  screen: `${FEATURE_DIR}/ui/secure-link-shell.tsx`,
  provider: `${FEATURE_DIR}/ui/secure-link-query-provider.tsx`,
  authorized: `${STATUS_FEATURE_DIR}/ui/request-status-content.tsx`,
  unavailable: `${FEATURE_DIR}/ui/secure-link-unavailable-card.tsx`,
  errorCard: `${FEATURE_DIR}/ui/secure-link-error-card.tsx`,
  styles: `${FEATURE_DIR}/styles/secure-link-access.scss`,
  apiClientIndex: 'packages/api-client/src/index.ts',
  generatedSchemas: 'packages/api-client/src/generated/embroidery-api.schemas.ts',
  registry: 'docs/design/FIGMA_DESIGN_INDEX.md',
  openapi: 'packages/contracts/openapi/openapi.generated.json',
});

/**
 * The one generated operation this landing is allowed to reach.
 *
 * `APP5-B03` runs the whole APP4 authorization chain internally — policy, the
 * secure-link limiter, secure-link resolution, then the customer-safe request
 * projection — so the landing resolves the link and reads the request in a
 * single round trip.
 */
export const REQUIRED_OPERATION = 'publicCustomRequestStatus';

/**
 * The operation the landing must **not** reach.
 *
 * Chaining `publicSecureLinkResolve` in front of B03 would authorize the same
 * token twice, spend the same per-IP abuse budget twice and hold the raw
 * credential across two flights — for a request id B03 resolves for itself and
 * never discloses. It stays published, because APP4 owns that contract; it is
 * simply not this landing's to call.
 */
export const FORBIDDEN_CHAINED_OPERATION = 'publicSecureLinkResolve';

/** The registry rows this checkpoint consumes; all six must be approved. */
export const S02_DESIGN_ROWS = Object.freeze([
  'FIG-SECURELINK-DESKTOP-BOOTSTRAP',
  'FIG-SECURELINK-DESKTOP-AUTHORIZED',
  'FIG-SECURELINK-DESKTOP-UNAVAILABLE',
  'FIG-SECURELINK-DESKTOP-NETWORKERROR',
  'FIG-SECURELINK-MOBILE-AUTHORIZED',
  'FIG-SECURELINK-MOBILE-UNAVAILABLE',
]);

/**
 * Copy that would distinguish one collapsed cause from another.
 *
 * Every entry is a phrase a well-meaning author would reach for while making
 * the unavailable screen "more helpful", and each one answers a question the
 * server refused to answer (`APP4-G01` PO-04, annotation `634:59`).
 */
const ENUMERATING_PHRASES = Object.freeze([
  'liên kết đã hết hạn',
  'đã bị thu hồi',
  'bị thu hồi',
  'đã được thay thế',
  'sai tài khoản',
  'sai yêu cầu',
  'không đúng tài khoản',
  'token không hợp lệ',
  'mã không hợp lệ',
  'liên kết không hợp lệ',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key]);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function stripped(rootDir, key) {
  return stripComments(read(rootDir, key) ?? '');
}

/**
 * Every runtime source file on the credential path, comments stripped.
 *
 * Both features, because both are on it: the security machinery lives in one
 * and the consumer that spends the credential lives in the other.
 */
export function featureSources(rootDir) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry)) {
        files.push({
          path: full.slice(join(rootDir, '').length).replace(/\\/g, '/'),
          code: stripComments(readFileSync(full, 'utf8')),
        });
      }
    }
  };
  for (const dir of [FEATURE_DIR, STATUS_FEATURE_DIR]) {
    const base = join(rootDir, dir);
    if (existsSync(base)) walk(base);
  }
  const page = join(rootDir, CANONICAL_FILES.page);
  if (existsSync(page)) {
    files.push({ path: CANONICAL_FILES.page, code: stripComments(readFileSync(page, 'utf8')) });
  }
  return files;
}

/** Only the components — the files that may put something on screen. */
function componentSources(rootDir) {
  return featureSources(rootDir).filter((file) => file.path.endsWith('.tsx'));
}

/** 1, 2 — exactly one secure-link landing, at the approved slug. */
function checkRoute(rootDir, fail) {
  if (!existsSync(join(rootDir, CANONICAL_FILES.page))) {
    fail(`${CANONICAL_FILES.page}: the approved route does not exist`);
  }
  const appDir = join(rootDir, STOREFRONT, 'app');
  if (!existsSync(appDir)) return;
  /*
   * No alternate landing surface. A second route is how a "temporary" debug
   * page or an English-slug duplicate outlives the checkpoint that added it,
   * and both would accept a live credential.
   */
  for (const entry of readdirSync(appDir)) {
    if (entry === S02_ROUTE) continue;
    if (/secure|securelink|truycap|access|grant|magic|open-link/i.test(entry)) {
      fail(`apps/storefront/src/app/${entry}: a second secure-link landing route exists`);
    }
  }
}

/** 3 — every consumed registry row is approved, not merely present. */
function checkDesignApproval(rootDir, fail) {
  const registry = read(rootDir, 'registry');
  if (registry === undefined) {
    fail(`${CANONICAL_FILES.registry}: missing`);
    return;
  }
  const lines = registry.split('\n');
  for (const id of S02_DESIGN_ROWS) {
    const row = lines.find((line) => line.startsWith(`| ${id} `));
    if (row === undefined) {
      fail(`${CANONICAL_FILES.registry}: row ${id} is missing`);
      continue;
    }
    if (!row.includes('APPROVED_FOR_IMPLEMENTATION')) {
      fail(`${CANONICAL_FILES.registry}: row ${id} is not APPROVED_FOR_IMPLEMENTATION`);
    }
    if (!row.includes('FIG-APPROVAL-APP4-D01-PO-001')) {
      fail(`${CANONICAL_FILES.registry}: row ${id} carries no approval evidence`);
    }
    if (!row.includes(`/${S02_ROUTE}`)) {
      fail(`${CANONICAL_FILES.registry}: row ${id} does not name the /${S02_ROUTE} route`);
    }
  }
}

/** 4, 5, 6 — the generated client is the only transport, and no URL is written. */
function checkGeneratedClient(rootDir, fail) {
  const client = stripped(rootDir, 'client');
  if (!client.includes(REQUIRED_OPERATION)) {
    fail(`${CANONICAL_FILES.client}: does not use the generated ${REQUIRED_OPERATION}`);
  }
  if (!/from '@embroidery\/api-client'/.test(client)) {
    fail(`${CANONICAL_FILES.client}: does not import from the api-client boundary`);
  }
  // The curated boundary, never the generated tree. Comments are stripped
  // first: `index.ts` explains at length why this operation crosses, and a gate
  // satisfied by its own rationale would prove nothing.
  const boundary = stripComments(read(rootDir, 'apiClientIndex') ?? '');
  if (!boundary.includes(REQUIRED_OPERATION)) {
    fail(`${CANONICAL_FILES.apiClientIndex}: does not export ${REQUIRED_OPERATION}`);
  }
  /*
   * No chained resolve, anywhere on the credential path. This is the assertion
   * for the architecture ruling: the failure it guards is invisible on screen —
   * the page renders identically — so it can only be caught in source or by a
   * test that counts calls, and both exist.
   */
  for (const file of featureSources(rootDir)) {
    if (file.code.includes(FORBIDDEN_CHAINED_OPERATION)) {
      fail(`${file.path}: chains ${FORBIDDEN_CHAINED_OPERATION}; B03 authorizes the token itself`);
    }
  }
  for (const file of featureSources(rootDir)) {
    if (/from '.*generated\//.test(file.code)) {
      fail(`${file.path}: deep-imports the generated client tree`);
    }
    if (
      /['"`]\/api\/|secure-links\/resolve|axios\.(get|post|put|delete)|[^.\w]fetch\(/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: hard-codes an API URL or bypasses the generated client`);
    }
  }
}

/** 7, 8, 9 — the fragment is the only carrier, under the contract's own shape. */
function checkFragmentCarrier(rootDir, fail) {
  const fragment = stripped(rootDir, 'fragment');
  if (!/SECURE_LINK_FRAGMENT_KEY = 't'/.test(fragment)) {
    fail(`${CANONICAL_FILES.fragment}: the fragment key is not exactly 't'`);
  }
  if (!/SECURE_LINK_FRAGMENT_PREFIX = `#\$\{SECURE_LINK_FRAGMENT_KEY\}=`/.test(fragment)) {
    fail(`${CANONICAL_FILES.fragment}: the accepted prefix is not derived from the key`);
  }
  /*
   * The accepted token shape is the contract's, not a transcription that could
   * drift. Orval emits the pattern as JSDoc rather than as a value, so the two
   * are compared as text here — which is the only mechanical link available and
   * is better than none.
   */
  const schemas = read(rootDir, 'generatedSchemas') ?? '';
  const published = /@pattern (\^\[A-Za-z0-9_-\]\{\d+\}\$)/.exec(schemas)?.[1];
  if (published === undefined) {
    fail(`${CANONICAL_FILES.generatedSchemas}: publishes no secure-link token pattern`);
  } else if (!fragment.includes(`'${published}'`)) {
    fail(`${CANONICAL_FILES.fragment}: the accepted token shape is not the published ${published}`);
  }
  // No other carrier, and no repair of a malformed one.
  for (const file of featureSources(rootDir)) {
    if (
      /URLSearchParams|useSearchParams|searchParams\.get|location\.search\s*\.|\.query\b/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: reads a token from the query string`);
    }
    if (/location\.pathname\.(split|slice|match|replace)|useParams\(/.test(file.code)) {
      fail(`${file.path}: reads a token from the path`);
    }
    if (/headers\s*:\s*\{[^}]*[Tt]oken|Authorization/.test(file.code)) {
      fail(`${file.path}: puts a token in a header`);
    }
    if (
      /decodeURIComponent|\.toLowerCase\(\)|\.trim\(\)/.test(file.code) &&
      file.path.endsWith('secure-link-fragment.ts')
    ) {
      fail(`${file.path}: normalizes the credential bytes`);
    }
  }
  // Only the fragment module and the controller may know the carrier exists;
  // a component that could read it could also render it.
  for (const file of componentSources(rootDir)) {
    if (/location\.hash|tokenRef|readSecureLinkToken|SECURE_LINK_FRAGMENT/.test(file.code)) {
      fail(`${file.path}: a component reaches the token carrier`);
    }
  }
}

/** 10 — the strip happens before the request, as straight-line code. */
function checkStripBeforeRequest(rootDir, fail) {
  const controller = stripped(rootDir, 'controller');
  const capture = controller.indexOf('readSecureLinkToken(');
  const strip = controller.indexOf('stripSecureLinkFragment(');
  const request = controller.indexOf('resolve.mutate()');
  if (capture < 0) {
    fail(`${CANONICAL_FILES.controller}: never captures the fragment`);
    return;
  }
  if (strip < 0) {
    fail(`${CANONICAL_FILES.controller}: never strips the fragment`);
    return;
  }
  if (request < 0) {
    fail(`${CANONICAL_FILES.controller}: never issues the resolve request`);
    return;
  }
  if (!(capture < strip)) {
    fail(`${CANONICAL_FILES.controller}: the fragment is stripped before it is captured`);
  }
  if (!(strip < request)) {
    fail(`${CANONICAL_FILES.controller}: the resolve request precedes the fragment strip`);
  }
  // The strip is unconditional: it must not sit inside the branch that has a
  // token, or a malformed fragment would survive in the address bar.
  const between = controller.slice(strip, request);
  if (/token === undefined/.test(controller.slice(capture, strip))) {
    fail(`${CANONICAL_FILES.controller}: the strip is conditional on a valid token`);
  }
  if (!/token === undefined/.test(between)) {
    fail(`${CANONICAL_FILES.controller}: a missing or malformed fragment is not short-circuited`);
  }
  /*
   * The removal is a `History.replaceState` call, and the History object is a
   * parameter rather than the global. That is not a style preference: it is
   * what lets a test hand in a recording double and prove the call happened
   * before the request, which a direct `window.history` reference could only be
   * asserted about by reading source.
   */
  const fragment = stripped(rootDir, 'fragment');
  if (!/historyApi: History\b/.test(fragment) || !/historyApi\.replaceState\(/.test(fragment)) {
    fail(`${CANONICAL_FILES.fragment}: the fragment is not removed with History.replaceState`);
  }
  if (!/window\.history/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not pass the real History to the strip`);
  }
}

/** 14, 16 — the URL and history carry nothing, and neither does a log. */
function checkUrlAndHistory(rootDir, fail) {
  const fragment = stripped(rootDir, 'fragment');
  if (/pushState/.test(fragment)) {
    fail(`${CANONICAL_FILES.fragment}: pushes a history entry instead of replacing one`);
  }
  // The replacement URL is built from pathname and search only. A `hash` here
  // would put the credential straight back where it came from.
  if (!/`\$\{location\.pathname\}\$\{location\.search\}`/.test(fragment)) {
    fail(`${CANONICAL_FILES.fragment}: the clean URL is not pathname + search alone`);
  }
  if (/location\.hash\}|\+ hash|hash\b\s*\}/.test(fragment.split('replaceState')[1] ?? '')) {
    fail(`${CANONICAL_FILES.fragment}: the replacement URL carries a fragment`);
  }
  for (const file of featureSources(rootDir)) {
    if (
      /console\.(log|info|warn|error|debug)|analytics|gtag|dataLayer|sendBeacon|Sentry|posthog/.test(
        file.code,
      )
    ) {
      fail(`${file.path}: logs, reports or beacons; a credential path must carry no payload`);
    }
    if (/next\/script|<Script\b/.test(file.code)) {
      fail(`${file.path}: introduces a third-party script`);
    }
    if (/router\.(push|replace)\(|location\.(assign|replace)\(/.test(file.code)) {
      fail(`${file.path}: navigates programmatically; the fragment must not be re-rendered`);
    }
  }
}

/** 11, 12, 13 — no store, no storage, no reducer copy of the token. */
function checkTokenSecrecy(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    if (/zustand|createStore|useStore\(/.test(file.code)) {
      fail(`${file.path}: uses a store; S02 state is a local reducer (§10)`);
    }
    if (/localStorage|sessionStorage|document\.cookie|indexedDB/.test(file.code)) {
      fail(`${file.path}: persists to browser storage`);
    }
  }
  const state = stripped(rootDir, 'state');
  if (/token/i.test(state)) {
    fail(`${CANONICAL_FILES.state}: the reducer state names a token`);
  }
  const controller = stripped(rootDir, 'controller');
  if (!/tokenRef/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the token is not held in a ref`);
  }
  if (/useState[^;]*token/i.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the token is held in React state`);
  }
  if (/dispatch\(\{[^}]*token/i.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: dispatches the token into the reducer`);
  }
}

/** 17, 18 — the mutation carries no variables and never retries itself. */
function checkMutationBoundary(rootDir, fail) {
  const controller = stripped(rootDir, 'controller');
  if (/\.mutate\(\s*[A-Za-z_{]/.test(controller)) {
    fail(
      `${CANONICAL_FILES.controller}: passes variables to a mutation; the token could ride along`,
    );
  }
  if (!/retry:\s*false/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the resolve mutation does not disable automatic retry`);
  }
  if (!/resolve\.reset\(\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: does not reset the mutation on settlement`);
  }
  if (/setTimeout|setInterval|refetchInterval|useQuery\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: schedules or polls; resolution is one manual request`);
  }
  const provider = stripped(rootDir, 'provider');
  if (!/mutations:\s*\{\s*retry:\s*false,\s*gcTime:\s*0\s*\}/.test(provider)) {
    fail(`${CANONICAL_FILES.provider}: the route-local client does not disable retry and caching`);
  }
}

/** 19, 20, 21, 22 — the token's exits, and the one case that keeps it. */
function checkTokenLifetime(rootDir, fail) {
  const controller = stripped(rootDir, 'controller');
  for (const needle of ['clearToken', 'useEffect(() => clearToken']) {
    if (!controller.includes(needle)) {
      fail(`${CANONICAL_FILES.controller}: no ${needle}; the token is not cleared on every exit`);
    }
  }
  const onSuccess = section(controller, 'onSuccess:', 'onError:');
  if (!onSuccess.includes('clearToken()')) {
    fail(`${CANONICAL_FILES.controller}: a resolved grant does not clear the token`);
  }
  const onError = section(controller, 'onError:', 'onSettled:');
  if (!onError.includes('clearToken()')) {
    fail(`${CANONICAL_FILES.controller}: a definitive refusal does not clear the token`);
  }
  /*
   * The transient branch must return *before* the clear. This is the one place
   * the token deliberately survives, and it is also the easiest place to
   * "tidy up" into a leak in the other direction — clearing there would make
   * the retry button send an empty credential.
   */
  const transient = onError.indexOf("=== 'TRANSIENT'");
  const clear = onError.indexOf('clearToken()');
  if (transient < 0) {
    fail(`${CANONICAL_FILES.controller}: no transient branch; every failure would be definitive`);
  } else if (!(transient < clear)) {
    fail(`${CANONICAL_FILES.controller}: the transient branch does not precede the clear`);
  }
  if (!/if \(tokenRef\.current === ''\) return;/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: retry does not guard on a held token`);
  }
  // Missing or malformed: dispatch and return, with no request in between.
  const missing = section(controller, 'if (token === undefined)', 'tokenRef.current = token');
  if (!/UNAVAILABLE/.test(missing) || !/return;/.test(missing)) {
    fail(`${CANONICAL_FILES.controller}: a missing token does not short-circuit to UNAVAILABLE`);
  }
  if (/mutate/.test(missing)) {
    fail(`${CANONICAL_FILES.controller}: a missing or malformed fragment still calls the API`);
  }
}

/** 23, 24, 25 — one unavailable state, for every cause, with no cause named. */
function checkNonEnumeration(rootDir, fail) {
  const state = stripped(rootDir, 'state');
  if (!/return 'UNAVAILABLE';\s*\}/.test(state)) {
    fail(`${CANONICAL_FILES.state}: no default definitive outcome; a 404 could fall through`);
  }
  if (/404/.test(state) && !/status === 429/.test(state)) {
    fail(`${CANONICAL_FILES.state}: branches on 404 rather than on the absence of a verdict`);
  }
  // One card renders every definitive refusal, and it takes no cause.
  const unavailable = stripped(rootDir, 'unavailable');
  if (/cause|reason|errorCode|code\s*[:=]/.test(unavailable)) {
    fail(`${CANONICAL_FILES.unavailable}: the unavailable card accepts a cause`);
  }
  const copy = (read(rootDir, 'copy') ?? '').toLowerCase();
  for (const phrase of ENUMERATING_PHRASES) {
    // Read with comments intact on purpose: this module's own documentation
    // lists the forbidden phrases to explain the rule, and stripping would be
    // fine — but the strings live in the same file, so the check is anchored to
    // the exported literal block instead.
    const literals = copy.slice(copy.indexOf('export const secure_link_copy'));
    if (literals.includes(phrase)) {
      fail(`${CANONICAL_FILES.copy}: carries cause-specific copy — "${phrase}" (634:59)`);
    }
  }
  // Exactly one unavailable card in the feature.
  const cards = componentSources(rootDir).filter((file) => /unavailable/i.test(file.path));
  if (cards.length !== 1) {
    fail(`the feature has ${cards.length} unavailable cards; the contract allows exactly one`);
  }
}

/** 26, 27 — the authorized content renders the frames and nothing beyond them. */
function checkAuthorizedShell(rootDir, fail) {
  const authorized = stripped(rootDir, 'authorized');
  /*
   * The identifiers `APP5-B03` returns are safe to *hold* and are drawn on no
   * approved frame, so none of them is rendered. A card that printed one would
   * be showing the customer a value they cannot use and inviting a lookup
   * surface for it — and the request code, the one identifier that *is* drawn,
   * is display-only and opens nothing (`G01 §5`).
   *
   * They do not reach this component at all: the projection drops them at the
   * hook boundary. The assertion is that the names never come back.
   */
  for (const field of ['requestId', 'assetId', 'productId', 'productVariantId', 'productSlug']) {
    if (authorized.includes(field)) {
      fail(`${CANONICAL_FILES.authorized}: renders ${field}, which no approved frame draws`);
    }
  }
  for (const file of componentSources(rootDir)) {
    /*
     * No component may *name* an APP6+ commercial concept. The approved copy
     * does name several — to say this page has none of them — and it lives in a
     * copy module, which is the boundary that keeps the two apart.
     */
    if (/quotation|payment|deposit|invoice|checkout/i.test(file.code)) {
      fail(`${file.path}: reaches for an APP6+ commercial concept`);
    }
    if (/onApprove|onSubmitRequest|useMutation\(/.test(file.code)) {
      fail(`${file.path}: a component owns a business action; this landing is read-only`);
    }
  }
  // One credential, one call: no second operation is reached anywhere.
  const client = stripped(rootDir, 'client');
  const operations = client.match(/public[A-Z]\w+/g) ?? [];
  if (new Set(operations).size !== 1) {
    fail(`${CANONICAL_FILES.client}: calls ${new Set(operations).size} operations; S02 calls one`);
  }
}

/** 5, 28 — S02 publishes no route and edits no contract. */
function checkNoBackendChange(rootDir, fail) {
  const openapi = read(rootDir, 'openapi');
  if (openapi === undefined) {
    fail(`${CANONICAL_FILES.openapi}: missing`);
    return;
  }
  const document = JSON.parse(openapi);
  const paths = Object.keys(document.paths ?? {});
  const secureLinks = paths.filter((path) => path.includes('/secure-links/'));
  if (secureLinks.length !== 1) {
    fail(`the secure-link surface is ${secureLinks.length} paths; S02 adds none`);
  }
  // B06 stays published — APP4 owns that contract, and not calling it from this
  // landing is a client decision, not a contract change.
  if (!paths.includes('/api/public/secure-links/resolve')) {
    fail('the B06 resolver is missing from the published contract');
  }
  if (!paths.includes('/api/public/custom-requests/status')) {
    fail('the B03 status read is missing from the published contract');
  }
  for (const file of featureSources(rootDir)) {
    if (/from '.*apps\/api|from '.*apps\/worker/.test(file.code)) {
      fail(`${file.path}: imports from a backend application`);
    }
  }
}

/** One `h1` per state, one `section`, and no second shell. */
function checkShellReuse(rootDir, fail) {
  for (const file of componentSources(rootDir)) {
    if (/<main\b|<header\b|<footer\b/.test(file.code)) {
      fail(`${file.path}: renders a second shell landmark`);
    }
  }
  const headings = componentSources(rootDir).filter((file) => /<h1\b/.test(file.code));
  // Bootstrap, authorized, unavailable and transient — one heading each, and
  // exactly one of the four is ever mounted.
  if (headings.length !== 4) {
    fail(`${headings.length} components own an h1; the four approved states own one each`);
  }
  const screen = stripped(rootDir, 'screen');
  if (/<h1\b/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: the screen owns an h1 as well as the cards`);
  }
  if (!/aria-live="polite"/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: no polite live region (634:145)`);
  }
}

/** File-size limits, which this feature is nowhere near but which move. */
function checkFileSizes(rootDir, fail) {
  for (const file of featureSources(rootDir)) {
    const lines = readFileSync(join(rootDir, file.path), 'utf8').split('\n').length;
    if (lines > 400) {
      fail(`${file.path}: ${lines} lines exceeds the 400-line source limit`);
    }
  }
}

/** The slice of `source` between two anchors; empty when either is absent. */
function section(source, from, to) {
  const start = source.indexOf(from);
  if (start < 0) return '';
  const end = source.indexOf(to, start);
  return source.slice(start, end < 0 ? undefined : end);
}

export function checkApp4S02(rootDir, fail) {
  checkRoute(rootDir, fail);
  checkDesignApproval(rootDir, fail);
  checkGeneratedClient(rootDir, fail);
  checkFragmentCarrier(rootDir, fail);
  checkStripBeforeRequest(rootDir, fail);
  checkUrlAndHistory(rootDir, fail);
  checkTokenSecrecy(rootDir, fail);
  checkMutationBoundary(rootDir, fail);
  checkTokenLifetime(rootDir, fail);
  checkNonEnumeration(rootDir, fail);
  checkAuthorizedShell(rootDir, fail);
  checkNoBackendChange(rootDir, fail);
  checkShellReuse(rootDir, fail);
  checkFileSizes(rootDir, fail);
}

const HEADLINE =
  'check:app4-s02 — the Storefront secure-link landing on exactly the six approved APP4-D01 rows, ' +
  'at the one route /truy-cap with no alternate landing surface; the token read only from the ' +
  'fragment under the exact key t and the token shape the generated contract publishes, with no ' +
  'query, path or header carrier, no fallback and no normalization of the credential bytes; ' +
  'captured, then stripped with history.replaceState to a pathname-and-search URL that carries no ' +
  'fragment, and only then POSTed in the body through the generated publicCustomRequestStatus ' +
  'exported from the curated api-client boundary, with publicSecureLinkResolve never chained in ' +
  'front of it anywhere on the credential path — the order proved as straight-line code, with ' +
  'the strip unconditional so a malformed fragment is removed too and makes no request; the token ' +
  'held in a ref and passed to a mutation that carries no variables, reset on settlement, cleared ' +
  'on a resolved grant, on a definitive refusal and on unmount, and kept only across a transient ' +
  'failure whose branch returns before the clear; no store, no localStorage, sessionStorage, ' +
  'cookie or indexedDB, no reducer copy, no history-state write, no programmatic navigation, and ' +
  'no console, analytics, beacon or third-party script anywhere in the feature; automatic retry ' +
  'disabled on the mutation and on the route-local client, with no timer, poll or query; one ' +
  'unavailable card that accepts no cause and no cause-specific copy, so a 404 and a malformed ' +
  'fragment are indistinguishable; authorized content that draws no identifier the response ' +
  'carries, no APP6+ commercial concept and no business action; one h1 per approved state with a ' +
  'polite live region and no second main, header or footer; and a secure-link surface still one ' +
  'path with both the B06 resolver and the B03 status read still published, so neither checkpoint ' +
  'changed the contract.';

if (process.argv[1]?.endsWith('check-app4-s02.mjs')) {
  const failures = [];
  checkApp4S02(REPO_ROOT, (message) => failures.push(message));
  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL ${failure}`);
    process.exit(1);
  }
  console.log(HEADLINE);
}
