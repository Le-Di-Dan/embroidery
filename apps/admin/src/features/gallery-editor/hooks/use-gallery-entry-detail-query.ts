'use client';

/**
 * The editor's load.
 *
 * TanStack Query owns the record — not Zustand, and not component state. The
 * record is server state: it carries the concurrency token every guarded write
 * depends on, and duplicating it into a store would create a second copy that
 * a successful mutation could advance in one place and not the other.
 *
 * There is no automatic retry and no polling. A failed load is reported with an
 * explicit action the operator triggers, and a screen that re-requested a
 * private Admin record on a timer would be doing so for every operator who left
 * a tab open.
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { AdminGalleryEntryDetailResponse } from '@embroidery/api-client';

import { galleryEditorKeys } from '../model/gallery-editor-keys';
import { fetchGalleryEntryDetail } from '../services/gallery-entry.service';

/**
 * How long a loaded entry stays fresh.
 *
 * Short, because the token it carries is the thing that goes stale: an entry
 * published or re-ordered in another tab makes every guarded write on this one
 * fail. Not zero, so returning from a dialog does not re-request the record.
 */
export const GALLERY_DETAIL_STALE_TIME_MS = 15_000;

export type GalleryEntryDetailQueryResult = UseQueryResult<AdminGalleryEntryDetailResponse, Error>;

export function useGalleryEntryDetailQuery(entryId: string): GalleryEntryDetailQueryResult {
  return useQuery({
    queryKey: galleryEditorKeys.detail(entryId),
    queryFn: ({ signal }) => fetchGalleryEntryDetail(entryId, signal),
    staleTime: GALLERY_DETAIL_STALE_TIME_MS,
    retry: false,
    // A focus-triggered refetch would replace the record — and the token — under
    // an operator who is mid-edit, turning a tab switch into a silent conflict.
    refetchOnWindowFocus: false,
  });
}
