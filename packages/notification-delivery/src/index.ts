/**
 * `@embroidery/notification-delivery` — the encrypted delivery envelope
 * (`APP4-B01`, `ADR-APP4-001` §6).
 *
 * Framework-neutral and side-effect-free on import: it constructs nothing, reads
 * no environment variable and starts nothing at module load. `apps/api` seals
 * through it; `apps/worker` will open through it. That is the entire reason it
 * is a package — it is the one thing two applications genuinely share, and an
 * app-to-app import would be the alternative.
 *
 * Owns the envelope schema, its version constant, the secret-kind discriminator,
 * key parsing and the AES-256-GCM pair. Owns no persistence, no repository, no
 * policy lookup, no HTTP, no Nest module, no worker runtime, no provider SDK and
 * no message template.
 */
export {
  DELIVERY_ENVELOPE_ALGORITHM,
  DELIVERY_ENVELOPE_VERSION,
  DELIVERY_SECRET_KINDS,
  isDeliveryEnvelope,
  isDeliverySecretKind,
} from './delivery-envelope.contract';
export type {
  DeliveryEnvelope,
  DeliveryPayload,
  DeliverySecretKind,
} from './delivery-envelope.contract';

export {
  ENVELOPE_KEY_BYTES,
  NOTIFICATION_DELIVERY_ENVELOPE_KEY_ENV,
  loadEnvelopeKey,
  parseEnvelopeKey,
} from './envelope-key';
export type { EnvelopeKey } from './envelope-key';

export {
  ENVELOPE_IV_BYTES,
  openDeliveryEnvelope,
  sealDeliveryEnvelope,
} from './delivery-envelope.codec';
export type { RandomBytesSource } from './delivery-envelope.codec';
