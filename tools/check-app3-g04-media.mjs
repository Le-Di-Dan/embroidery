/**
 * `APP3-G04` — profile, delivery, limit, font and watermark authority (IMP-D044).
 *
 * The responsibility this file owns is *what may become editor media and how it
 * may be delivered*; `check-app3-g04.mjs` owns the derivative-kind, dimension and
 * database-contribution half. They are split because a single gate covering both
 * would exceed the repository's source limit and, more usefully, because these
 * two halves fail for different reasons: this one drifts when prose is softened,
 * the other when the schema moves underneath it.
 *
 * Every check here is an assertion about *bounded canonical text* — the §6.7.2
 * rulings block and the security document — never about the whole file, so a
 * sentence written somewhere else can neither satisfy nor break it.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */

/** Facts this module owns, recomputed from the §6.7.1 bounded table. */
export const MEDIA_FACTS = Object.freeze({
  'Processing profiles': 'SIDE_BACKGROUND TEMPLATE_ASSET SESSION_UPLOAD',
  'Processing profile persistence': 'APPLICATION_POLICY_NOT_DB_ENUM',
  'Processing profile column': 'NONE',
  'Side background source lane': 'CATALOG_MEDIA',
  'Side background association': 'product_sides.background_asset_id',
  'Side background accepted sources': 'JPEG PNG WEBP',
  'Side background svg': 'REJECTED',
  'Side background delivery checkpoint': 'APP3-B02',
  'Side background delivery context': 'PUBLISHED_PRODUCT_AND_ACTIVE_SIDE',
  'Template asset actor': 'ADMIN',
  'Template asset source lane': 'TEMPLATE_SOURCE',
  'Template asset accepted sources': 'JPEG PNG WEBP SVG',
  'Template asset svg sanitization': 'MANDATORY_SERVER_SIDE',
  'Template asset svg original to studio': 'NEVER',
  'Template publication requires eligible derivative': 'YES',
  'Session upload actor': 'ANONYMOUS_SESSION_CREDENTIAL',
  'Session upload source lane': 'CUSTOMER_UPLOAD_CUSTOMER_PRIVATE',
  'Session upload accepted sources': 'JPEG PNG WEBP',
  'Session upload svg': 'REJECTED_IN_APP3',
  'Session upload visibility': 'PRIVATE_SESSION_OWNED',
  'Session upload reuse as shared media': 'FORBIDDEN',
  'Delivery classes': '3',
  'Generic public asset endpoint': 'NONE',
  'Storage key in api response': 'FORBIDDEN',
  'Object storage url as document authority': 'FORBIDDEN',
  'Session private delivery cache': 'PRIVATE_NO_STORE',
  'Session private delivery credential': 'REQUIRED_EVERY_REQUEST',
  'Staff auth for storefront delivery': 'FORBIDDEN',
  'secure_access_grants change in APP3': 'NONE',
  'Contextual reference grants sibling derivative': 'NO',
  'Document limit enforcement': 'SERVER_SIDE',
  'Document client side checks': 'EARLY_FEEDBACK_ONLY',
  'Document partial save on rejection': 'NONE',
  'Hidden locked offcanvas elements count': 'YES',
  'Repeated asset reference counting': 'ONCE_FOR_ASSET_BUDGETS_EACH_FOR_ELEMENTS',
  'Runtime overlay elements count': 'NO',
  'Silent limit increase': 'FORBIDDEN',
  'Compressed size overrides decoded limit': 'NO',
  'Document font reference': 'fontId',
  'Font registry owner': 'SERVER_VERSIONED_REGISTRY',
  'Font registry delivery checkpoint': 'APP3-P01',
  'Remote runtime font url': 'FORBIDDEN',
  'User uploaded font': 'FORBIDDEN',
  'Template embedded font bytes': 'FORBIDDEN',
  'Unknown fontId': 'VALIDATION_FAILURE',
  'Font asset budget consumption': 'NONE',
  'Missing font substitution': 'NEVER_SILENT_GEOMETRY_CHANGE',
  'Watermark in editor-safe bytes': 'NEVER',
  'Watermark serialization': 'NEVER',
  'Export or download surface': 'NONE',
});

/**
 * The exact locked numbers, as facts.
 *
 * They are kept apart from the prose facts because a limit is the one thing a
 * later checkpoint can weaken without writing a sentence anybody would notice:
 * 4096 becomes 8192 in one character and every adjective around it stays true.
 */
export const LIMIT_FACTS = Object.freeze({
  'Raster upload max bytes': '10485760',
  'Raster max width px': '4096',
  'Raster max height px': '4096',
  'Raster max decoded pixels': '16777216',
  'Admin svg max bytes': '1048576',
  'Sanitized svg max nodes': '10000',
  'Sanitized svg max path characters': '1000000',
  'Document max serialized bytes': '524288',
  'Document max elements': '100',
  'Document max image elements': '20',
  'Document max text elements': '80',
  'Document max unique assets': '20',
  'Document max group depth': '8',
  'Document max characters per text element': '500',
  'Document max total text characters': '5000',
  'Document max decoded pixels': '33554432',
});

/**
 * The numbers as the rulings must *also* state them in words.
 *
 * A fact table alone is too easy to keep green while the prose beside it drifts,
 * so each limit has to survive in the canonical section in its human form too.
 */
