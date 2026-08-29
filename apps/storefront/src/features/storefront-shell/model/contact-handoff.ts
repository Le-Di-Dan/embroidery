/**
 * APP10-I01 — Zalo / Messenger simple external handoff configuration.
 *
 * Design authority: `FIG-APP10-I01-FOOTER-DESKTOP` (842:3),
 * `FIG-APP10-I01-FOOTER-MOBILE` (842:48), `FIG-APP10-I01-CTA-STATES` (843:3)
 * and `FIG-APP10-I01-HANDOFF-SPEC` (843:44), approved under
 * `FIG-APPROVAL-APP10-D01-PO-001`.
 *
 * ### What this is, and what it is deliberately not
 *
 * Two configured external URLs (BR-018, `SYSTEM_ARCHITECTURE` §76,
 * `12-DECISION-LOG` D-015). There is no provider
 * SDK, no provider API call, no webhook, no backend adapter and no
 * conversation state: the whole capability is an anchor whose `href` an
 * operator publishes. So this module resolves configuration and validates a
 * URL — it is not a social-provider framework, and a third channel would be a
 * new product decision, not a new entry in a registry.
 *
 * ### Missing or malformed configuration omits the channel
 *
 * Unlike `STOREFRONT_PUBLIC_ORIGIN` in the worker — which fails closed because
 * a wrong origin silently mails a customer's token to another host — a missing
 * contact URL costs the customer one convenience link on a page whose
 * authoritative flows all still work. Failing the render would be strictly
 * worse than omitting the link, so an absent or unusable value resolves to
 * `undefined` and the caller draws nothing: no disabled button, no `#`, no
 * `javascript:void(0)`, no empty `href`, and no configuration error shown to a
 * customer (`843:3`).
 *
 * ### Only `http:`/`https:` absolute URLs, echoed from the parser
 *
 * The scheme allowlist is what keeps a `javascript:` or `data:` value written
 * into configuration from becoming a click target in every page footer. The
 * resolved value is `URL.href` rather than the raw string, so what reaches the
 * DOM is the parser's canonical form of something already proven to be an
 * absolute http(s) URL, never operator text passed through untouched.
 *
 * ### No customer context is appended here
 *
 * `843:44` permits only an already-public human-readable business reference in
 * a provider opening text, and forbids secure-link tokens, fragments,
 * verification codes, internal ids, e-mail addresses and phone numbers. The
 * shell footer renders on every route with no request or order in hand, so
 * this module composes no query, no fragment and no opening text at all: the
 * configured URL is used exactly as published. Nothing here reads the current
 * page, and there is no code path that could append page state to the URL.
 */

/** Public browser configuration: the Zalo destination. Non-secret by nature — it is printed in the page. */
export const ZALO_CONTACT_URL_ENV = 'NEXT_PUBLIC_ZALO_CONTACT_URL';

/** Public browser configuration: the Messenger destination. */
export const MESSENGER_CONTACT_URL_ENV = 'NEXT_PUBLIC_MESSENGER_CONTACT_URL';

/** The two locked channels. This union is the boundary — not an extensible registry. */
export type ContactHandoffChannelId = 'zalo' | 'messenger';

/** A channel that has a usable configured destination. */
export interface ContactHandoffChannel {
  readonly id: ContactHandoffChannelId;
  readonly href: string;
}

/** The raw configured values, in channel order. */
export interface ContactHandoffConfig {
  readonly zaloUrl: string | undefined;
  readonly messengerUrl: string | undefined;
}

const ALLOWED_PROTOCOLS = ['https:', 'http:'];

/**
 * Returns the canonical absolute URL, or `undefined` when the value is absent
 * or unusable. Never throws and never reports the offending value: a customer
 * must not be shown configuration, and the footer must not fail with it.
 */
export function resolveExternalContactUrl(raw: string | undefined): string | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = raw.trim();
  if (value === '') {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    // Relative paths, bare hostnames and free text all land here.
    return undefined;
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return undefined;
  }
  if (url.hostname === '') {
    return undefined;
  }
  if (url.username !== '' || url.password !== '') {
    // Credentials in a link the whole public footer carries.
    return undefined;
  }

  return url.href;
}

/**
 * Reads the two public values from the environment.
 *
 * Both are accessed as static `process.env.NEXT_PUBLIC_*` literals so Next.js
 * can substitute them; a computed lookup would resolve to `undefined` in a
 * client bundle and silently hide both CTAs.
 */
export function readContactHandoffConfig(): ContactHandoffConfig {
  return {
    zaloUrl: process.env.NEXT_PUBLIC_ZALO_CONTACT_URL,
    messengerUrl: process.env.NEXT_PUBLIC_MESSENGER_CONTACT_URL,
  };
}

/**
 * Resolves the channels that may be rendered, in the approved footer order
 * (Zalo, then Messenger — `842:3`). A channel without a usable URL is absent
 * from the result; when neither resolves the array is empty and the caller
 * renders no group at all, returning the footer to its pre-I01 composition.
 */
export function resolveContactHandoffChannels(
  config: ContactHandoffConfig,
): readonly ContactHandoffChannel[] {
  const channels: ContactHandoffChannel[] = [];
  const zaloHref = resolveExternalContactUrl(config.zaloUrl);
  if (zaloHref !== undefined) {
    channels.push({ id: 'zalo', href: zaloHref });
  }
  const messengerHref = resolveExternalContactUrl(config.messengerUrl);
  if (messengerHref !== undefined) {
    channels.push({ id: 'messenger', href: messengerHref });
  }
  return channels;
}
