import { BRAND_SYMBOL_APPLICATION_PX, BrandSymbol } from '@embroidery/ui';

import { STAFF_LOGIN_COPY } from '../model/staff-login-copy';

/**
 * Static editorial brand panel (left column on desktop, brand mark only on
 * mobile). Pure presentation with no interactivity, so it renders on the server.
 * The editorial headline and lede are marketing copy, not document headings —
 * the page's single heading is the form title.
 */
export function StaffLoginBrandPanel() {
  const { brand, editorial } = STAFF_LOGIN_COPY;

  return (
    <aside className="staff-login__brand">
      <div className="staff-login__brand-mark">
        {/*
          The production symbol at the approved login size (`589:36`). Decorative:
          the brand name is the visible text right beneath it, so naming the mark
          as well would make a screen reader announce the brand twice.
        */}
        <BrandSymbol
          variant="production"
          size={BRAND_SYMBOL_APPLICATION_PX.adminLogin}
          tone="ink"
        />
        <p className="staff-login__brand-title">{brand.title}</p>
        <p className="staff-login__brand-supporting">{brand.supporting}</p>
      </div>
      <div className="staff-login__editorial">
        <p className="staff-login__headline">
          <span>{editorial.headingLine1}</span>
          <span>{editorial.headingLine2}</span>
        </p>
        <p className="staff-login__lede">{editorial.body}</p>
      </div>
      <p className="staff-login__footnote">{brand.footnote}</p>
    </aside>
  );
}
