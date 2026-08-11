/**
 * How far one of this Session's uploads has got (`APP3-S06` §11).
 *
 * The smallest service in the module, and that is the design. It reads one
 * projection and maps "no claim" onto the same silent 404 the delivery route
 * gives. It opens no transaction, touches no object storage, advances no
 * revision, issues no cookie and writes nothing — reading how an upload is
 * progressing must not be able to change the Session it belongs to.
 *
 * ## Why this is not "just poll the preview endpoint"
 *
 * `APP3-B06C` answers one indistinguishable 404 for eleven different private
 * misses, and that is correct for a delivery route: telling a caller *why* it may
 * not have an object turns the address into an enumeration oracle. The
 * consequence is that its 404 means "no bytes for you" and nothing else — it
 * cannot say whether an image is still being processed, was rejected, or was
 * never this Session's. A Studio that treated 404-then-200 as a state machine
 * would be reading a refusal as progress and could never show a failed upload at
 * all.
 *
 * So the distinction is drawn here, and only for an Asset the caller has already
 * proved it owns. To everyone else this route is exactly as silent as the
 * delivery route: an unknown Asset, another Session's Asset and an Asset this
 * Session never uploaded are one answer.
 */
import { Inject, Injectable } from '@nestjs/common';

import { designSessionAssetNotFound } from '../domain/design-session-asset-delivery.errors';
import {
  DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY,
  type DesignSessionAssetDeliveryRepository,
  type SessionAssetLookup,
  type SessionAssetStatus,
} from '../domain/repositories/design-session-asset-delivery.repository';

/** The projection, with the Asset it answers for. */
export interface SessionAssetStatusView {
  readonly assetId: string;
  readonly state: SessionAssetStatus['state'];
  readonly derivativeId?: string;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly mediaType?: string;
  readonly byteSize?: number;
}

@Injectable()
export class DesignSessionAssetStatusService {
  constructor(
    @Inject(DESIGN_SESSION_ASSET_DELIVERY_REPOSITORY)
    private readonly candidates: DesignSessionAssetDeliveryRepository,
  ) {}

  async read(lookup: SessionAssetLookup): Promise<SessionAssetStatusView> {
    const status = await this.candidates.findAssetStatus(lookup);
    if (status === undefined) throw designSessionAssetNotFound();

    // Spread rather than a field-by-field copy so a field added to the READY
    // variant cannot be silently dropped on the way out; the repository is the
    // one place that decides what a state carries, and it carries no storage
    // identity to leak.
    return status.state === 'READY'
      ? { assetId: lookup.assetId, ...status }
      : { assetId: lookup.assetId, state: status.state };
  }
}
