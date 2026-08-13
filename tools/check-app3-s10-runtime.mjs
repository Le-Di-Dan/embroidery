#!/usr/bin/env node
/**
 * `APP3-S10` — the rules about the autosave loop itself.
 *
 * Split from `check-app3-s10.mjs` by responsibility and because the two together
 * would cross the 450-line soft cap: that module rules on the predecessors, the
 * design approval, the artifacts and the contract; this one rules on the code.
 *
 * Read-only, cross-platform pure Node.
 */
import { join } from 'node:path';

import { isS11Delivered } from './app3-accepted-paths.mjs';
import {
  CANONICAL_FILES,
  DEBOUNCE_MS,
  EXPECTED_MIGRATIONS,
  EXPECTED_OPERATIONS,
  EXPECTED_PATHS,
  EXPECTED_SCHEMAS,
  FEATURE,
  MAX_DIRTY_AGE_MS,
  MIGRATIONS,
  ROOT_SCRIPTS,
  code,
  collect,
  featureCode,
  outsideS10Code,
  preS11Code,
  publishedValues,
  read,
  s10Code,
} from './check-app3-s10.sources.mjs';

const SOURCE_LIMIT = 400;
const TEST_LIMIT = 600;

/** The cadence is a stated pair, and both ends decide when a save happens. */
export function checkCadence(rootDir, fail) {
  const model = code(rootDir, 'model');

  const debounce = /AUTOSAVE_DEBOUNCE_MS = (\d[\d_]*)/.exec(model);
  const ceiling = /AUTOSAVE_MAX_DIRTY_AGE_MS = (\d[\d_]*)/.exec(model);
  if (debounce === null || Number(debounce[1]?.replaceAll('_', '')) !== DEBOUNCE_MS) {
    fail(`${CANONICAL_FILES.model}: the debounce is not the ${String(DEBOUNCE_MS)} ms S10 locked`);
  }
  if (ceiling === null || Number(ceiling[1]?.replaceAll('_', '')) !== MAX_DIRTY_AGE_MS) {
    fail(
      `${CANONICAL_FILES.model}: the dirty-age ceiling is not the ${String(MAX_DIRTY_AGE_MS)} ms`,
    );
  }
  /*
   * The ceiling participates in the delay, rather than merely existing.
   *
   * A constant nothing reads is a comment: with the quiet rule alone, a customer
   * dragging for a minute never produces 2500 ms of quiet and every frame of that
   * minute is unsaved. `Math.min` of the two is what makes the ceiling bite, and
   * measuring it from `since` rather than `last` is what stops more editing
   * pushing it forward.
   */
  if (!/Math\.min\(quiet, ceiling\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the save delay is not the earlier of quiet and ceiling`);
  }
  if (!/streak\.since \+ AUTOSAVE_MAX_DIRTY_AGE_MS/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the ceiling is measured from the last edit, not the first`);
  }

  // No fixed-interval polling, anywhere in the feature.
  const all = featureCode(rootDir);
  for (const timer of ['setInterval(', 'requestIdleCallback(', 'navigator.serviceWorker']) {
    if (all.includes(timer))
      fail(`${FEATURE}: autosave polls or runs in the background (${timer})`);
  }
  // Nothing saves from a teardown. A tab being closed is not a place to start a
  // request whose outcome nobody will be left to reconcile.
  for (const beacon of ['sendBeacon', 'keepalive']) {
    if (all.includes(beacon)) fail(`${FEATURE}: a save is fired from page unload (${beacon})`);
  }
  const warning = code(rootDir, 'warning');
  if (!warning.includes('beforeunload')) {
    fail(`${CANONICAL_FILES.warning}: no navigation warning is installed`);
  }
  /*
   * A mechanical needle, not the word.
   *
   * The hook is called `useStudioUnsavedWarning`, so a ban on `save` fires on
   * the name of the thing it is protecting — the substring trap five earlier
   * checkpoints each recorded once. What must not appear near `beforeunload` is
   * a request: the operation, or either helper that wraps it.
   */
  const saves =
    /beforeunload[\s\S]{0,400}(attemptSave\(|saveSessionDocument\(|publicDesignSessionAutosave)/;
  if (saves.test(warning)) {
    fail(`${CANONICAL_FILES.warning}: the unload handler fires a save`);
  }
  if (!warning.includes('removeEventListener')) {
    fail(`${CANONICAL_FILES.warning}: the unload listener is never removed`);
  }
}

/** One request in flight, and every revision the server's own. */
export function checkOneInFlight(rootDir, fail) {
  const controller = code(rootDir, 'controller');

  if (!/if \(document === null \|\| inFlight\.current !== null/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a second save can start while one is in flight`);
  }
  if (!controller.includes('expectedRevision: serverRevision.current')) {
    fail(`${CANONICAL_FILES.controller}: the save does not present the revision it last read`);
  }
  // The save's own response, specifically. The reconciliation read adopts one
  // too, and a rule that accepted either would pass on a loop that took the
  // reconciliation's and quietly ignored the save's.
  if (!controller.includes('serverRevision.current = result.snapshot.revision')) {
    fail(`${CANONICAL_FILES.controller}: the response revision is not adopted verbatim`);
  }
  // The arithmetic that must not exist anywhere: a revision the server never
  // issued, presented the first time two tabs race.
  for (const computed of [/revision \+ 1/, /revision\+\+/, /revision \+= 1/]) {
    if (computed.test(featureCode(rootDir))) {
      fail(`${FEATURE}: a revision is computed rather than read (${String(computed)})`);
    }
  }
  // The submitted document is captured at the start, so a response answers for
  // what it was given rather than for whatever the customer has done since.
  if (!/submitted: document/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: the in-flight save does not hold what it submitted`);
  }
  // A newer local edit is never overwritten by an older response.
  if (!/if \(streak\.current === null\)[\s\S]{0,400}reconcile\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a save response can overwrite a newer local edit`);
  }
}

/** Nothing is replayed before the server has been asked what happened. */
export function checkReconciliation(rootDir, fail) {
  const controller = code(rootDir, 'controller');
  const model = code(rootDir, 'model');

  for (const required of ['classifyAmbiguousOutcome', 'readLatestSnapshot', 'RECONCILING']) {
    if (!controller.includes(required)) {
      fail(`${CANONICAL_FILES.controller}: an unknown outcome is not reconciled (${required})`);
    }
  }
  // A 409 and a lost response both go through the read, and neither retries
  // straight from the failure.
  if (!/why === 'conflict' \|\| why === 'ambiguous'/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a stale or unknown outcome is retried without a read`);
  }
  // The absence of a status is the ambiguity. A classifier that defaulted to a
  // retryable failure would replay a write that may already have landed.
  if (!/status === undefined\) return 'ambiguous'/.test(model)) {
    fail(`${CANONICAL_FILES.model}: a response-less failure is not classified as ambiguous`);
  }
  if (!/latestRevision === input\.baseRevision\) return 'absent'/.test(model)) {
    fail(
      `${CANONICAL_FILES.model}: an unmoved server revision is not read as "nothing was written"`,
    );
  }
  for (const [status, kind] of [
    ['HTTP_UNAUTHORIZED', 'expired'],
    ['HTTP_CONFLICT', 'conflict'],
    ['HTTP_TOO_MANY_REQUESTS', 'throttled'],
  ]) {
    if (!new RegExp(`${status}\\) return '${kind}'`).test(model)) {
      fail(`${CANONICAL_FILES.model}: ${status} is not classified as ${kind}`);
    }
  }
  // The ladder is bounded and stated, and a spent one stops.
  if (!/AUTOSAVE_RETRY_DELAYS_MS[^=]*=\s*Object\.freeze\(\[5000, 15_000\]\)/.test(model)) {
    fail(`${CANONICAL_FILES.model}: the automatic retry ladder is not the bounded [5000, 15000]`);
  }
  if (!/delay === null\)[\s\S]{0,200}ERROR_PAUSED/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: a spent retry ladder does not stop`);
  }
}

/** Two conflict choices, and the customer makes them. */
export function checkConflict(rootDir, fail) {
  const controller = code(rootDir, 'controller');
  const state = code(rootDir, 'state');
  const copy = read(rootDir, 'copy') ?? '';

  for (const action of ['loadLatest', 'keepLocal']) {
    if (!controller.includes(`const ${action} = useCallback`)) {
      fail(`${CANONICAL_FILES.controller}: the conflict has no ${action} choice`);
    }
  }
  // Exactly the two the frame authorizes. A third button is a third answer to a
  // question the design settled.
  const buttons = (state.match(/data-testid="studio-save-[a-z-]+"/g) ?? []).filter((id) =>
    ['load-latest', 'keep-local'].some((name) => id.includes(name)),
  );
  if (buttons.length !== 2) {
    fail(`${CANONICAL_FILES.state}: the conflict offers ${String(buttons.length)} choices, not 2`);
  }
  for (const label of ['Tải bản mới nhất', 'Giữ bản trên màn hình']) {
    if (!publishedValues(copy).includes(label)) {
      fail(`${CANONICAL_FILES.copy}: the approved conflict action "${label}" was rewritten`);
    }
  }
  // No merge, in any of the shapes one arrives in.
  for (const merge of ['mergeDocuments', 'threeWayMerge', 'diffElements', 'autoResolve']) {
    if (featureCode(rootDir).includes(merge)) {
      fail(`${FEATURE}: a conflict is resolved by merging (${merge})`);
    }
  }
  // Load-latest replaces the branch **and** its past; keep-local keeps both.
  if (!/loadLatest[\s\S]{0,500}adoptServerBranch\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: loading the latest keeps the stale local past`);
  }
  if (/keepLocal[\s\S]{0,400}adoptServerBranch\(/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: keeping the local branch discards its own past`);
  }
  // Keeping the local branch is a save the customer asked for, against the
  // revision the server actually holds.
  if (!/keepLocal[\s\S]{0,600}runSave\(\)/.test(controller)) {
    fail(`${CANONICAL_FILES.controller}: keeping the local branch never saves it`);
  }
}

/** The handle is a Session id, namespaced, and nothing else. */
export function checkResumeHandle(rootDir, fail) {
  const handle = code(rootDir, 'handle');

  if (!handle.includes('store.setItem(resumeHandleKey(scope), sessionId)')) {
    fail(`${CANONICAL_FILES.handle}: the handle does not store the Session id`);
  }
  for (const part of ['scope.productSlug', 'scope.sideCode', 'scope.areaCode']) {
    if (!handle.includes(part)) {
      fail(`${CANONICAL_FILES.handle}: the storage key does not carry ${part}`);
    }
  }
  // Untrusted on the way out: anything on this origin can write here, and the
  // value becomes a URL path segment on the resume request.
  if (!handle.includes('SESSION_ID_PATTERN.test(value)')) {
    fail(`${CANONICAL_FILES.handle}: a stored value is used without being validated`);
  }
  for (const forbidden of ['document', 'revision', 'expiresAt', 'secret', 'cookie']) {
    if (handle.includes(forbidden)) {
      fail(`${CANONICAL_FILES.handle}: ${forbidden} reaches browser storage`);
    }
  }
  // One module touches storage. Everything else is as forbidden as it ever was.
  const outside = outsideS10Code(rootDir);
  for (const store of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie']) {
    if (outside.includes(store)) {
      fail(`${FEATURE}: ${store} is reached outside the APP3-S10 resume handle`);
    }
  }
  const owned = s10Code(rootDir);
  for (const store of ['sessionStorage', 'indexedDB', 'document.cookie']) {
    if (owned.includes(store)) {
      fail(`${FEATURE}: ${store} is reached by the resume handle, which may keep only an id`);
    }
  }
  const holders = collect(join(rootDir, FEATURE), /\.tsx?$/).filter((path) =>
    code(rootDir, path.replaceAll('\\', '/').slice(rootDir.length + 1)).includes('localStorage'),
  );
  if (holders.length !== 1) {
    fail(`${FEATURE}: ${String(holders.length)} files touch browser storage, expected exactly 1`);
  }
}

/** A resume is offered, never taken, and expiry recovers nothing. */
export function checkResumeFlow(rootDir, fail) {
  const screen = code(rootDir, 'screen');
  const prompt = code(rootDir, 'resumePrompt');
  const controller = code(rootDir, 'controller');

  if (!/resume\.offered[\s\S]{0,200}StudioResumePrompt/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: a stored handle does not produce the approved resume state`);
  }
  for (const action of ['studio-resume-continue', 'studio-resume-restart']) {
    if (!prompt.includes(action)) {
      fail(`${CANONICAL_FILES.resumePrompt}: the resume state has no ${action}`);
    }
  }
  // Declining forgets the handle and opens nothing: the customer still chooses
  // Blank or a Template, which is the accepted `APP3-S01` flow.
  if (!/onRestart=\{resume\.forget\}/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: starting again does not forget the handle`);
  }
  if (/onRestart=\{[\s\S]{0,120}start(Blank|Clone)/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: declining a resume opens a Session by itself`);
  }
  // A dead Session is forgotten, and a transient failure is not.
  if (!/session\.isExpired[\s\S]{0,120}forgetSession\(\)/.test(screen)) {
    fail(`${CANONICAL_FILES.screen}: an expired Session keeps its resume handle`);
  }
  if (!controller.includes("enter('EXPIRED')")) {
    fail(`${CANONICAL_FILES.controller}: an invalid Session does not stop the loop`);
  }
  // Nothing extends a TTL from the browser, and nothing reads a cookie.
  for (const invented of ['expiresAt =', 'extendSession', 'renewSession', 'document.cookie']) {
    if (featureCode(rootDir).includes(invented)) {
      fail(`${FEATURE}: the client invents Session lifetime (${invented})`);
    }
  }
}

