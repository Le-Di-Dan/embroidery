import type { Metadata } from 'next';

/**
 * `/yeu-cau/da-gui` — the destination `APP5-S01` hands off to, and **nothing
 * more**.
 *
 * `APP5-S02` owns the confirmation: the request code treatment (`660:3`), the
 * "this code does not open the request" line, the secure-link explanation and
 * the grant-scoped status entry. None of that is implemented here, and this file
 * exists only because a navigation needs a route to land on — the smallest
 * boundary consistent with the App Router, per `APP5-S01` §16.
 *
 * The code arrives as a query parameter and is deliberately **not read** here.
 * It is display-only and opens nothing (`APP5-G01` §5), and rendering it would
 * be implementing S02's frame a checkpoint early.
 */
export const metadata: Metadata = {
  title: 'Đã gửi yêu cầu — Nét Thêu',
  robots: { index: false, follow: false },
};

export default function CustomRequestSubmittedPage() {
  // Intentionally minimal. `APP5-S02` replaces this body with the approved
  // confirmation; it is not a placeholder for content this checkpoint owns.
  return null;
}
