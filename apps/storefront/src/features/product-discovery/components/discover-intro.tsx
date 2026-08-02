import { DISCOVER_COPY } from '../model/discover-copy';

/**
 * The compact Discover introduction (UI02 `210:585` / `224:882` / `226:1049`).
 *
 * A Server Component with one `<h1>` and one supporting sentence, rendered once
 * for every viewport — UI02 draws separate desktop and mobile copy nodes, but
 * duplicating them in the DOM would give assistive technology two headings for
 * one page.
 *
 * UI02's intro row also carries two controls ("Tinh chỉnh", "Bố cục"). They are
 * omitted: `APP2-B04` supports neither a refinement panel nor a layout switch,
 * and a control that does nothing is worse than no control.
 */
export function DiscoverIntro() {
  return (
    <div className="discover__intro">
      <h1 className="discover__title">{DISCOVER_COPY.heading}</h1>
      <p className="discover__intro-text">{DISCOVER_COPY.intro}</p>
    </div>
  );
}
