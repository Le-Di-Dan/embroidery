/**
 * `APP4-G01` — the authority data the gate reconciles against (IMP-D049).
 *
 * Split from `check-app4-g01.mjs` by responsibility: this file is **what the
 * authority says**, that one is **what the repository must therefore look
 * like**. Keeping them apart means a value change is a one-line diff in a table
 * rather than an edit inside assertion logic, which is the difference between a
 * reviewable policy change and an invisible one.
 *
 * Read-only. No network, no database. Cross-platform pure Node.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DECISION_ID = 'IMP-D049';

export const CANONICAL_FILES = Object.freeze({
  adr: 'docs/adr/backend/ADR-APP4-001-SECURE-ACCESS-VERIFICATION-AND-NOTIFICATION-AUTHORITY.md',
  register: 'docs/implementation/14-IMPLEMENTATION-DECISION-REGISTER.md',
  roadmap: 'docs/implementation/10-MASTER-APPLICATION-ROADMAP.md',
  audit: 'docs/implementation/audits/APP4_PHASE_ENTRY_AUDIT.md',
  commandIndex: 'docs/implementation/SCOPED_COMMAND_INDEX.md',
  seed: 'packages/database/seed/app4-policy-configuration.seed.json',
  envExample: '.env.example',
  outboxStore: 'packages/persistence/src/platform/outbox-event-store.ts',
  rootManifest: 'package.json',
  apiManifest: 'apps/api/package.json',
  workerManifest: 'apps/worker/package.json',
});

/** The twelve rulings the decision row must record by id. */
export const RULINGS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `PO-${String(index + 1).padStart(2, '0')}`),
);

export const ROOT_SCRIPT_COUNT = 30;
export const MIGRATION_COUNT = 34;

export const ENVELOPE_KEY_NAME = 'NOTIFICATION_DELIVERY_ENVELOPE_KEY';
export const HASH_PEPPER_NAMES = Object.freeze([
  'VERIFICATION_CODE_SECRET_PEPPER',
  'SECURE_LINK_TOKEN_SECRET_PEPPER',
]);

export const APP4_ROUTES = Object.freeze([
  '/xac-minh-lien-he',
  '/truy-cap',
  '/support/customer-access',
]);

/**
 * The four policy keys and the value each field must carry.
 *
 * Checked against **two** sources on purpose: the seed dataset is what a
 * database ends up holding, the ADR fact table is what a human reads. One
 * source would make a drift between them undetectable, which is exactly the
 * drift that matters.
 */
export const POLICY = Object.freeze({
  'verification.challenge': {
    ttlSeconds: 600,
    codeLength: 6,
    codeAlphabet: 'DECIMAL_DIGITS',
    maxAttempts: 5,
    resendCooldownSeconds: 60,
    rateWindowSeconds: 900,
    maxIssuesPerTargetPerWindow: 5,
  },
  secure_grant: { standardTtlSeconds: 604800, stepUpWindowSeconds: 900 },
  'notification.delivery': { maxAttempts: 3, retryDelaysSeconds: [60, 300] },
  'secure_link.resolve': { maxRequestsPerIpPerMinute: 30 },
});

