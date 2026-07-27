/**
 * Asset lifecycle presentation.
 *
 * The generated `status` field is typed `string`, not a closed union — the
 * contract deliberately leaves room for lifecycle states this screen does not
 * know. So this module parses rather than casts: a recognised value maps to a
 * presentation state, and anything else becomes `UNKNOWN`, which renders
 * neutral copy, never the raw server value, and never infers "ready".
 *
 * Copy is the approved Figma status language (`450:404` — Ánh xạ trạng thái).
 */
import { ASSET_COPY } from './asset-copy';

/** What the screen shows; deliberately not the wire vocabulary. */
export type AssetStatusPresentation = 'PENDING' | 'PROCESSING' | 'READY' | 'REJECTED' | 'UNKNOWN';

const PRESENTATION_BY_STATUS: Readonly<Record<string, AssetStatusPresentation>> = {
  UPLOADED: 'PENDING',
  INSPECTING: 'PROCESSING',
  ACCEPTED: 'READY',
  REJECTED: 'REJECTED',
};

const LABEL: Readonly<Record<AssetStatusPresentation, string>> = {
  PENDING: ASSET_COPY.status.pending,
  PROCESSING: ASSET_COPY.status.processing,
  READY: ASSET_COPY.status.ready,
  REJECTED: ASSET_COPY.status.rejected,
  UNKNOWN: ASSET_COPY.status.unknown,
};

/** Maps a wire status to presentation. Unknown input fails safely. */
export function parseAssetStatus(status: unknown): AssetStatusPresentation {
  if (typeof status !== 'string') {
    return 'UNKNOWN';
  }
  return PRESENTATION_BY_STATUS[status] ?? 'UNKNOWN';
}

/** The approved Vietnamese label for a presentation state. */
export function assetStatusLabel(presentation: AssetStatusPresentation): string {
  return LABEL[presentation];
}

/**
 * Whether post-upload reconciliation should keep asking. Only the two known
 * in-flight states continue; a terminal result — or a status this build cannot
 * interpret — stops the poll rather than looping forever.
 */
export function isReconciliationPending(presentation: AssetStatusPresentation): boolean {
  return presentation === 'PENDING' || presentation === 'PROCESSING';
}
