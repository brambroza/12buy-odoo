import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ odooSearchRead: vi.fn(), odooBaseUrl: vi.fn() }));
vi.mock('@/lib/odoo/rpc', () => rpc);

const { getCatalog, clearCatalogCache, PRODUCT_DOMAIN } = await import('@/lib/shop/catalog');

describe('catalog product query', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    clearCatalogCache();
    rpc.odooSearchRead.mockResolvedValue([]);
    rpc.odooBaseUrl.mockResolvedValue('https://odoo.test');
  });

  it('reads only products published on the website', async () => {
    await getCatalog();
    const productCall = rpc.odooSearchRead.mock.calls.find(([model]) => model === 'product.product');
    expect(productCall?.[1]).toEqual(PRODUCT_DOMAIN);
    expect(PRODUCT_DOMAIN).toContainEqual(['is_published', '=', true]);
    expect(PRODUCT_DOMAIN).toContainEqual(['sale_ok', '=', true]);
  });
});
