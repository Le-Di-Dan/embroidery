import { fetchHomepageWorksOnServer } from '../services/homepage-catalog.server';
import { HomepageWorksSections } from './homepage-works-sections';

/**
 * The async half of sections 2 and 3: it awaits the one bounded catalog read and
 * hands the result to the presentational sections.
 *
 * It exists as its own component so the screen can suspend *only* this part of
 * the page. Everything the visitor needs in order to trust the studio and act —
 * Hero, Studio Story, Commission CTA — is static and streams immediately;
 * nothing waits on the catalog. The read absorbs its own failure, so this
 * component has no error path to handle and never throws.
 */
export async function HomepageWorksLane() {
  const works = await fetchHomepageWorksOnServer();
  return <HomepageWorksSections works={works} />;
}
