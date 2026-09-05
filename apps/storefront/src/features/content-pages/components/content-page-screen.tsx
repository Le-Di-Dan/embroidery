import type { ContentPage } from '../model/content-page';
import { resolveContentPageForRelease } from '../model/content-page-release';
import { ContentFaqDisclosure } from './content-faq-disclosure';
import { ContentLinksBlock } from './content-links-block';
import { ContentPageHero } from './content-page-hero';
import { ContentProseBlock } from './content-prose-block';
import { ContentStoreInfo } from './content-store-info';

/**
 * The shared static content-page template (`APP11-S05`).
 *
 * Design authority: `FIG-APP11-CONTENT-TEMPLATE-DESKTOP` `863:677`, `-TABLET`
 * `864:1085`, `-MOBILE` `864:1253`, all `APPROVED_FOR_IMPLEMENTATION`.
 *
 * All four S05 pages render through this one component: `/dich-vu`,
 * `/cau-hoi-thuong-gap`, `/cua-hang` and every `/chinh-sach/[slug]`. The four
 * route segments differ only in which definition they hand it — none of them
 * composes its own layout, so there is one reading width, one heading rhythm and
 * one place a template change lands, which is the "one system, not four bespoke
 * architectures" D01 asked for.
 *
 * It is a Server Component, and so is every block except one. The FAQ disclosure
 * is the single client island on any content page, and it is one only so that it
 * can keep `aria-expanded` in step with the element it controls; the Service,
 * Local and policy pages ship no client component at all.
 *
 * The `<h1>` is the template's, exactly once per page, and the shell
 * deliberately renders none (`storefront-shell.tsx`). The section headings below
 * it are `<h2>` and the FAQ questions inside a section are `<h3>`, so the
 * outline never skips a level.
 *
 * ## The page is resolved for the current release before it is rendered
 *
 * `APP12-V02` §7.1. The definitions hold the content of **both** waves; what a
 * visitor may read is whatever is true of the release they are looking at. The
 * resolution happens here, once, rather than in the four route segments, for
 * the same reason the layout does: four copies of a rule is four places for it
 * to be forgotten when a fifth page arrives.
 */
export function ContentPageScreen({ page }: { page: ContentPage }) {
  const published = resolveContentPageForRelease(page);

  return (
    <article className="content-page">
      <ContentPageHero page={published} />

      <div className="content-page__sections">
        {published.sections.map((section) => {
          switch (section.kind) {
            case 'prose':
              return <ContentProseBlock key={section.id} section={section} />;
            case 'faq':
              return <ContentFaqDisclosure key={section.id} section={section} />;
            case 'store-info':
              return <ContentStoreInfo key={section.id} section={section} />;
            case 'links':
              return <ContentLinksBlock key={section.id} section={section} />;
          }
        })}
      </div>
    </article>
  );
}
