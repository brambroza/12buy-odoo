import xmlrpc from 'xmlrpc';
import type { SaleOrderWithItems } from '@/types/sale-order';
import type { Customer, Product } from '@/types/customer-product';
import type { OdooPartnerSearchResult, OdooProductSearchResult, OdooSaleOrderSearchResult } from '@/types/odoo';

type OdooReadSaleOrder = { id: number; name: string; state: string };
type OdooReadPartner = { id: number; name: string; vat?: string; ref?: string };
type OdooReadProduct = { id: number; name: string; default_code?: string; list_price?: number };

type OdooConfig = {
  url: string;
  db: string;
  username: string;
  apiKey: string;
  autoConfirm: boolean;
  mock: boolean;
  useCustomExternalCode: boolean;
};

function getConfig(): OdooConfig {
  return {
    url: process.env.ODOO_URL ?? '',
    db: process.env.ODOO_DB ?? '',
    username: process.env.ODOO_USERNAME ?? '',
    apiKey: process.env.ODOO_API_KEY ?? '',
    autoConfirm: process.env.ODOO_AUTO_CONFIRM === 'true',
    // Mock data only when asked for, and never on production (a missing variable used to turn it on).
    mock: process.env.ODOO_MOCK === 'true' && process.env.NODE_ENV !== 'production',
    useCustomExternalCode: process.env.ODOO_USE_CUSTOM_EXTERNAL_CODE === 'true',
  };
}

const LEGACY_READ_METHODS = new Set(['search_read', 'read', 'search', 'search_count', 'fields_get', 'name_search']);

// Odoo 19's `create` returns a list of ids (batch-style) even for a single-record call.
function normalizeId(raw: number | number[]): number {
  return Array.isArray(raw) ? raw[0] : raw;
}

const MOCK_PARTNERS: OdooPartnerSearchResult[] = [
  { id: 13, name: 'บริษัท ทดสอบ จำกัด', ref: false, vat: '0105559999999', phone: '0812345678', email: 'customer@example.com', street: 'Bangkok, Thailand' },
  { id: 7, name: 'บริษัท ดรีมเมคเกอร์-ไทย คอร์ปอเรชั่น จำกัด', ref: false, vat: false, phone: false, email: false, street: false },
];

const MOCK_PRODUCTS: OdooProductSearchResult[] = [
  { id: 6, name: 'Test Product 001', default_code: 'TEST-PRODUCT-001', list_price: 1000, barcode: false, qty_available: 0 },
  { id: 1, name: 'Tips', default_code: 'TIPS', list_price: 1, barcode: false, qty_available: 0 },
];

const MOCK_SALE_ORDERS: OdooSaleOrderSearchResult[] = [
  { id: 3, name: 'S00003', partner_id: [13, 'บริษัท ทดสอบ จำกัด'], state: 'sale', amount_total: 2140, date_order: '2026-07-04 11:23:11', client_order_ref: 'WEB-SO-20260704-001' },
];

export class OdooService {
  private readonly config = getConfig();
  // `createClient` always speaks plain HTTP; Odoo Online redirects that to HTTPS with a non-XML body.
  private readonly createRpcClient = this.config.url.startsWith('https:') ? xmlrpc.createSecureClient : xmlrpc.createClient;
  private readonly common = this.createRpcClient({ url: `${this.config.url}/xmlrpc/2/common` });
  private readonly object = this.createRpcClient({ url: `${this.config.url}/xmlrpc/2/object` });

  private validateConfig() {
    if (this.config.mock) return;
    const missing = Object.entries(this.config)
      .filter(([key, value]) => ['url', 'db', 'username', 'apiKey'].includes(key) && !value)
      .map(([key]) => key);
    if (missing.length) throw new Error(`Missing Odoo config: ${missing.join(', ')}`);
  }

  authenticate(): Promise<number> {
    this.validateConfig();
    return new Promise((resolve, reject) => {
      this.common.methodCall('authenticate', [this.config.db, this.config.username, this.config.apiKey, {}], (error, uid) => {
        if (error) return reject(error);
        if (!uid) return reject(new Error('Odoo authentication failed'));
        resolve(uid as number);
      });
    });
  }

