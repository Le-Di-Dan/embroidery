// Public surface of the Admin category capability (`APP12-A01`).
//
// The route file, the Admin shell navigation and the product feature import
// from here only; components, hooks, services and the rest of the model stay
// encapsulated. The product feature is a real consumer rather than an
// exception: a category's slug rule, its assignability and the inventory read
// are facts about a category, and duplicating any of them inside `products` is
// how a taxonomy acquires two authorities that can disagree.
export { CategoryManagementScreen } from './components/category-management-screen';
export { ADMIN_CATEGORIES_ROUTE } from './model/category-route';
export { CATEGORY_COPY } from './model/category-copy';
export {
  CATEGORY_SLUG_PATTERN,
  CATEGORY_SLUG_MAX_LENGTH,
  isCategorySlugShape,
} from './model/category-slug-shape';
export { isCategoryAssignable } from './model/category-editability';
export { fetchAdminCategories, type AdminCategory } from './services/admin-category.service';
export { isCategoryApiError, CategoryApiError } from './model/category-failure';
