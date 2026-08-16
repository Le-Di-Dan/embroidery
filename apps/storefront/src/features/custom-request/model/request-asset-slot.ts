/**
 * One customer upload, from the moment a file is chosen to the moment it may be
 * bound to a submission (`654:3` … `654:397`).
 *
 * ## `bindable` is the authority, `state` is the picture
 *
 * `APP5-B02` publishes both, and they answer different questions.
 * `CustomRequestAssetStatusResponse.bindable` is documented as "true exactly
 * when this id would be accepted in a custom-request submission" — so it, and
 * not a comparison against `ACCEPTED`, decides whether an id goes into the
 * submission (`APP5-S01` §1.2). `state` drives which approved tile is drawn.
 *
 * Keeping them apart matters: re-deriving bindability from `state` would put a
 * copy of `APP5-B01`'s binding rules in the browser, where it would drift the
 * first time the backend narrowed them, and the drift would show up as a 422 at
 * submit rather than as a failing test.
 *
 * ## The two roles a customer may use
 *
 * `COP_IMAGE` and `REFERENCE` only. `ATTACHMENT` is an internal role and appears
 * on no approved frame; it is absent from this module's types, so no component
 * can offer it.
 */
import {
  CustomRequestAssetStatusResponseState,
  PublicCustomRequestAssetUploadRole,
  type CustomRequestAssetBinding,
  type CustomRequestAssetStatusResponse,
} from '@embroidery/api-client';

/** The two customer-facing roles (`APP5-G01` §6). */
export type CustomerAssetRole = 'COP_IMAGE' | 'REFERENCE';

export const CUSTOMER_ASSET_ROLES: readonly CustomerAssetRole[] = ['COP_IMAGE', 'REFERENCE'];

/** `APP5-G01` §6 — ten bound assets per role, twenty reserved per challenge. */
export const ROLE_ASSET_CAP = 10;
export const CHALLENGE_ASSET_CAP = 20;

/** Published client-side limits. The server remains the authority (§10). */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_MEDIA_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/**
 * The bounded refusal classes this screen may show (`APP5-S01` §12).
 *
 * Deliberately coarse. Every one of them is something the customer can act on;
 * nothing here can carry scanner output, a detected MIME type, a storage key or
 * a constraint name, because those are not values of this type.
 */
export type UploadFailureClass =
  | 'TOO_LARGE'
  | 'UNSUPPORTED'
  | 'PROCESSING_FAILED'
  | 'QUOTA'
  | 'VERIFICATION_UNAVAILABLE'
  | 'GENERIC';

/** What the tile is doing right now. */
export type SlotPhase = 'UPLOADING' | 'TRACKING' | 'FAILED';

export interface AssetSlot {
  /** Client-side identity, stable from file selection onward. */
  readonly key: string;
  readonly role: CustomerAssetRole;
  readonly fileName: string;
  readonly phase: SlotPhase;
  /** Server id, present once the upload has been accepted for inspection. */
  readonly assetId: string | undefined;
  /** Latest published inspection state, absent until the first status read. */
  readonly state: CustomRequestAssetStatusResponseState | undefined;
  /** `APP5-B02`'s own answer. Never derived locally. */
  readonly bindable: boolean;
  readonly failure: UploadFailureClass | undefined;
}

/** A status response, copied in without deriving anything from it. */
export function applyStatus(slot: AssetSlot, status: CustomRequestAssetStatusResponse): AssetSlot {
  return {
    ...slot,
    phase: 'TRACKING',
    state: status.state,
    bindable: status.bindable,
    // REJECTED is terminal and is the one state that carries a visible class;
    // the class stays bounded because it is chosen here, not read from prose.
    failure:
      status.state === CustomRequestAssetStatusResponseState.REJECTED
        ? 'PROCESSING_FAILED'
        : undefined,
  };
}

/**
 * Is this slot finished, so its polling may stop?
 *
 * `ACCEPTED` and `REJECTED` are the terminal inspection states; a failed upload
 * never had an id to poll. Everything else is still moving.
 */
export function isTerminal(slot: AssetSlot): boolean {
  if (slot.phase === 'FAILED') return true;
  return (
    slot.state === CustomRequestAssetStatusResponseState.ACCEPTED ||
    slot.state === CustomRequestAssetStatusResponseState.REJECTED
  );
}

/** A slot still on its way to a verdict, which blocks submission. */
export function isPending(slot: AssetSlot): boolean {
  return !isTerminal(slot);
}

/** The slots that may be named in a submission. `bindable`, and nothing else. */
export function bindableSlots(slots: readonly AssetSlot[]): AssetSlot[] {
  return slots.filter((slot) => slot.bindable && slot.assetId !== undefined);
}

export function slotsOfRole(slots: readonly AssetSlot[], role: CustomerAssetRole): AssetSlot[] {
  return slots.filter((slot) => slot.role === role);
}

/**
 * Has this role reached its cap?
 *
 * Counted over every slot the customer still has on screen, not only bound
 * ones: a slot mid-inspection is already holding reserved capacity server-side,
 * so offering an eleventh upload would be offering one the server will refuse.
 */
export function roleCapReached(slots: readonly AssetSlot[], role: CustomerAssetRole): boolean {
  return (
    slotsOfRole(slots, role).filter((slot) => slot.phase !== 'FAILED').length >= ROLE_ASSET_CAP
  );
}

export function challengeCapReached(slots: readonly AssetSlot[]): boolean {
  return slots.filter((slot) => slot.phase !== 'FAILED').length >= CHALLENGE_ASSET_CAP;
}

/** The bindings a submission carries, in display order. */
export function toAssetBindings(slots: readonly AssetSlot[]): CustomRequestAssetBinding[] {
  return bindableSlots(slots).map((slot) => ({
    // Narrowed by `bindableSlots`; stated rather than asserted away with `!`.
    assetId: slot.assetId ?? '',
    role: PublicCustomRequestAssetUploadRole[slot.role],
  }));
}

/** Client-side pre-checks. UX only — the server re-checks every one of them. */
export function localFileFailure(file: File): UploadFailureClass | undefined {
  if (file.size > MAX_UPLOAD_BYTES) return 'TOO_LARGE';
  if (!ACCEPTED_MEDIA_TYPES.includes(file.type)) return 'UNSUPPORTED';
  return undefined;
}
