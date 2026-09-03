/**
 * The release configuration contract (`APP12-H02` §18).
 *
 * Names and shapes only. **No rule in this file may print a configured value**,
 * and none does: every failure message names the key that is wrong and what
 * shape was expected. That is not a stylistic rule — a preflight that echoed
 * `DATABASE_URL` to explain why it was malformed would put a production
 * password in a deployment log, which is the one place it is hardest to recall.
 *
 * The contract is derived from the actual consumers, not from a remembered
 * list: each entry names the module that reads the variable, so a rule that
 * outlives its consumer is visibly stale rather than quietly wrong.
 */

/** An absolute origin: scheme + host (+ port), nothing else. */
function isCanonicalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'https:' || url.protocol === 'http:') &&
    url.hostname !== '' &&
    url.username === '' &&
    url.password === '' &&
    url.search === '' &&
    !value.includes('#') &&
    (url.pathname === '/' || url.pathname === '') &&
    !value.endsWith('/')
  );
}

/** A comma-separated list of canonical origins, each individually valid. */
function isOriginList(value) {
  return value.split(',').every((entry) => isCanonicalOrigin(entry.trim()));
}

/** An absolute http(s) URL, with or without a path. */
function isAbsoluteHttpUrl(value) {
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * The public contact URLs (`FU-APP10-I01-02`). Optional and independent: an
 * unset value simply omits that one CTA and the delivered dock stays
 * fail-closed. So the rule is "empty, or a well-formed absolute http(s) URL" —
 * never "present". Demanding a value would turn a deliberate absence into a
 * failed deploy.
 */
function isOptionalContactUrl(value) {
  if (value === undefined || value.trim() === '') {
    return true;
  }
  if (!isAbsoluteHttpUrl(value)) {
    return false;
  }
  const url = new URL(value);
  return url.username === '' && url.password === '';
}

const CONFIG_RULES = [
  {
    key: 'STOREFRONT_PUBLIC_ORIGIN',
    consumer: 'apps/storefront config/public-origin.ts + apps/worker secure-link composition',
    required: true,
    shape:
      'an absolute origin — scheme + host (+ port), no path, query, fragment, credentials or trailing slash',
    accepts: isCanonicalOrigin,
    // A production deployment resolving to a loopback address publishes
    // canonical tags and mints customer secure links pointing at a host only
    // the pod itself can reach. There is no case in which that is correct.
    rejectLoopbackInProduction: true,
  },
  {
    key: 'STAFF_ALLOWED_ORIGINS',
    consumer: 'apps/api StaffOriginGuard (ADR-APP1-001 §6)',
    required: true,
    shape: 'a comma-separated list of absolute origins',
    accepts: isOriginList,
    rejectLoopbackInProduction: true,
  },
  {
    key: 'DESIGN_SESSION_ALLOWED_ORIGINS',
    consumer: 'apps/api design-session origin policy (IMP-D043 PO-05)',
    required: true,
    shape: 'a comma-separated list of absolute origins',
    accepts: isOriginList,
    rejectLoopbackInProduction: true,
  },
  {
    key: 'INTERNAL_API_BASE_URL',
    consumer: 'apps/storefront + apps/admin server-side API clients',
    required: true,
    shape: 'an absolute http(s) URL',
    accepts: isAbsoluteHttpUrl,
  },
  {
    key: 'OBJECT_STORAGE_ENDPOINT',
    consumer: 'packages/object-storage bucket bootstrap (APP2-I03)',
    required: true,
    shape: 'an absolute http(s) URL',
    accepts: isAbsoluteHttpUrl,
  },
  {
    key: 'OBJECT_STORAGE_ORIGINALS_BUCKET',
    consumer: 'packages/object-storage',
    required: true,
    shape: 'a non-empty bucket name',
    accepts: (value) => value.trim() !== '',
  },
  {
    key: 'OBJECT_STORAGE_DERIVATIVES_BUCKET',
    consumer: 'packages/object-storage',
    required: true,
    shape: 'a non-empty bucket name',
    accepts: (value) => value.trim() !== '',
  },
  {
    key: 'CUSTOM_EMBROIDERY_RELEASE_ENABLED',
    consumer: 'apps/api operation gate + apps/storefront route gate (APP12-G02)',
    required: true,
    // Stated explicitly, never inherited. The runtime is fail-closed when the
    // variable is absent, but a deployment that does not say which wave it is
    // releasing is a deployment nobody can review (§12).
    shape: 'exactly "true" or "false" — the gate accepts no other spelling',
    accepts: (value) => value === 'true' || value === 'false',
  },
  {
    key: 'PAYMENT_MERCHANT_BANK_BIN',
    consumer: 'apps/api MERCHANT_BANK_CONFIG (APP7-G01 §3)',
    required: true,
    shape: 'exactly six digits — a NAPAS acquirer id',
    accepts: (value) => /^\d{6}$/.test(value),
  },
  {
    key: 'PAYMENT_MERCHANT_ACCOUNT_NUMBER',
    consumer: 'apps/api MERCHANT_BANK_CONFIG',
    required: true,
    shape: '6 to 19 digits',
    accepts: (value) => /^\d{6,19}$/.test(value),
  },
  {
    key: 'PAYMENT_MERCHANT_ACCOUNT_NAME',
    consumer: 'apps/api MERCHANT_BANK_CONFIG',
    required: true,
    shape: 'a non-empty account holder name',
    accepts: (value) => value.trim() !== '',
  },
  {
    key: 'PAYMENT_MERCHANT_BANK_DISPLAY_NAME',
    consumer: 'apps/api MERCHANT_BANK_CONFIG',
    required: true,
    shape: 'a non-empty bank display name',
    accepts: (value) => value.trim() !== '',
  },
  {
    key: 'STAFF_SESSION_COOKIE_SECURE',
    consumer: 'apps/api staff session cookie (ADR-APP1-001)',
    required: true,
    shape:
      'true or false — must be true where the edge terminates TLS, because the __Host- prefix requires Secure',
    accepts: (value) => value === 'true' || value === 'false',
    productionMustEqual: 'true',
  },
  {
    key: 'DESIGN_SESSION_COOKIE_SECURE',
    consumer: 'apps/api design-session cookie',
    required: true,
    shape: 'true or false — must be true where the edge terminates TLS',
    accepts: (value) => value === 'true' || value === 'false',
    productionMustEqual: 'true',
  },
  {
    key: 'DATABASE_SSL_MODE',
    consumer: 'packages/database config validation',
    required: true,
    shape: 'a non-empty sslmode; never disable in production',
    accepts: (value) => value.trim() !== '',
    productionMustNotEqual: 'disable',
  },
  {
    key: 'API_DOCS_ENABLED',
    consumer: 'apps/api Swagger UI exposure (APP0-B01)',
    required: true,
    // Unauthenticated by construction. Never on in production.
    shape: 'true or false — must be false in production, the Swagger UI is unauthenticated',
    accepts: (value) => value === 'true' || value === 'false',
    productionMustEqual: 'false',
  },
  {
    key: 'NEXT_PUBLIC_ZALO_CONTACT_URL',
    consumer: 'apps/storefront storefront-shell contact handoff (APP10-I01)',
    required: false,
    shape: 'empty, or an absolute http(s) URL carrying no credentials',
    accepts: isOptionalContactUrl,
  },
  {
    key: 'NEXT_PUBLIC_MESSENGER_CONTACT_URL',
    consumer: 'apps/storefront storefront-shell contact handoff (APP10-I01)',
    required: false,
    shape: 'empty, or an absolute http(s) URL carrying no credentials',
    accepts: isOptionalContactUrl,
  },
];

/**
 * The Secret objects the workloads must reference, and the keys the operator
 * has to have created inside them.
 *
 * Values are never read here — no Secret with values exists in this repository
 * to read. The deploy-time proof that they exist is the pod failing to
 * schedule without them, which is why the reference must not be `optional`.
 */
const REQUIRED_SECRET_KEYS = Object.freeze({
  'embroidery-secrets': Object.freeze([
    'DATABASE_URL',
    'OBJECT_STORAGE_ACCESS_KEY_ID',
    'OBJECT_STORAGE_SECRET_ACCESS_KEY',
    'DESIGN_SESSION_SECRET_PEPPER',
    'VERIFICATION_CODE_SECRET_PEPPER',
    'SECURE_LINK_TOKEN_SECRET_PEPPER',
    'NOTIFICATION_DELIVERY_ENVELOPE_KEY',
  ]),
});

/** Hostnames that must never appear in a production origin. */
const LOOPBACK_HOSTNAMES = Object.freeze(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export {
  CONFIG_RULES,
  REQUIRED_SECRET_KEYS,
  LOOPBACK_HOSTNAMES,
  isCanonicalOrigin,
  isAbsoluteHttpUrl,
};
