import {
  publicDesignTemplateAssetGet,
  publicDesignTemplateDetail,
  publicDesignTemplateList,
  type PublicDesignTemplateDetailResponse,
  type PublicDesignTemplateListResponse,
} from '@embroidery/api-client';

import { getBrowserApiClient } from '../../../config/browser-api-client';
import { toStudioApiError } from '../model/studio-failure';
import type { StudioPlacementTriple } from '../model/studio-placement';
import { STUDIO_TEMPLATE_PAGE_SIZE } from '../model/studio-query-keys';
import type { TemplatePreviewReference } from '../model/studio-template';

/**
 * One page of published Templates compatible with one exact placement triple
 * (`APP3-B05`).
 *
 * All three ids are sent on every request. B05 offers no Product-wide,
 * Side-wide or wildcard match, and there is no parameter for search, sort,
 * offset, page or total — so this function has nothing of that kind to pass and
 * none is fabricated.
 *
 * The cursor is opaque: handed back exactly as issued, never parsed or
 * composed. It is bound to the scope it was issued under, which is why it
 * travels beside the same triple.
 */
export async function fetchTemplatePage(
  triple: StudioPlacementTriple,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<PublicDesignTemplateListResponse> {
  try {
    const body = await publicDesignTemplateList(
      {
        productId: triple.productId,
        productSideId: triple.productSideId,
        embroideryAreaId: triple.embroideryAreaId,
        limit: STUDIO_TEMPLATE_PAGE_SIZE,
        ...(cursor === undefined ? {} : { cursor }),
      },
      { instance: getBrowserApiClient(), config: { signal } },
    );
    return body.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * The selected Template's published version and document (`APP3-B05`).
 *
 * Read for the **selected** Template only. Resolving a detail per listed row
 * would be the N+1 a keyset list exists to avoid, and the list already carries
 * everything a row renders.
 */
export async function fetchTemplateDetail(
  templateSlug: string,
  signal: AbortSignal,
): Promise<PublicDesignTemplateDetailResponse> {
  try {
    const body = await publicDesignTemplateDetail(templateSlug, {
      instance: getBrowserApiClient(),
      config: { signal },
    });
    return body.data;
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}

/**
 * The editor-safe bytes of one asset placed by the Template's current published
 * version (`APP3-B05A`).
 *
 * The address is contextual — Template slug, published version and asset id
 * together — and there is deliberately no other way to reach these bytes. No
 * storage URL, bucket, key, presign or Admin route is involved on this path,
 * and none could be: the server re-proves publication, the current version,
 * document membership, the durable association and placement eligibility on
 * every request.
 */
export async function fetchTemplatePreviewBlob(
  reference: TemplatePreviewReference,
  signal: AbortSignal,
): Promise<Blob> {
  try {
    return await publicDesignTemplateAssetGet(
      reference.templateSlug,
      reference.version,
      reference.assetId,
      { instance: getBrowserApiClient(), config: { signal } },
    );
  } catch (error: unknown) {
    throw toStudioApiError(error);
  }
}