  executeKw<T>(uid: number, model: string, method: string, args: unknown[] = [], kwargs: Record<string, unknown> = {}) {
    // Safety guard: Odoo is read-only unless ODOO_READ_ONLY=false is set explicitly.
    if (process.env.ODOO_READ_ONLY !== 'false' && !LEGACY_READ_METHODS.has(method)) {
      return Promise.reject(new Error(`Blocked by ODOO_READ_ONLY: ${model}.${method}`));
    }
    return new Promise<T>((resolve, reject) => {
      this.object.methodCall('execute_kw', [this.config.db, uid, this.config.apiKey, model, method, args, kwargs], (error, result) => {
        if (error) return reject(error);
        resolve(result as T);
      });
    });
  }

  async searchPartners(query: string, limit = 20): Promise<OdooPartnerSearchResult[]> {
    if (this.config.mock) {
      const q = query.trim().toLowerCase();
      return q ? MOCK_PARTNERS.filter((p) => p.name.toLowerCase().includes(q)) : MOCK_PARTNERS;
    }
    const uid = await this.authenticate();
    const q = query.trim();
    const domain = q ? [['|', ['name', 'ilike', q], ['vat', 'ilike', q]]] : [[]];
    return this.executeKw<OdooPartnerSearchResult[]>(uid, 'res.partner', 'search_read', domain, {
      fields: ['id', 'name', 'ref', 'vat', 'phone', 'email', 'street'],
      limit,
      order: 'name asc',
    });
  }

  async searchProducts(query: string, limit = 20): Promise<OdooProductSearchResult[]> {
    if (this.config.mock) {
      const q = query.trim().toLowerCase();
      return q ? MOCK_PRODUCTS.filter((p) => p.name.toLowerCase().includes(q) || String(p.default_code).toLowerCase().includes(q)) : MOCK_PRODUCTS;
    }
    const uid = await this.authenticate();
    const q = query.trim();
    const domain = q
      ? [[['sale_ok', '=', true], '|', ['name', 'ilike', q], ['default_code', 'ilike', q]]]
      : [[['sale_ok', '=', true]]];
    return this.executeKw<OdooProductSearchResult[]>(uid, 'product.product', 'search_read', domain, {
      fields: ['id', 'name', 'default_code', 'list_price', 'barcode', 'qty_available'],
      limit,
      order: 'name asc',
    });
  }

  async searchSaleOrders(query: string, limit = 20): Promise<OdooSaleOrderSearchResult[]> {
    if (this.config.mock) {
      const q = query.trim().toLowerCase();
      return q
        ? MOCK_SALE_ORDERS.filter((o) => o.name.toLowerCase().includes(q) || (o.partner_id && o.partner_id[1].toLowerCase().includes(q)))
        : MOCK_SALE_ORDERS;
    }
    const uid = await this.authenticate();
    const q = query.trim();
    const domain = q
      ? [['|', '|', ['name', 'ilike', q], ['partner_id.name', 'ilike', q], ['client_order_ref', 'ilike', q]]]
      : [[]];
    return this.executeKw<OdooSaleOrderSearchResult[]>(uid, 'sale.order', 'search_read', domain, {
      fields: ['id', 'name', 'partner_id', 'state', 'amount_total', 'date_order', 'client_order_ref'],
      limit,
      order: 'date_order desc, id desc',
    });
  }

  async syncCustomer(customer: Customer): Promise<OdooReadPartner> {
    if (this.config.mock) {
      return { id: customer.odooPartnerId ?? Math.floor(Math.random() * 900000) + 100000, name: customer.name, vat: customer.taxId ?? undefined };
    }
    const uid = await this.authenticate();
    const existingId = customer.odooPartnerId ?? await this.findCustomerId(uid, customer);
    const values: Record<string, unknown> = {
      name: customer.name,
      vat: customer.taxId || false,
      phone: customer.phone || false,
      email: customer.email || false,
      street: customer.address || false,
      ref: customer.code,
      customer_rank: 1,
    };
    if (this.config.useCustomExternalCode) values.x_external_code = customer.code;
    const partnerId = existingId || normalizeId(await this.executeKw<number | number[]>(uid, 'res.partner', 'create', [[values]]));
    if (existingId) await this.executeKw<boolean>(uid, 'res.partner', 'write', [[partnerId], values]);
    return this.readPartner(uid, partnerId);
  }