/** Non-policy facts the ADR §14.1 table must state exactly. */
export const EXPECTED_FACTS = Object.freeze({
  'verification.code.generation': 'CSPRNG_UNBIASED',
  'verification.code.digest': 'PEPPERED_HMAC_SHA256',
  'verification.code.comparison': 'CONSTANT_TIME',
  'verification.rateRefusal.disclosesCustomerExistence': 'NO',
  'secure_grant.reissue.rotatesToken': 'YES',
  'notification.delivery.exhaustedOutboxStatus': 'DEAD_LETTER',
  'contact.email.normalization': 'TRIM_THEN_LOWERCASE_WHOLE_ADDRESS',
  'contact.email.providerSpecificRules': 'NONE',
  'contact.email.dotsRemoved': 'NO',
  'contact.email.plusTagStripped': 'NO',
  'contact.phone.normalization': 'E164',
  'contact.phone.defaultRegion': 'VN',
  'contact.phone.defaultCountryCode': '+84',
  'contact.email.mask': 'FIRST_CODE_POINT_THEN_STARS_AT_DOMAIN',
  'contact.phone.mask': 'COUNTRY_CODE_PLUS_LAST_4_DIGITS',
  'contact.mask.storesNormalizedDestination': 'NO',
  'secure_link.unavailable.status': '404',
  'secure_link.unavailable.code': 'SECURE_LINK_UNAVAILABLE',
  'secure_link.unavailable.indistinguishableCauses': '6',
  'route.storefront.verification': '/xac-minh-lien-he',
  'route.storefront.secureLinkLanding': '/truy-cap',
  'route.admin.customerAccessSupport': '/support/customer-access',
  'secure_link.token.entropyBits': '256',
  'secure_link.token.encoding': 'BASE64URL_UNPADDED',
  'secure_link.token.digest': 'PEPPERED_HMAC_SHA256',
  'pepper.verification.configName': HASH_PEPPER_NAMES[0],
  'pepper.secureLink.configName': HASH_PEPPER_NAMES[1],
  'pepper.reusesEnvelopeKey': 'NO',
  'envelope.package': '@embroidery/notification-delivery',
  'envelope.packagePath': 'packages/notification-delivery',
  'envelope.createdBy': 'APP4-B01',
  'envelope.version': '1',
  'envelope.algorithm': 'AES-256-GCM',
  'envelope.cryptoSource': 'node:crypto',
  'envelope.thirdPartyCryptoDependency': 'NONE',
  'envelope.ivBits': '96',
  'envelope.ivReused': 'NO',
  'envelope.binaryEncoding': 'BASE64URL',
  'envelope.key.configName': ENVELOPE_KEY_NAME,
  'envelope.key.encoding': 'BASE64',
  'envelope.key.decodedBytes': '32',
  'envelope.key.fallback': 'NONE',
  'envelope.key.whenAbsent': 'FAIL_CLOSED',
  'envelope.key.separateFromHashPeppers': 'YES',
  'envelope.persistedColumn': 'outbox_events.payload',
  'envelope.forbiddenColumn': 'notification_intents.params',
  'envelope.secretKinds': 'VERIFICATION_CODE, SECURE_LINK_TOKEN',
  'envelope.authFailure': 'TERMINAL_FOR_THAT_ATTEMPT',
  'envelope.originNotificationIntentId.role': 'LINEAGE_ONLY',
  'outbox.aggregateKind': 'NOTIFICATION_INTENT',
  'outbox.aggregateId': 'current notification_intent.id',
  'outbox.currentIntentIdentity': 'AGGREGATE_LINKAGE',
  'outbox.linkage.migration': 'NONE',
  'outbox.linkage.ciphertextQueried': 'NO',
  'delivery.automaticRetry.owner': 'APP4-W01',
  'delivery.automaticRetry.outboxEvent': 'SAME',
  'delivery.automaticRetry.envelope': 'SAME',
  'delivery.automaticRetry.secret': 'SAME',
  'delivery.manualReplay.owner': 'APP4-B08',
  'delivery.manualReplay.originIntent': 'REMAINS_FAILED_TERMINAL',
  'delivery.manualReplay.originOutboxEvent': 'REMAINS_DEAD_LETTER_TERMINAL',
  'delivery.manualReplay.newIntentStatus': 'PENDING',
  'delivery.manualReplay.newOutboxEventStatus': 'PENDING',
  'delivery.manualReplay.ciphertext': 'BYTE_IDENTICAL',
  'delivery.manualReplay.apiDecrypts': 'NEVER',
  'delivery.manualReplay.intentKeyDigest': 'SHA-256_HEX',
  'delivery.manualReplay.intentKeyInput':
    'app4-manual-replay:v1:<originNotificationIntentId>:<deadLetterOutboxEventId>',
  'delivery.manualReplay.newIdempotencyFramework': 'NONE',
  'delivery.manualReplay.refusalStatus': '409',
  'delivery.manualReplay.refusalCode': 'REISSUE_REQUIRED',
  'delivery.manualReplay.reconstructsPlaintext': 'NEVER',
  'delivery.businessResend.owner': 'APP4-B03, APP4-B05',
  'delivery.businessResend.secret': 'NEW',
  'delivery.businessResend.envelope': 'NEW',
  'secure_link.transport': 'URL_FRAGMENT',
  'secure_link.fragmentParameter': '#t=',
  'secure_link.landingUrlForm': 'https://<storefront-origin>/truy-cap#t=<opaque-token>',
  'secure_link.queryOrPathCarrier': 'FORBIDDEN',
  'secure_link.fragmentStripApi': 'history.replaceState',
  'secure_link.fragmentStripOrdering': 'BEFORE_ANY_ANALYTICS_OR_THIRD_PARTY',
  'secure_link.resolveOperation': 'POST /public/secure-links/resolve',
  'secure_link.tokenClientStorage': 'NONE',
  'notification.channel.emailContact': 'EMAIL',
  'notification.channel.phoneContact': 'SMS',
  'notification.provider': 'NONE_SELECTED',
  'notification.deliveryBoundary': 'NotificationChannelPort',
  'notification.devAdapter': 'RECORDING',
  'queue.authority': 'APP2_OUTBOX_RUNTIME',
  'queue.notificationIntentClaimBatch': 'NO_PRODUCTION_CALLER',
  'queue.additionalQueue': 'NONE',
  'app4.migration': 'NO_APP4_MIGRATION',
});

