// Public surface of `@embroidery/ui` — React components genuinely shared
// between the Storefront and the Admin application.
//
// The first content is the Nét Thêu brand symbol system (`BRD0-F02`, applied by
// the Product Owner brand-system directive after `APP12-H06`). It lives here
// rather than in either app because both render the same approved mark, and the
// directive requires **one** canonical vector-path source per variant: a copy in
// each app would be two sources that look identical until one is corrected.
//
// This package deliberately ships no stylesheet. Each shell already owns its own
// brand-slot layout and typography, and a component that carried its own CSS
// would have to win an argument with three existing stylesheets to render.

export { BrandSymbol } from './brand/brand-symbol';
export type { BrandSymbolProps } from './brand/brand-symbol';

export { BrandLockup } from './brand/brand-lockup';
export type { BrandLockupProps } from './brand/brand-lockup';

export {
  BRAND_CANVAS_COLOR,
  BRAND_DESCRIPTOR,
  BRAND_GESTURE_STROKE_WIDTH,
  BRAND_NAME,
  BRAND_SEAL_RING,
  BRAND_SIGNATURE_GESTURE_PATH,
  BRAND_SYMBOL_APPLICATION_PX,
  BRAND_SYMBOL_MIN_PX,
  BRAND_SYMBOL_TONE_COLOR,
  BRAND_SYMBOL_VIEWBOX,
} from './brand/brand-symbol-geometry';
export type { BrandSymbolTone, BrandSymbolVariant } from './brand/brand-symbol-geometry';