  async deleteCustomer(customer: Customer) {
    if (this.config.mock || !customer.odooPartnerId) return true;
    const uid = await this.authenticate();
    return this.executeKw<boolean>(uid, 'res.partner', 'unlink', [[customer.odooPartnerId]]);
  }

  async findCustomerId(uid: number, customer: Customer) {
    const domain = customer.taxId
      ? [[['vat', '=', customer.taxId]]]
      : [[['ref', '=', customer.code]]];
    const ids = await this.executeKw<number[]>(uid, 'res.partner', 'search', domain, { limit: 1 });
    return ids[0] ?? null;
  }

  async readPartner(uid: number, partnerId: number) {
    const rows = await this.executeKw<OdooReadPartner[]>(uid, 'res.partner', 'read', [[partnerId]], { fields: ['id', 'name', 'vat', 'ref'] });
    return rows[0];
  }

  async findProductByCode(uid: number, productCode: string) {
    const ids = await this.executeKw<number[]>(uid, 'product.product', 'search', [[['default_code', '=', productCode]]], { limit: 1 });
    return ids[0] ?? null;
  }

  async syncProduct(product: Product): Promise<OdooReadProduct> {
    if (this.config.mock) {
      return { id: product.odooProductId ?? Math.floor(Math.random() * 900000) + 100000, name: product.name, default_code: product.code, list_price: product.price };
    }
    const uid = await this.authenticate();
    const existingId = product.odooProductId ?? await this.findProductByCode(uid, product.code);
    const values = {
      name: product.name,
      default_code: product.code,
      barcode: product.barcode || false,
      list_price: product.price,
      sale_ok: product.canBeSold ?? true,
      purchase_ok: product.canBePurchased ?? false,
      type: 'consu',
    };
    const productId = existingId || normalizeId(await this.executeKw<number | number[]>(uid, 'product.product', 'create', [[values]]));
    if (existingId) await this.executeKw<boolean>(uid, 'product.product', 'write', [[productId], values]);
    return this.readProduct(uid, productId);
  }

  async deleteProduct(product: Product) {
    if (this.config.mock || !product.odooProductId) return true;
    const uid = await this.authenticate();
    return this.executeKw<boolean>(uid, 'product.product', 'unlink', [[product.odooProductId]]);
  }

  async readProduct(uid: number, productId: number) {
    const rows = await this.executeKw<OdooReadProduct[]>(uid, 'product.product', 'read', [[productId]], { fields: ['id', 'name', 'default_code', 'list_price'] });
    return rows[0];
  }

  async findSaleOrderByRef(uid: number, orderNo: string) {
    const ids = await this.executeKw<number[]>(uid, 'sale.order', 'search', [[['client_order_ref', '=', orderNo]]], { limit: 1 });
    return ids[0] ?? null;
  }

  async readSaleOrder(uid: number, saleOrderId: number) {
    const rows = await this.executeKw<OdooReadSaleOrder[]>(uid, 'sale.order', 'read', [[saleOrderId]], { fields: ['id', 'name', 'state'] });
    return rows[0];
  }

  async syncSaleOrder(order: SaleOrderWithItems): Promise<OdooReadSaleOrder> {
    if (this.config.mock) {
      return { id: Math.floor(Math.random() * 900000) + 100000, name: `SO-MOCK-${order.orderNo}`, state: this.config.autoConfirm ? 'sale' : 'draft' };
    }
    const uid = await this.authenticate();
    const existingId = await this.findSaleOrderByRef(uid, order.orderNo);
    if (existingId) return this.readSaleOrder(uid, existingId);

    const orderLines = order.items.map((item) => [0, 0, {
      product_id: item.odooProductId,
      name: item.productName,
      product_uom_qty: item.qty,
      price_unit: item.price,
      discount: item.discount,
    }]);

    const saleOrderIdRaw = await this.executeKw<number | number[]>(uid, 'sale.order', 'create', [[{
      partner_id: order.odooPartnerId,
      client_order_ref: order.orderNo,
      origin: order.orderNo,
      note: order.remark || false,
      order_line: orderLines,
    }]]);
    const saleOrderId = normalizeId(saleOrderIdRaw);
    if (this.config.autoConfirm) await this.executeKw<boolean>(uid, 'sale.order', 'action_confirm', [[saleOrderId]]);
    return this.readSaleOrder(uid, saleOrderId);
  }
}