/** Dependencies whose presence would silently pick a provider or a crypto library. */
export const FORBIDDEN_PACKAGES = Object.freeze([
  'nodemailer',
  '@sendgrid/mail',
  'twilio',
  'postmark',
  'mailgun.js',
  'resend',
  '@aws-sdk/client-ses',
  '@aws-sdk/client-sns',
  'node-forge',
  'tweetnacl',
  'libsodium-wrappers',
  'jose',
  'crypto-js',
]);

export function read(rootDir, key) {
  const path = join(rootDir, CANONICAL_FILES[key] ?? key);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

/** The body of one heading, up to the next heading of any depth. */
export function sectionBody(text, heading) {
  const start = text.indexOf(heading);
  if (start < 0) return '';
  const rest = text.slice(start + heading.length);
  const end = rest.search(/\n#{2,4} /);
  return end < 0 ? rest : rest.slice(0, end);
}

/** `| \`Key\` | \`Value\` |` rows of the ADR §14.1 fact table, as a map. */
export function factTable(adrText) {
  return new Map(
    sectionBody(adrText, '### 14.1 ')
      .split('\n')
      .map((line) => /^\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*$/.exec(line.trim()))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
}

/** The `§14.1` form of a policy value, so one table can hold both kinds. */
export function policyFactValue(value) {
  return Array.isArray(value) ? `[${value.join(', ')}]` : String(value);
}

/**
 * Literal secret material in an APP4 authority document.
 *
 * The realistic leak here is not a labelled key — it is an *illustrative* one: a
 * worked example of a 32-byte key or a specimen six-digit code that a reader
 * later pastes into an environment. So this looks for value **shapes**, and is
 * careful about the two shapes these documents legitimately contain.
 *
 * A path, a decision id and a camelCase field name all survive `[A-Za-z0-9…]`
 * runs, so the test is applied per **separator-free segment**: real key material
 * is one unbroken ≥24-character blob mixing case and digits, and nothing an
 * identifier or a file path produces looks like that.
 */
export function findLiteralSecrets(text) {
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (/code/i.test(line) && /(^|[`'"\s=:])\d{6}([`'"\s.,]|$)/.test(line)) {
      findings.push({ line: index + 1, kind: 'six-digit code literal' });
    }
    for (const segment of line.split(/[^A-Za-z0-9+=]+/)) {
      if (segment.length < 24) continue;
      if (!/[a-z]/.test(segment) || !/[A-Z]/.test(segment) || !/\d/.test(segment)) continue;
      findings.push({ line: index + 1, kind: 'base64-shaped literal' });
    }
  });
  return findings;
}