const REQUIRED_LIMIT_CLAIMS = Object.freeze([
  ['the 10 MiB raster upload ceiling', /10 MiB/],
  ['the 4096 px intrinsic bound', /4096 px/],
  ['the 16,777,216 decoded-pixel bound per asset', /16,777,216/],
  ['the 1 MiB Admin SVG source ceiling', /1 MiB/],
  ['the 10,000 sanitized SVG node ceiling', /10,000/],
  ['the 1,000,000 SVG path-character ceiling', /1,000,000/],
  ['the 512 KiB canonical document ceiling', /512 KiB/],
  ['the 33,554,432 document decoded-pixel ceiling', /33,554,432/],
  ['the 5,000 total text-character ceiling', /5,000/],
]);

/** Named claims the §6.7.2 rulings have to carry in their own words. */
const REQUIRED_RULING_CLAIMS = Object.freeze([
  [
    'the three processing profiles',
    /SIDE_BACKGROUND[\s\S]{0,80}TEMPLATE_ASSET[\s\S]{0,80}SESSION_UPLOAD/,
  ],
  [
    'profiles are not database kinds',
    /not\*{0,2} database derivative kinds|processing-policy identifiers/i,
  ],
  ['SVG is rejected for the side background', /SVG rejected/i],
  [
    'Template SVG requires server-side sanitization',
    /mandatory\*{0,2}\s*\n?\s*server-side sanitization/i,
  ],
  [
    'the sanitizer strips script and event handlers',
    /`script`[\s\S]{0,60}event-handler attributes/i,
  ],
  ['the sanitizer strips foreignObject', /foreignObject/],
  ['the sanitizer strips javascript/data/blob URLs', /`data:`\/`blob:`\/`javascript:` URLs/],
  ['the sanitized derivative is self-contained', /self-contained/i],
  [
    'the original SVG never reaches the Studio',
    /original SVG is \*{0,2}never\*{0,2} sent to the Studio/i,
  ],
  ['anonymous SVG intake is rejected', /SVG is rejected in\s*\n?\s*APP3|no anonymous SVG intake/i],
  ['the Session upload is privately owned', /owned by exactly one\s*\n?\s*active Design Session/i],
  [
    'a Session upload is never promoted to shared media',
    /never\s*\n?\s*survives by being silently promoted to shared authority/i,
  ],
  ['no generic public asset endpoint', /no\*{0,2} generic `GET \/assets\/:id` public/i],
  ['no storage key in a response', /object-storage key or a private original\s*\n?\s*URL/i],
  ['session-private delivery is private, no-store', /`private, no-store`/],
  [
    'staff auth is never used for storefront delivery',
    /staff auth is never used for Storefront delivery/i,
  ],
  [
    'a reference is not sibling-derivative access',
    /not\*{0,2} permission to access another derivative/i,
  ],
  ['a document stores a fontId', /store a `fontId`/],
  ['the font registry is server-owned and versioned', /versioned\*{0,2}\s*\n?\s*font registry/i],
  ['no user-uploaded font', /no user-uploaded font/i],
  ['an unknown fontId fails validation', /unknown `fontId` fails validation/i],
  ['a missing font never silently substitutes', /never falls back\s*\n?\s*silently/i],
  [
    'the watermark is never in the derivative bytes',
    /\*{0,2}never\*{0,2} contains the\s*\n?\s*APP3 watermark/i,
  ],
  ['the watermark is not serialized', /not serialized/i],
  ['no export or download surface', /no export or download surface is created/i],
  ['rejected documents are not partly saved', /not partially saved/i],
  [
    'hidden and locked elements still count',
    /Hidden, locked and off-canvas elements\s*\n?\s*still count/i,
  ],
  ['limits may not be raised silently', /silently raise these values/i],
]);

/**
 * Verifies the profile, delivery, limit, font and watermark authority.
 *
 * @param {{rulings: string, facts: Map<string, string>, security: string, files: Record<string, string>, fail: (m: string) => void}} input
 */
export function checkMediaAuthority({ rulings, facts, security, files, fail }) {
  for (const [key, expected] of Object.entries({ ...MEDIA_FACTS, ...LIMIT_FACTS })) {
    const actual = facts.get(key);
    if (actual === undefined) {
      fail(`${files.phase}: machine-checked media fact \`${key}\` is missing`);
    } else if (actual !== expected) {
      fail(`${files.phase}: \`${key}\` is "${actual}", expected "${expected}"`);
    }
  }
  for (const [claim, pattern] of [...REQUIRED_RULING_CLAIMS, ...REQUIRED_LIMIT_CLAIMS]) {
    if (!pattern.test(rulings)) {
      fail(`${files.phase}: §6.7.2 no longer states ${claim}`);
    }
  }
  checkSecurityDocument(security, files.security, fail);
}

/**
 * The security document carries the same intake and delivery boundary.
 *
 * A boundary stated in exactly one document is a boundary that drifts: the phase
 * plan is where a checkpoint reads its authority, and `09` is where a reviewer
 * looks for the abuse rule. Both have to say it.
 */
function checkSecurityDocument(security, path, fail) {
  for (const [label, pattern] of [
    ['the anonymous SVG rejection', /no anonymous SVG intake/i],
    ['mandatory Admin SVG sanitization', /sanitiz/i],
    ['the 10 MiB raster upload ceiling', /10 MiB/],
    ['the decoded-pixel ceiling', /16,777,216/],
    ['the document element ceiling', /100 elements|100 total elements/i],
    ['the document decoded-pixel ceiling', /33,554,432/],
    [
      'the absence of a generic public asset endpoint',
      /generic public [Aa]sset endpoint|`GET \/assets\/:id`/,
    ],
  ]) {
    if (!pattern.test(security)) {
      fail(`${path}: §7 no longer records ${label}`);
    }
  }
}