/** The topbar, the chip and the state surface, at one of each. */
export function checkSurfaces(rootDir, fail) {
  const chip = code(rootDir, 'chip');
  const state = code(rootDir, 'state');
  const stageScreen = code(rootDir, 'stageScreen');
  const all = featureCode(rootDir);

  // One topbar region, rendered by the frame rather than by a panel inside it.
  if (!code(rootDir, 'topbar').includes('studio-stage__topbar')) {
    fail(`${CANONICAL_FILES.topbar}: the one Studio topbar region is gone`);
  }
  if ((all.match(/className="studio-stage__topbar"/g) ?? []).length !== 1) {
    fail(`${FEATURE}: more than one Studio topbar is rendered`);
  }
  if (!/<StudioStageTopbar[\s>]/.test(stageScreen)) {
    fail(`${CANONICAL_FILES.stageScreen}: the topbar is not mounted by the stage frame`);
  }
  // Every state has a word, so the chip is legible without colour perception.
  if (!chip.includes('TONE_LABEL[tone]')) {
    fail(`${CANONICAL_FILES.chip}: the save state is reported by colour alone`);
  }
  // The time is rendered only from a real successful save.
  if (!/tone === 'saved' && lastSavedAt !== null/.test(chip)) {
    fail(`${CANONICAL_FILES.chip}: a saved-at time is shown without a successful save`);
  }
  for (const invented of ['Date.now()', 'new Date()']) {
    if (chip.includes(invented)) {
      fail(`${CANONICAL_FILES.chip}: the chip reads a clock of its own (${invented})`);
    }
  }
  // No backend internal reaches a customer.
  const copy = read(rootDir, 'copy') ?? '';
  for (const internal of ['409', '401', 'revision', 'sessionId', 'STALE_WRITE']) {
    if (publishedValues(copy).some((value) => value.includes(internal))) {
      fail(`${CANONICAL_FILES.copy}: a backend internal is customer-visible (${internal})`);
    }
  }
  // The decision surface is reachable: focusable, named, and focused on entry.
  for (const required of ['tabIndex={-1}', 'aria-labelledby', 'region.current?.focus()']) {
    if (!state.includes(required)) {
      fail(`${CANONICAL_FILES.state}: the decision surface is not reachable (${required})`);
    }
  }
  // Dismissing keeps the truth. Nothing marks a document saved for it.
  if (!/decision && save\.dismissed\) return null/.test(state)) {
    fail(`${CANONICAL_FILES.state}: dismissing does not minimize the blocking state`);
  }
  if (/dismiss[\s\S]{0,200}enter\('CLEAN'\)/.test(code(rootDir, 'controller'))) {
    fail(`${CANONICAL_FILES.controller}: dismissing a failure marks the design saved`);
  }
}

