/**
 * @jest-environment node
 *
 * The Storefront Wave-2 release gate (`APP12-G02` §19, §20).
 *
 * Three things are proved here, and the third is the one that matters most:
 *
 * 1. the flag parses identically to the API's (the same five-case table);
 * 2. with the capability withheld, all **seven** §7 routes are denied and every
 *    Wave-1 route — `/`, `/kham-pha`, `/san-pham/<slug>`, `/xac-minh-lien-he`
 *    and the `/truy-cap` landing itself — is not;
 * 3. with the capability released, the gate stops interfering with all seven.
 *
 * (2) includes the two traps `APP12-RELEASE-WAVE-AUTHORITY.md` names: blocking
 * the `/truy-cap` prefix wholesale would take the future `/truy-cap/don-hang`
 * with it (§2.2), and blocking the `/san-pham` family would take the Ready-Made
 * entry point with it (§2.1). Both are asserted as explicit non-denials, so the
 * cheap wrong implementation cannot pass.
 */
import proxy from '../../src/proxy';
import {
  CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV,
  loadCustomEmbroideryRelease,
} from '../../src/config/custom-embroidery-release';
import {
  WITHHELD_WAVE2_ROUTES,
  WITHHELD_WAVE2_ROUTE_COUNT,
  isWithheldWave2Route,
} from '../../src/features/release-isolation';

const KEY = CUSTOM_EMBROIDERY_RELEASE_ENABLED_ENV;

/** The exact seven, written as literals so the policy cannot define its own answer. */
const WAVE2_ROUTES = [
  '/yeu-cau/moi',
  '/yeu-cau/da-gui',
  '/san-pham/ao-thun-co-tron/thiet-ke',
  '/truy-cap/bao-gia',
  '/truy-cap/duyet-thiet-ke',
  '/truy-cap/thanh-toan',
  '/truy-cap/thanh-toan-con-lai',
];

/** Released surfaces whose false denial would be a G02 blocker. */
const WAVE1_ROUTES = [
  '/',
  '/kham-pha',
  '/san-pham/ao-thun-co-tron',
  '/bo-suu-tap',
  '/bo-suu-tap/bo-suu-tap-mua-he',
  '/dich-vu',
  '/cau-hoi-thuong-gap',
  '/cua-hang',
  '/chinh-sach/giao-hang',
  '/xac-minh-lien-he',
  '/truy-cap',
  '/healthz',
  '/robots.txt',
  '/sitemap.xml',
];

/** Wave-1 routes that do not exist yet. The gate must leave room for them. */
const FUTURE_WAVE1_ROUTES = ['/mua-hang/ao-thun-co-tron', '/truy-cap/don-hang'];

/** A `NextRequest`-shaped stand-in carrying only what the proxy reads. */
function requestFor(pathname: string): Parameters<typeof proxy>[0] {
  const url = new URL(`https://cua-hang.example${pathname}`);
  return { nextUrl: url, url: url.toString() } as unknown as Parameters<typeof proxy>[0];
}

/** Whether the gate refused this path — a rewrite away from the requested one. */
function isDenied(pathname: string): boolean {
  const response = proxy(requestFor(pathname));
  const rewritten = response.headers.get('x-middleware-rewrite');
  return rewritten !== null && new URL(rewritten, 'https://cua-hang.example').pathname !== pathname;
}

describe('loadCustomEmbroideryRelease', () => {
  it('names the same one variable the API reads', () => {
    expect(KEY).toBe('CUSTOM_EMBROIDERY_RELEASE_ENABLED');
  });

  it.each([
    [{}, false],
    [{ [KEY]: '' }, false],
    [{ [KEY]: 'false' }, false],
    [{ [KEY]: 'true' }, true],
  ])('resolves %j to enabled=%s', (env, expected) => {
    expect(loadCustomEmbroideryRelease(env).enabled).toBe(expected);
  });

  it.each(['1', 'yes', 'on', 'TRUE', 'True', ' true', 'enabled'])(
    'fails closed on the unrecognised value "%s"',
    (value) => {
      expect(loadCustomEmbroideryRelease({ [KEY]: value })).toEqual({
        enabled: false,
        malformed: true,
      });
    },
  );

  it('never throws, so a typo cannot take the released Wave-1 shop down', () => {
    expect(() => loadCustomEmbroideryRelease({ [KEY]: 'nonsense' })).not.toThrow();
  });
});

describe('the Wave-2 route policy', () => {
  it('withholds exactly the seven routes APP12-G01 named', () => {
    // Six literals plus the dynamic Studio route, which is shape-matched.
    expect(WITHHELD_WAVE2_ROUTES).toHaveLength(WITHHELD_WAVE2_ROUTE_COUNT - 1);
    expect(WAVE2_ROUTES.filter(isWithheldWave2Route)).toHaveLength(WITHHELD_WAVE2_ROUTE_COUNT);
  });

  it('treats a trailing slash and a case difference as the same address', () => {
    expect(isWithheldWave2Route('/yeu-cau/moi/')).toBe(true);
    expect(isWithheldWave2Route('/YEU-CAU/MOI')).toBe(true);
  });

  it('leaves room for the Wave-1 routes that do not exist yet', () => {
    expect(FUTURE_WAVE1_ROUTES.filter(isWithheldWave2Route)).toEqual([]);
  });
});

describe('the release gate with the capability withheld', () => {
  const previous = process.env[KEY];

  beforeEach(() => {
    process.env[KEY] = 'false';
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = previous;
    }
  });

  it.each(WAVE2_ROUTES)('denies %s', (pathname) => {
    expect(isDenied(pathname)).toBe(true);
  });

  it.each(WAVE1_ROUTES)('leaves %s reachable', (pathname) => {
    expect(isDenied(pathname)).toBe(false);
  });

  it.each(FUTURE_WAVE1_ROUTES)('leaves the future Wave-1 route %s reachable', (pathname) => {
    expect(isDenied(pathname)).toBe(false);
  });

  it('denies with a rewrite rather than a redirect, so the URL is not echoed back', () => {
    const response = proxy(requestFor('/yeu-cau/moi'));
    expect(response.headers.get('x-middleware-rewrite')).not.toBeNull();
    expect(response.headers.get('location')).toBeNull();
  });

  it('withholds the same routes when the variable is absent entirely', () => {
    delete process.env[KEY];
    expect(WAVE2_ROUTES.filter((pathname) => !isDenied(pathname))).toEqual([]);
  });

  it('withholds the same routes when the value is malformed', () => {
    process.env[KEY] = 'TRUE';
    expect(WAVE2_ROUTES.filter((pathname) => !isDenied(pathname))).toEqual([]);
  });
});

describe('the release gate with the capability released', () => {
  const previous = process.env[KEY];

  beforeEach(() => {
    process.env[KEY] = 'true';
  });

  afterAll(() => {
    if (previous === undefined) {
      delete process.env[KEY];
    } else {
      process.env[KEY] = previous;
    }
  });

  it.each(WAVE2_ROUTES)('stops interfering with %s', (pathname) => {
    expect(isDenied(pathname)).toBe(false);
  });

  it.each(WAVE1_ROUTES)('leaves %s reachable, as before', (pathname) => {
    expect(isDenied(pathname)).toBe(false);
  });
});
