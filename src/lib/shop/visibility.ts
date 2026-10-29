import type { CustomerGroup } from '@/lib/admin/types';
import type { CatalogProduct, DealerType } from './types';

/** What a dealer may see: their product families, narrowed by their customer group (if any). */
export type VisibilityScope = { types: readonly DealerType[]; group: Pick<CustomerGroup, 'brands' | 'categoryIds' | 'includeTmplIds' | 'excludeTmplIds'> | null };

/** True when the group narrows by brand, category or explicit product list. */
export function groupRestricts(group: VisibilityScope['group']): boolean {
  return Boolean(group && (group.brands.length || group.categoryIds.length || group.includeTmplIds.length));
}

/**
 * Whether a dealer with this scope may see and order a product.
 * The product family must always be allowed. Within it, a group's include list,
 * brands and categories each grant access; the exclude list always removes it.
 */
export function isProductVisible(product: Pick<CatalogProduct, 'tmplId' | 'brand' | 'categoryId' | 'dealerType'>, scope: VisibilityScope): boolean {
  if (!scope.types.includes(product.dealerType)) return false;
  const group = scope.group;
  if (!group) return true;
  if (group.excludeTmplIds.includes(product.tmplId)) return false;
  if (!groupRestricts(group)) return true;
  return group.includeTmplIds.includes(product.tmplId)
    || group.brands.includes(product.brand)
    || group.categoryIds.includes(product.categoryId);
}
