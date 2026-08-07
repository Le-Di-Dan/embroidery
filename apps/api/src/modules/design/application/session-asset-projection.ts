/**
 * The bounded intake view a Session upload answers with (`APP3-B06B` §12).
 *
 * Deliberately small. It says what the Studio needs to start tracking the
 * upload — which asset, which association, what the session revision is now —
 * and stops there.
 *
 * What it must never carry is the more interesting list: the storage key or any
 * URL derived from it (the object is private and stays private), the session
 * secret or its digest, any storage credential, and any claim about inspection
 * or normalization having succeeded. `INSPECTING` is a statement that work has
 * been *queued*, not that it has passed; a response that implied otherwise would
 * make the Studio show a derivative that may never exist.
 */
import type { SessionUploadCompleted } from '../domain/session-upload-result.codec';

export interface SessionAssetIntakeView {
  readonly assetId: string;
  readonly designSessionAssetId: string;
  readonly sessionRevision: number;
  /** Always `INSPECTING`: the only state this operation can leave behind. */
  readonly assetStatus: 'INSPECTING';
  readonly mediaType: string;
  readonly byteSize: number;
}

export function toSessionAssetView(result: SessionUploadCompleted): SessionAssetIntakeView {
  return {
    assetId: result.assetId,
    designSessionAssetId: result.designSessionAssetId,
    sessionRevision: result.sessionRevision,
    assetStatus: 'INSPECTING',
    mediaType: result.mediaType,
    byteSize: result.byteSize,
  };
}
