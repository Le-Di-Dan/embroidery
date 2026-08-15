import { SECURE_LINK_COPY } from '../model/secure-link-copy';

/** The number of skeleton bars drawn on `629:11`. The fourth is short. */
const SKELETON_BARS = [1, 2, 3, 4] as const;

/**
 * Bootstrap / resolving — `629:3`.
 *
 * Shown from the first paint until B06 answers. It says what is happening and
 * shows nothing else: no token field, no "checking token…", no request id, no
 * customer or request data (§11). The skeleton is the design's placeholder for
 * content that does not exist yet, and stays a placeholder — nothing is fetched
 * to fill it.
 *
 * `APP4-D01` drew no mobile bootstrap frame, so this one serves both sizes on
 * the shared responsive rule (`634:119`); the stylesheet supplies the mobile
 * type sizes and padding.
 *
 * The skeleton bars are `aria-hidden`: they carry no information a screen
 * reader could use, and the polite live region on the screen already announces
 * that the link is being checked.
 */
export function SecureLinkBootstrapCard() {
  return (
    <div className="secure-link-access__card">
      <h1 className="secure-link-access__title">{SECURE_LINK_COPY.bootstrap.title}</h1>
      <p className="secure-link-access__body">{SECURE_LINK_COPY.bootstrap.body}</p>
      <div className="secure-link-access__skeleton" aria-hidden="true">
        {SKELETON_BARS.map((bar) => (
          <span
            key={bar}
            className={`secure-link-access__skeleton-bar${
              bar === SKELETON_BARS.length ? ' secure-link-access__skeleton-bar--short' : ''
            }`}
          />
        ))}
      </div>
      <p className="secure-link-access__caption">{SECURE_LINK_COPY.bootstrap.caption}</p>
    </div>
  );
}
