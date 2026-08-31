/**
 * Vietnamese copy catalog for the public gallery feed (`APP11-S02`).
 *
 * All user-facing strings live here (FRONTEND_CONVENTIONS §14). Nothing in this
 * catalog promises a capability the backend does not have: `APP11-B03` exposes
 * an unfiltered keyset listing and nothing else, so there is no search copy, no
 * category or style copy, no sort control, no result count and no page number.
 *
 * There is also no engineering commentary — no endpoint, contract field,
 * checkpoint identifier or "sắp ra mắt" note reaches a visitor.
 *
 * UI05's own strings on `329:2` are marked `PROVISIONAL_COPY` in the file; the
 * H1 is not. `358:51` states the rule literally — "One H1 per page: Index H1 =
 * 'Bộ sưu tập'" — so the heading below is quoted from the approved board rather
 * than written here.
 */
export const GALLERY_COPY = {
  /** The page's single `<h1>`, quoted from the approved accessibility board. */
  heading: 'Bộ sưu tập',
  intro:
    'Những nhóm tác phẩm được xưởng tuyển chọn theo chủ đề và kỹ thuật, mỗi mục là một câu chuyện riêng.',
  /** Accessible name for the feed collection. */
  feedLabel: 'Các mục bộ sưu tập',
  /** Accessible name for the loading placeholder collection. */
  skeletonLabel: 'Đang tải bộ sưu tập',
  initialLoading: 'Đang tải bộ sưu tập…',
  empty: 'Chưa có mục bộ sưu tập.',
  initialError: {
    heading: 'Không thể tải bộ sưu tập',
    action: 'Thử lại',
  },
  continuation: {
    loadMore: 'Tải thêm mục',
    loading: 'Đang tải thêm…',
    error: 'Không thể tải thêm mục.',
    retry: 'Thử lại',
  },
  card: {
    /**
     * Screen-reader text for a cover whose bytes stopped resolving mid-session.
     * The card shows a neutral placeholder — never a fabricated URL and never a
     * retry that would hammer a route already answering 404.
     */
    imageUnavailable: 'Chưa hiển thị được ảnh của mục này.',
  },
} as const;

/**
 * Accessible text for a gallery cover, derived from the entry title alone.
 *
 * ```text
 * ALT_TEXT_MODEL = DERIVED_NOT_PERSISTED
 * ```
 *
 * `APP11-D01-C1` locked this and `APP11-B03` publishes no alt column, so there
 * is nothing to read and nothing for an operator to author. Deriving it here
 * keeps the one place a cover is described next to the one place the card is
 * built, and makes it impossible for a future contributor to "improve" the alt
 * text by inventing a description of an image nobody in this system has seen.
 */
export function galleryCoverAlt(entryTitle: string): string {
  return entryTitle;
}
