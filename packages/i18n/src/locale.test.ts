/**
 * The locale contract `APP12-V02` §5A and §47 require both applications to hold.
 *
 * Every assertion here is a checkpoint acceptance item, and each is written so
 * it fails if the *behaviour* changes rather than if a comment does: the policy
 * flags are read from the exported object, not restated, so adding a language
 * switcher or a `/vi` route segment cannot be done without turning one of these
 * red first.
 */
import {
  DEFAULT_LOCALE,
  HTML_LANG,
  LOCALE_POLICY,
  SUPPORTED_LOCALES,
  isSupportedLocale,
} from './locale';
import { createIntlRequestConfig } from './request-config';
import { DISPLAY_TIME_ZONE } from './formats';

describe('the Wave-1 locale', () => {
  it('is exactly `vi`', () => {
    expect(DEFAULT_LOCALE).toBe('vi');
  });

  it('is the only locale the repository ships', () => {
    expect([...SUPPORTED_LOCALES]).toEqual(['vi']);
  });

  it('is what both root layouts put in `<html lang>`', () => {
    // The attribute and the messages come from one constant so a document
    // cannot declare a language it is not rendering.
    expect(HTML_LANG).toBe(DEFAULT_LOCALE);
  });

  it('narrows a candidate locale', () => {
    expect(isSupportedLocale('vi')).toBe(true);
    expect(isSupportedLocale('en')).toBe(false);
  });
});

describe('the Wave-1 locale policy', () => {
  it('adds no locale route prefix', () => {
    expect(LOCALE_POLICY.routePrefix).toBe(false);
  });

  it('adds no language switcher', () => {
    expect(LOCALE_POLICY.languageSwitcher).toBe(false);
  });

  it('never negotiates from the browser or a cookie', () => {
    expect(LOCALE_POLICY.browserDetection).toBe(false);
    expect(LOCALE_POLICY.cookie).toBe(false);
  });
});

describe('the request configuration both applications register', () => {
  it('resolves the default locale, its messages and the shared formats', () => {
    const config = createIntlRequestConfig();
    expect(config.locale).toBe('vi');
    expect(config.timeZone).toBe(DISPLAY_TIME_ZONE);
    expect(Object.keys(config.messages)).toContain('storefront');
    expect(Object.keys(config.messages)).toContain('admin');
    expect(config.formats.dateTime.dateTime.hourCycle).toBe('h23');
  });

  it('makes a malformed message fail visibly outside production', () => {
    // §5A.13. In a test run, a missing or broken message must throw rather than
    // render its own key, which is the failure that otherwise reaches a browser.
    const config = createIntlRequestConfig();
    expect(() => config.onError(new Error('missing message'))).toThrow('missing message');
  });
});
