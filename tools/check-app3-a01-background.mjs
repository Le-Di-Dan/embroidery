/**
 * `APP3-A01-C1` — the authorized Side background in the placement preview.
 *
 * Split out of `check-app3-a01.mjs` by responsibility, and because that file
 * crossed the 400-line source limit when the correction landed. This stays a
 * *rule set*, not a second gate: `check-app3-a01.mjs` imports and runs it, so
 * there is still exactly one A01 command and one A01 verdict — the split moved
 * code, not the entry point. It is the same shape `check-app3-b02.mjs` and its
 * `-contract` companion already use.
 *
 * Mode-aware on the correction, and asserted in **both** directions. Before C1
 * the blocker is open and none of this code exists; after it, the blocker is
 * closed and every rule binds. A gate that only knew the post-C1 world would
 * pass on a tree that had silently reverted the fix, and one that only knew the
 * pre-C1 world would refuse the correction itself.
 */

/**
 * @param {object} input Sources already read and comment-stripped by the caller.
 * @returns {{ label: string, ok: boolean, detail: string }[]}
 */
export function checkA01BackgroundPreview(input) {
  const {
    plan,
    curated,
    backgroundService,
    backgroundHook,
    preview,
    screen,
    featureSources,
    hasBackgroundSources,
  } = input;

  const found = [];
  const record = (label, ok, detail = '') => found.push({ label, ok, detail });

  const correctionDelivered = /\nAPP3-A01-C1 = COMPLETE/.test(plan);

  if (!correctionDelivered) {
    record(
      'C1: the background-preview blocker is still recorded open',
      /A01_REVIEW_BLOCKER = ADMIN_SIDE_BACKGROUND_PREVIEW_UNAVAILABLE/.test(plan),
      'neither the blocker nor its correction is recorded',
    );
    record(
      'C1: no background code exists before the correction',
      !hasBackgroundSources,
      'background delivery code exists but APP3-A01-C1 is not recorded',
    );
    return found;
  }

  record(
    'C1: APP3-B02A is accepted',
    /\nAPP3-B02A = COMPLETE — REVIEW_ACCEPTED/.test(plan),
    'the delivery this correction consumes is not recorded accepted',
  );
  record(
    'C1: the A01 background-preview blocker is closed',
    /A01_CORRECTION_BLOCKER = CLOSED_BY_APP3-A01-C1/.test(plan),
    'the blocker this correction exists to close is still open',
  );

  // The curated boundary is handwritten; the generated tree is untouched.
  record(
    'C1: the curated client exports the delivery operation',
    /export \{ adminProductSideBackgroundGet \} from '\.\/generated\/embroidery-api';/.test(
      curated,
    ),
    'adminProductSideBackgroundGet is not on the curated boundary',
  );
  record(
    'C1: the public delivery route stays withheld',
    !/export \{[^}]*publicProductSideBackgroundGet/.test(curated),
    'the public side-background route was exposed',
  );

  // Consumed in exactly one module, and that module is a service — never a
  // component, which is where a raw URL would eventually appear.
  const consumers = featureSources.filter((file) =>
    file.text.includes('adminProductSideBackgroundGet'),
  );
  record(
    'C1: the operation is consumed in exactly one service',
    consumers.length === 1 && /services[\\/]side-background\.service\.ts$/.test(consumers[0].path),
    `${String(consumers.length)} module(s) consume it`,
  );
  record(
    'C1: the service asks for a Blob and builds no address',
    backgroundService.includes('adminProductSideBackgroundGet') &&
      !/https?:\/\//.test(backgroundService),
    'the background service constructs an address',
  );

  // The object URL is a browser resource. A handle that is created and never
  // revoked pins protected media in memory for the life of the tab, and nothing
  // in the DOM would ever reveal the leak.
  record(
    'C1: the hook creates an object URL',
    /URL\.createObjectURL\(/.test(backgroundHook),
    'no object URL is created',
  );
  record(
    'C1: the hook revokes the object URL',
    /URL\.revokeObjectURL\(/.test(backgroundHook),
    'the object URL is never revoked',
  );
  record(
    'C1: revocation is an effect cleanup, so it runs on switch and unmount alike',
    /return \(\) => \{[\s\S]{0,200}URL\.revokeObjectURL\(/.test(backgroundHook),
    'revocation is not wired to the effect cleanup',
  );
  record(
    'C1: the background query is not retained after it stops being observed',
    /gcTime: 0/.test(backgroundHook),
    'protected media is cached beyond its observers',
  );
  record(
    'C1: no placeholderData can carry the previous Side image across a switch',
    !/placeholderData/.test(backgroundHook),
    'the query keeps previous data across a key change',
  );

  // The background is a layer in the same SVG coordinate space, not a DOM image
  // positioned by CSS — the geometry authority is unchanged.
  record(
    'C1: the background is an SVG image in the Side pixel space',
    /<image\b/.test(preview) &&
      /width=\{canvasWidth\}/.test(preview) &&
      /height=\{canvasHeight\}/.test(preview),
    'the background is not drawn in the canvas coordinate space',
  );
  record(
    'C1: the preview introduces no DOM image or CSS positional geometry',
    !/<img\b/.test(preview) && !/style=\{/.test(preview) && !/--placement-/.test(preview),
    'the preview regressed to DOM/CSS positioning',
  );
  record(
    'C1: the artwork is not an interactive control',
    /aria-hidden="true"[\s\S]{0,120}data-testid="placement-preview-background"/.test(preview) ||
      /data-testid="placement-preview-background"[\s\S]{0,120}aria-hidden="true"/.test(preview),
    'the background image is exposed to assistive technology as a control',
  );

  // The fetch is gated on the draft still naming what the server persisted, so
  // an unsaved replacement is never represented by the bytes it replaces.
  record(
    'C1: the fetch is gated on the persisted association',
    /backgroundMatchesServer\(/.test(screen),
    'the preview fetches without checking the persisted association',
  );
  record(
    'C1: mobile mounts no editor, so it fetches no background',
    /viewport === 'mobile'[\s\S]{0,400}PlacementMobileNotice/.test(screen) &&
      !backgroundHook.includes('matchMedia'),
    'the mobile branch can reach the background fetch',
  );

  // No asset-keyed bypass, and no storage identity anywhere in the feature.
  for (const file of featureSources) {
    record(
      `C1: ${file.where} builds no asset-keyed delivery address`,
      !/assets\/\$\{/.test(file.text) && !/\/assets\/[a-z{]/.test(file.text),
      'an asset-by-id delivery address was constructed',
    );
  }

  return found;
}