/** Nothing `APP3-S11` owns, and no history the customer did not make. */
export function checkNonScope(rootDir, fail) {
  const all = featureCode(rootDir);
  const store = code(rootDir, 'documentStore');

  /*
   * The mobile ban, world-aware (`APP3-S11`).
   *
   * Written as "this capability has not opened yet", which was a true statement
   * about the world until S11 opened. The half that matters is unchanged: a
   * bottom sheet or a pinch anywhere *outside* the eleven files S11 owns is
   * still a capability arriving in the wrong checkpoint, and the autosave loop,
   * the save chip and the resume handle still may not grow one.
   *
   * The two Touch Events markers stay banned everywhere, S11 included: the
   * arbitration is built on Pointer Events, and a second input model beside it
   * has its own capture rules and its own way of losing a contact.
   */
  const mobileScope = isS11Delivered(rootDir) ? preS11Code(rootDir) : all;
  for (const legacy of ['onTouchStart', 'onTouchMove']) {
    if (all.includes(legacy)) {
      fail(`${FEATURE}: a second input model beside Pointer Events (${legacy})`);
    }
  }
  for (const mobile of ['bottomSheet', 'BottomSheet', 'pinch']) {
    if (mobileScope.includes(mobile))
      fail(`${FEATURE}: an APP3-S11 mobile surface arrived early (${mobile})`);
  }
  // The server-origin seams exist, are unconditional, and are not history.
  for (const seam of ['reconcile:', 'adoptServerBranch:']) {
    if (!store.includes(seam)) {
      fail(`${CANONICAL_FILES.documentStore}: the server-origin seam ${seam} is missing`);
    }
  }
  if (!/reconcile[\s\S]{0,400}serverWrite\(state, \{ document \}\)/.test(store)) {
    fail(`${CANONICAL_FILES.documentStore}: a canonical adoption is not a server-origin write`);
  }
  if (/reconcile: \(document\) => \{[\s\S]{0,500}recordAction\(/.test(store)) {
    fail(`${CANONICAL_FILES.documentStore}: a server response is recorded as a history entry`);
  }
  // Anchored on the *implementation*, not the name: the interface declares
  // `adoptServerBranch` a few lines above the store's own initial
  // `history: EMPTY_HISTORY`, so a rule keyed on the bare identifier stays
  // green by reading two declarations that assert nothing about the seam.
  if (
    !/adoptServerBranch: \(sessionKey, document\) => \{[\s\S]{0,400}history: EMPTY_HISTORY/.test(
      store,
    )
  ) {
    fail(`${CANONICAL_FILES.documentStore}: replacing the branch keeps the past that described it`);
  }
  // No durable cache of the document or its history, under any name.
  for (const cache of ['IDBDatabase', 'caches.open', 'persist(', 'localforage']) {
    if (all.includes(cache)) fail(`${FEATURE}: a durable document cache arrived (${cache})`);
  }
  // Nothing builds an API path by hand.
  if (all.includes('/api/')) fail(`${FEATURE}: an API path is written by hand`);
  for (const raw of [/\bXMLHttpRequest\b/, /from 'axios'/]) {
    if (raw.test(all)) fail(`${FEATURE}: raw transport reached the feature (${String(raw)})`);
  }
  // The one write is addressed through the generated operation, from one file.
  const callers = collect(join(rootDir, FEATURE), /\.tsx?$/).filter((path) =>
    code(rootDir, path.replaceAll('\\', '/').slice(rootDir.length + 1)).includes(
      'publicDesignSessionAutosave(',
    ),
  );
  if (callers.length !== 1) {
    fail(`${FEATURE}: ${String(callers.length)} files call autosave, expected exactly 1`);
  }
}

/** The artifacts a frontend checkpoint must not move. */
export function checkImmutability(rootDir, fail) {
  const openapi = JSON.parse(read(rootDir, 'openapi') ?? '{}');
  const paths = Object.keys(openapi.paths ?? {}).length;
  const operations = Object.values(openapi.paths ?? {}).reduce(
    (total, item) => total + Object.keys(item ?? {}).length,
    0,
  );
  const schemas = Object.keys(openapi.components?.schemas ?? {}).length;

  if (paths !== EXPECTED_PATHS)
    fail(`openapi: ${String(paths)} paths, expected ${String(EXPECTED_PATHS)}`);
  if (operations !== EXPECTED_OPERATIONS) {
    fail(`openapi: ${String(operations)} operations, expected ${String(EXPECTED_OPERATIONS)}`);
  }
  if (schemas !== EXPECTED_SCHEMAS) {
    fail(`openapi: ${String(schemas)} schemas, expected ${String(EXPECTED_SCHEMAS)}`);
  }

  const migrations = collect(join(rootDir, MIGRATIONS), /\.sql$/).length;
  if (migrations !== EXPECTED_MIGRATIONS) {
    fail(
      `${MIGRATIONS}: ${String(migrations)} migrations, expected ${String(EXPECTED_MIGRATIONS)}`,
    );
  }
  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  if (Object.keys(manifest.scripts ?? {}).length !== ROOT_SCRIPTS) {
    fail(`package.json: root scripts moved, expected ${String(ROOT_SCRIPTS)}`);
  }
  const storefront = JSON.parse(read(rootDir, 'storefrontPackage') ?? '{}');
  for (const invented of ['idb', 'localforage', 'redux-persist', 'zustand-persist']) {
    if (Object.keys(storefront.dependencies ?? {}).includes(invented)) {
      fail(
        `${CANONICAL_FILES.storefrontPackage}: a persistence dependency was added (${invented})`,
      );
    }
  }
  // The one operation this checkpoint releases, and no other.
  const curated = read(rootDir, 'curatedClient') ?? '';
  if (!curated.includes('publicDesignSessionAutosave')) {
    fail(
      `${CANONICAL_FILES.curatedClient}: the autosave operation is not exported to its consumer`,
    );
  }
  if (curated.split('\n').some((line) => line.trim().startsWith('publicProductMediaGet'))) {
    fail(`${CANONICAL_FILES.curatedClient}: an operation with no consumer crossed the boundary`);
  }
}

/** Sizes, and the scoped commands this checkpoint is run by. */
export function checkFileSizes(rootDir, fail) {
  for (const path of collect(join(rootDir, FEATURE), /\.tsx?$/)) {
    const lines = read(rootDir, path.replaceAll('\\', '/').slice(rootDir.length + 1))?.split(
      '\n',
    ).length;
    if (lines !== undefined && lines > SOURCE_LIMIT) {
      fail(`${path}: ${String(lines)} lines, over the ${String(SOURCE_LIMIT)}-line source maximum`);
    }
  }
  for (const path of collect(join(rootDir, 'apps/storefront/test'), /\.tsx?$/)) {
    const lines = read(rootDir, path.replaceAll('\\', '/').slice(rootDir.length + 1))?.split(
      '\n',
    ).length;
    if (lines !== undefined && lines > TEST_LIMIT) {
      fail(`${path}: ${String(lines)} lines, over the ${String(TEST_LIMIT)}-line test maximum`);
    }
  }
}

export function checkCommandIndex(rootDir, fail) {
  const index = read(rootDir, 'index') ?? '';
  for (const command of [
    'CMD-CHECK-APP3-S10',
    'CMD-TEST-APP3-S10',
    'CMD-TEST-APP3-S10-STOREFRONT',
    'CMD-BROWSER-APP3-S10',
  ]) {
    if (!index.includes(command)) {
      fail(`${CANONICAL_FILES.index}: ${command} is not registered`);
    }
  }
  const manifest = JSON.parse(read(rootDir, 'rootPackage') ?? '{}');
  if (Object.keys(manifest.scripts ?? {}).some((name) => name.includes('app3-s10'))) {
    fail('package.json: a checkpoint command was added as a root script');
  }
}
