import type { CustomerGroup, PriceBook, ProductCashDiscount } from '@/lib/admin/types';
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
  /** Odoo sales tax ids (`taxes_id`), sent on the end-of-bill cash discount line. */
  taxIds?: number[];
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
  /**
   * Odoo pricelist per product family set for this dealer (e.g. motorcycle tyres on the big-dealer
   * pricelist, car tyres on the small-dealer one). Wins over the web price book and `pricelistId`;
   * families left out keep the normal rules.
   */
  typePricelists?: TypePricelists;
  /** Cash pricelist paired with each `typePricelists` entry (credit dealers only), for the cash discount. */
  typeCashPricelists?: TypePricelists;
  /** Cash discount % of `pricelistId` (credit dealers only); wins over `cashPricelistId`. */
  cashPercent?: number | null;
  /** Cash discount % of each family's own pricelist (credit dealers only); wins over that pricelist's pair. */
  typeCashPercents?: TypeCashPercents;
  /** Cash discount % set on the dealer per family (credit dealers only); wins over everything else, 0 = none. */
  dealerCashPercents?: TypeCashPercents;
  /** Resolved per request from the admin settings (credit dealers only): cash discount per product template id. */
  productCashDiscounts?: Record<string, ProductCashDiscount>;
  /** Customer group that narrows which products this dealer sees; null = all products of `types`. */
  customerGroupId: string | null;
  /** Profile picture file name in the `avatars` bucket; null = none. */
  avatarFile: string | null;
  /** Resolved per request from the admin settings (never stored in the impersonation cookie). */
  priceBook?: PriceBook | null;
  /** Resolved per request from the admin settings (never stored in the impersonation cookie). */
  customerGroup?: CustomerGroup | null;
};

/** Odoo pricelist id per product family; a missing family means "use the dealer's normal price". */
export type TypePricelists = Partial<Record<DealerType, number>>;

/** Cash discount % per product family; a missing family falls back to the pricelist rules. */
export type TypeCashPercents = Partial<Record<DealerType, number>>;

/** CASH = transfer + slip before confirmation; CREDIT = billed on the dealer's payment term, no slip. */
export type PaymentMethod = 'CASH' | 'CREDIT';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = { CASH: 'เงินสด (โอนแล้วแนบสลิป)', CREDIT: 'เครดิต' };

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
  /** Cash discount % behind `cashDiscountPerUnit`; absent when it came from a credit/cash pricelist pair. */
  cashDiscountPercent?: number;
  /** Odoo sales tax ids of the product at order time, for the end-of-bill cash discount line. */
  taxIds?: number[];
  /** VAT of the product at order time (see CatalogProduct). Older orders have none = included. */
  vatRate?: number;
  vatIncluded?: boolean;
};

export type OrderCoupon = { code: string; programId: number; programName: string; label: string; discount: number };

export type CreditPaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';

export const CREDIT_PAYMENT_STATUS_LABELS: Record<CreditPaymentStatus, string> = { PENDING: 'รอตรวจ', VERIFIED: 'ตรวจแล้ว', REJECTED: 'ไม่ผ่าน' };

/** Note posted to Odoo's chatter (SO and invoice) for one credit payment event; `error` set when it could not be posted. */
export type CreditPaymentOdooLog = {
  /** `mail.message` id on the sale order, null when posting failed. */
  messageId: number | null;
  /** `mail.message` id on the customer invoice, null when there is no invoice or posting failed. */
  invoiceMessageId: number | null;
  error: string | null;
  at: string;
};

/**
 * A transfer the dealer reports against a confirmed CREDIT order (per-order payment from the dealer screen).
 * Admin checks it; accounting still registers the payment in Odoo, which is what moves the order to PAID.
 */
export type CreditPayment = {
  id: string;
  slipFile: string;
  /** Amount the dealer says was transferred (baht). */
  amount: number;
  note: string;
  uploadedAt: string;
  status: CreditPaymentStatus;
  reviewedAt: string | null;
  rejectReason?: string | null;
  /** Last chatter note for this payment (submitted / verified / rejected). */
  odoo?: CreditPaymentOdooLog | null;
};

/** Result of pushing an order to Odoo. MISMATCH = SO created but its total differs from the web total. */
export type OdooSync = {
  status: 'SYNCED' | 'MISMATCH' | 'FAILED';
  saleOrderId: number | null;
  saleOrderName: string | null;
  amountTotal: number | null;
  error: string | null;
  /** Draft customer invoice made right after the SO is confirmed (name stays null until accounting posts it). */
  invoice?: { id: number; name: string | null; state: string } | null;
  /** Why the draft invoice could not be made; the SO itself is in Odoo. */
  invoiceError?: string | null;
  at: string;
  /** Result of cancelling the SO in Odoo after a web cancel (absent until the admin cancels). */
  cancel?: { ok: boolean; at: string; note?: string; error?: string } | null;
  /** Last read of delivery/invoice progress from Odoo (status sync). */
  progress?: {
    deliveryStatus: 'pending' | 'started' | 'partial' | 'full' | false;
    invoices: { name: string; paymentState: string; amountResidual: number; dueDate: string | null }[];
    checkedAt: string;
  };
};

/** Who performed a status change (null id = system / Odoo). */
export type OrderActor = { id: string | null; name: string };

export type OrderEvent = { status: OrderStatus; at: string; by?: OrderActor };

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
  /** Delivery method name as shown to the dealer. */
  carrier: string;
  /** Odoo `delivery.carrier` id, set on the SO as `carrier_id` (null on orders from before it was stored). */
  carrierId?: number | null;
  note: string;
  /** Dealer's own purchase-order number, optional (older orders have none). */
  poRef?: string;
  trackingRef: string | null;
  /**
   * Bank-transfer slip attached by the dealer and verified by admin before confirmation (cash orders).
   * `credits`: transfers reported against a confirmed credit order, newest last.
   */
  payment: { slipFile: string | null; slipUploadedAt: string | null; verifiedAt: string | null; credits?: CreditPayment[] };
  createdAt: string;
  /** Status history. `by` is who moved it: a user, or `{ id: null, name: 'Odoo' }` for the status sync. */
  events: OrderEvent[];
  /** Last push to Odoo; absent until the order is confirmed. */
  odoo?: OdooSync;
};
