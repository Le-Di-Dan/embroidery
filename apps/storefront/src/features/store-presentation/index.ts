// Public surface of the store-presentation feature (`APP11-S05`) — the
// APP11-owned footer supplement composed above the shared shell's Footer.
//
// A feature of its own rather than a component inside `storefront-shell`: it is
// APP11 content (store identity, contact routing, service links, the policy
// column) hung on APP1 chrome, it reads the content-pages store-fact boundary
// and the canonical policy set, and keeping it separate leaves the approved DS
// Footer and its stylesheet untouched — which `889:1030` requires.
export { StorePresentationBlock } from './components/store-presentation-block';
