// Public surface of the assets feature. The route file and the Admin shell
// navigation import from here only; components, hooks, services and model stay
// encapsulated.
export { AssetLibraryScreen } from './components/asset-library-screen';
export { ADMIN_ASSETS_ROUTE } from './model/asset-route';
export { ASSET_COPY } from './model/asset-copy';
export { assetQueryKeys, ASSET_LIST_PAGE_SIZE } from './model/asset-query-keys';

// The server-only prefetch service is deliberately NOT re-exported here: it
// imports `next/headers`, and this module is reachable from Client Components.
// The route segment imports it directly instead.
