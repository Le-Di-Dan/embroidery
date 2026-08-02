/**
 * Text scanners for the Storefront Product Detail authority gate (`APP2-S02-G01`).
 *
 * Every function here answers one question: does this line *record* a boundary, or does
 * it *cross* it? The governance documents must stay free to name what was rejected and
 * deferred — the UI03 reconciliation is largely a list of things the delivered contract
 * cannot feed — so a bare mention is never a violation. What fails is a mention paired
 * with a claim word ("canonical", "approved") or a requirement word ("must", "shall")
 * and no label ("not", "never", "deferred", "historical", …) to hold it down.
 *
 * Pure string functions, no I/O, so they stay testable without a scratch tree.
 */
import { isLabelled } from './check-storefront-route-authority.mjs';

/** Paths that must never become the Product Detail route or an approved detail alias. */
export const REJECTED_DETAIL_PATHS = Object.freeze([
  '/product/',
  '/products/',
  '/catalog/',
  '/tac-pham',
]);

/** UI03 draft roots. They must stay recorded, and must never become implementable. */
export const UI03_ROOTS = Object.freeze(['261:1290', '262:1291', '273:1409', '279:1504']);

/** Scope the contract cannot feed. Naming it is fine; *requiring* it is not. */
export const DEFERRED_FEATURES = Object.freeze([
  'materials',
  'related',
  'save',
  'favourite',
  'commission',
]);

/**
 * The three draft story fields. One `description` string cannot fill three fields, so a
 * document that *requires* them has re-adopted the draft over the contract.
 */
const STORY_FIELDS = ['cảm hứng', 'ý tưởng', 'ý nghĩa'];

/** Words that turn a mention of a path into a claim that it is authorised. */
const CLAIM_WORDS = ['canonical', 'approved', 'alias'];

/** Words that turn a mention into a requirement to build the thing mentioned. */
const REQUIREMENT_WORDS = ['must', 'required', 'shall'];

/** Commerce surfaces that must never be required on this page. */
const COMMERCE_WORDS = ['price', 'buy-box', 'add to cart', 'checkout'];

/** Lines where any `needles` entry meets any `triggers` entry without a label. */
function unlabelledMatches(text, needles, triggers) {
  return text.split('\n').filter((line) => {
    const lower = line.toLowerCase();
    if (!needles.some((needle) => lower.includes(needle))) return false;
    if (triggers !== undefined && !triggers.some((trigger) => lower.includes(trigger))) {
      return false;
    }
    return !isLabelled(line);
  });
}

/** Lines promoting a rejected detail path to canonical/approved/alias without a label. */
export function detailAliasPromotions(text) {
  return unlabelledMatches(text, REJECTED_DETAIL_PATHS, CLAIM_WORDS);
}

/** Lines requiring deferred scope to be built, rather than recording it as deferred. */
export function deferredScopeRequirements(text) {
  return unlabelledMatches(text, DEFERRED_FEATURES, REQUIREMENT_WORDS);
}

/** Lines requiring an ecommerce commerce surface on the detail page. */
export function commerceRequirements(text) {
  return unlabelledMatches(text, COMMERCE_WORDS, REQUIREMENT_WORDS);
}

/** Lines requiring the draft's three separate story fields instead of one description. */
export function storyFieldRequirements(text) {
  return unlabelledMatches(text, STORY_FIELDS, REQUIREMENT_WORDS);
}

/** Lines allowing a private original or a storage-provider URL to be rendered. */
export function originalMediaAllowances(text) {
  return unlabelledMatches(text, [
    'private original',
    'original asset',
    'storage-provider url',
    'storage provider url',
    'presigned',
  ]);
}

/** Any claim that a UI03 draft root is implementation authority. */
export function ui03AuthorityClaims(text) {
  return text.split('\n').filter((line) => {
    if (!UI03_ROOTS.some((node) => line.includes(node))) return false;
    if (
      !/implementation authority|APPROVED_FOR_IMPLEMENTATION|IMPLEMENTATION_AUTHORITY/i.test(line)
    )
      return false;
    return !isLabelled(line);
  });
}
