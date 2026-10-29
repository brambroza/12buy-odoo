import type { CustomerGroup, PriceBook } from '@/lib/admin/types';
import type { ThaiAddress } from '@/lib/thai-address';

/** Product family a dealer is allowed to buy, derived from the Odoo category suffix. */
export type DealerType = 'CAR' | 'TRUCK' | 'MOTORCYCLE' | 'BATTERY' | 'WHEEL';

export type DealerTier = 'S' | 'M' | 'L';

export const DEALER_TYPE_LABELS: Record<DealerType, string> = {
  CAR: 'ยางรถยนต์',
  TRUCK: 'ยางรถบรรทุก',
  MOTORCYCLE: 'ยางมอเตอร์ไซค์',
  BATTERY: 'แบตเตอรี่',
  WHEEL: 'กระทะล้อ',
};

export const DEALER_TIER_LABELS: Record<DealerTier, string> = { S: 'ดีลเลอร์เล็ก', M: 'ดีลเลอร์กลาง', L: 'ดีลเลอร์ใหญ่' };

/** Tire size parsed out of an Odoo product name. */
export type ParsedSize = {
  /** Canonical label, e.g. `195/65R15`, `11R22.5`, `2.75-17`. */
  label: string;
  /** Digits only, used for fuzzy matching, e.g. `1956515`. */
  digits: string;
  rim: string;
};

/** Product as shown in the dealer catalog (read from Odoo, never written). */
export type CatalogProduct = {
  id: number;
  tmplId: number;
  name: string;
  code: string;
  listPrice: number;
  categoryId: number;
  categoryName: string;
  brand: string;
  dealerType: DealerType;
  size: ParsedSize | null;
  qtyAvailable: number;
  imageUrl: string | null;
  /** Thai label of the base unit (เส้น / ลูก / วง). */
  baseUnit: string;
  /** Units the dealer may order in; index 0 is always the base unit (factor 1). */
  units: { id: number; name: string; factor: number }[];
  /** Sales VAT from the product's Odoo taxes (e.g. 7); 0 = no VAT. */
  vatRate: number;
  /** True when prices already include that VAT (Odoo tax "7% (Inc)"); false = Odoo adds it on top. */
  vatIncluded: boolean;
};

/** Mock dealer profile stored in a cookie for the prototype. */
export type DealerProfile = {
  /** Web dealer record id; null for the demo profile. Drives the web credit line. */
  dealerId: string | null;
  name: string;
  types: DealerType[];
  tier: DealerTier;
  province: string;
  pricelistId: number;
  address: string;
  /** Structured delivery address when the dealer has saved one (drives the picker defaults). */
  shipping: ThaiAddress | null;
  /** Contact phone for deliveries. */
  phone: string;
  /** Published web price book assigned by admin; null = use Odoo pricelist directly. */
  priceBookId: string | null;
  /** Odoo partner id when the profile was opened from the admin dealer list. */
  odooPartnerId: number | null;
  /** Credit customer: may choose credit terms at checkout, or pay cash for an end-of-bill discount. */
  credit: boolean;
  /** Odoo cash pricelist paired with `pricelistId`; the price difference is the cash discount. */
  cashPricelistId: number | null;
  /** Customer group that narrows which products this dealer sees; null = all products of `types`. */
  customerGroupId: string | null;
  /** Profile picture file name in the `avatars` bucket; null = none. */
  avatarFile: string | null;
  /** Resolved per request from the admin settings (never stored in the impersonation cookie). */
  priceBook?: PriceBook | null;
  /** Resolved per request from the admin settings (never stored in the impersonation cookie). */
  customerGroup?: CustomerGroup | null;
};

/** CASH = transfer + slip before confirmation; CREDIT = billed on the dealer's payment term, no slip. */
export type PaymentMethod = 'CASH' | 'CREDIT';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { CASH: 'เงินสด (โอนแล้วแนบสลิป)', CREDIT: 'เครดิต (วางบิลตามเทอม)' };

/** `qty` is always in base units; `unitId`/`unitQty` remember the pack the dealer chose, if any. */
export type CartItem = { productId: number; qty: number; unitId?: number | null; unitQty?: number | null; unitName?: string | null };

export type OrderStatus = 'PENDING' | 'PREPARING' | 'SHIPPED' | 'INVOICED' | 'PAID' | 'CANCELLED';

export const ORDER_STATUS_FLOW: OrderStatus[] = ['PENDING', 'PREPARING', 'SHIPPED', 'INVOICED', 'PAID'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'รอยืนยัน',
  PREPARING: 'กำลังจัดสินค้า',
  SHIPPED: 'จัดส่งแล้ว',
  INVOICED: 'วางบิลแล้ว',
  PAID: 'ชำระแล้ว',
  CANCELLED: 'ยกเลิก',
};

export type OrderLine = {
  productId: number;
  name: string;
  code: string;
  size: string | null;
  /** Base units (เส้น). */
  qty: number;
  unitPrice: number;
  /** Pack chosen by the dealer, when not the base unit. */
  unitName?: string | null;
  unitQty?: number | null;
  /** Odoo uom id to send as `product_uom_id` on the sale order line. */
  unitId?: number | null;
  /** Cash discount per base unit when this line is paid cash (0 for non-credit dealers). */
  cashDiscountPerUnit?: number;
  /** VAT of the product at order time (see CatalogProduct). Older orders have none = included. */
  vatRate?: number;
  vatIncluded?: boolean;
};

export type OrderCoupon = { code: string; programId: number; programName: string; label: string; discount: number };

/** Result of pushing an order to Odoo. MISMATCH = SO created but its total differs from the web total. */
export type OdooSync = {
  status: 'SYNCED' | 'MISMATCH' | 'FAILED';
  saleOrderId: number | null;
  saleOrderName: string | null;
  amountTotal: number | null;
  error: string | null;
  at: string;
  /** Last read of delivery/invoice progress from Odoo (status sync). */
  progress?: {
    deliveryStatus: 'pending' | 'started' | 'partial' | 'full' | false;
    invoices: { name: string; paymentState: string; amountResidual: number; dueDate: string | null }[];
    checkedAt: string;
  };
};

export type ProtoOrder = {
  id: string;
  ref: string;
  sessionId: string;
  dealerName: string;
  status: OrderStatus;
  lines: OrderLine[];
  /** Sum of lines before the end-of-bill discount. */
  subtotal: number;
  /** End-of-bill discount: credit dealer paying cash gets the credit→cash price difference. */
  cashDiscount: number;
  /** Odoo Loyalty code used on this order and the discount the web computed for it. */
  coupon?: OrderCoupon | null;
  /** Discount from `coupon` (0 when none). */
  couponDiscount: number;
  /** Amount due = subtotal − cashDiscount − couponDiscount. */
  total: number;
  /** Odoo pricelist of the published price book the dealer bought from; set on the SO so Odoo recomputes with web prices. */
  odooPricelistId?: number | null;
  paymentMethod: PaymentMethod;
  address: string;
  carrier: string;
  note: string;
  /** Dealer's own purchase-order number, optional (older orders have none). */
  poRef?: string;
  trackingRef: string | null;
  /** Bank-transfer slip attached by the dealer and verified by admin before confirmation. */
  payment: { slipFile: string | null; slipUploadedAt: string | null; verifiedAt: string | null };
  createdAt: string;
  events: { status: OrderStatus; at: string }[];
  /** Last push to Odoo; absent until the order is confirmed. */
  odoo?: OdooSync;
};
