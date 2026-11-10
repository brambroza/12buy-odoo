/**
 * Types of the sales commission module (schema: `supabase/migrations/20261104120000_commission.sql`).
 * Dates are `YYYY-MM-DD` strings (Postgres DATE), periods `YYYY-MM` (the month the period ends in).
 */

export type PriceGroup = 'RETAIL' | 'WHOLESALE' | 'OTHER';
export type RateKind = 'PERCENT' | 'PER_UNIT';
export type RunStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'PAID';
export type LedgerKind = 'COLLECTION' | 'RETRO';
/** Where the rep of a line came from: the customer's "Sale …" tag, else the salesperson of the invoice / sale order / customer. */
export type OwnerFrom = 'tag' | 'invoice' | 'order' | 'partner' | 'none';
/** Where the pricelist of a line came from: its sale order, or the customer's default pricelist. */
export type PricelistFrom = 'order' | 'partner' | 'none';
/** Cash sale (invoice due the day it is issued, e.g. "Immediate Payment") or credit sale. */
export type PaymentKind = 'CASH' | 'CREDIT';

export const PRICE_GROUP_LABELS: Record<PriceGroup, string> = { RETAIL: 'ราคาปลีก', WHOLESALE: 'ราคาส่ง', OTHER: 'อื่นๆ' };
export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = { CASH: 'เงินสด', CREDIT: 'เครดิต' };

/**
 * One row of the per-rep commission statement (e.g. "คอมมิชชั่นค้าปลีก PCR เงินสด"). A commission
 * line goes to the first row whose family / price group / cash-credit match ('*' = any).
 */
/** A statement row. With `pricelistId` it catches only that Odoo pricelist (priceGroup is then '*'). */
export type SummaryLine = { key: string; label: string; family: string; priceGroup: PriceGroup | '*'; paymentKind: PaymentKind | '*'; pricelistId?: number | null; pricelistName?: string | null };

/** Statement settings of a company (stored on CommissionSource). */
export type StatementSettings = {
  summaryLines: SummaryLine[];
  /** % of the statement total kept for the central fund ("หัก ส่วนกลาง 5%"). */
  centralPercent: number;
  /** An invoice still unpaid this many days after its due date is held against its rep. */
  debtDays: number;
  /** % of the unpaid amount before VAT held per overdue invoice (given back when it is collected). */
  debtPercent: number;
};
export const RATE_KIND_LABELS: Record<RateKind, string> = { PERCENT: '% ของยอดก่อน VAT', PER_UNIT: 'บาท/หน่วย' };
export const RUN_STATUS_LABELS: Record<RunStatus, string> = { DRAFT: 'ร่าง', PENDING_APPROVAL: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', PAID: 'จ่ายแล้ว' };
/** Badge colours per run status (Tailwind classes). */
export const RUN_STATUS_TONE: Record<RunStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  PENDING_APPROVAL: 'bg-amber-500/15 text-amber-800',
  APPROVED: 'bg-primary/10 text-primary',
  PAID: 'bg-emerald-500/15 text-emerald-700',
};
export const OWNER_FROM_LABELS: Record<OwnerFrom, string> = { tag: 'tag ลูกค้า', invoice: 'Salesperson ใบแจ้งหนี้', order: 'Salesperson ใบสั่งขาย', partner: 'Salesperson ลูกค้า', none: '—' };

/**
 * One step of the sales-bonus ladder: collections before VAT of at least `minAmount` earn `bonus`.
 * With `salary` set on the ladder, the bonus is instead `salary` − the rep's salary of the period.
 */
export type BonusTier = { minAmount: number; bonus: number; salary?: number };

/** What the bonus ladder is measured on: collections (gated by the target) or confirmed sale orders (no gate). */
export type BonusBase = 'COLLECTION' | 'SALE_ORDER' | 'INVOICE';

/** True for a ladder measured on sales documents (invoices or sale orders): no target gate. */
export const isSalesBase = (base: BonusBase | undefined): base is 'SALE_ORDER' | 'INVOICE' => base === 'SALE_ORDER' || base === 'INVOICE';
/** What the ladder is measured on, and the document it counts, in Thai. */
export const BONUS_BASE_LABELS: Record<BonusBase, string> = { COLLECTION: 'ยอดเก็บ', SALE_ORDER: 'ยอดขายใบสั่งขาย', INVOICE: 'ยอดขายตามใบแจ้งหนี้' };
export const BONUS_DOC_LABELS: Record<BonusBase, string> = { COLLECTION: 'รายการเงินเข้า', SALE_ORDER: 'ใบสั่งขาย', INVOICE: 'ใบแจ้งหนี้ / ใบลดหนี้' };

/**
 * A sales document behind the incentive (table CommissionSaleOrder, migration 20261110150000): a
 * confirmed sale order, or with the invoice base a posted invoice (credit notes negative).
 */
export type SaleOrder = {
  orderId: number; orderName: string; orderDate: string; partnerName: string;
  odooUserId: number | null; repName: string | null; amountUntaxed: number; amountTotal: number; period: string;
};

/** Bonuses paid on top of commission (stored on CommissionSource, migration 20261106150000). */
export type BonusSettings = {
  /** Base of the ladder; 'COLLECTION' until migration 20261110150000 and when not changed. */
  bonusBase: BonusBase;
  /** Sales-bonus ladder ("เงินพิเศษ"); a rep gets the bonus of the highest tier reached. */
  bonusTiers: BonusTier[];
  /** Baht per new customer. */
  newCustomerBonus: number;
  /** Customers created in Odoo on or after this day can count as new; null = no new-customer bonus. */
  newCustomerFrom: string | null;
};

export type CommissionSource = {
  id: string;
  name: string;
  url: string;
  db: string;
  username: string;
  apiKeyEnc: string;
  cutoffDay: number;
  /** Default pay day: day of month (0 = last day), `payMonths` months after the period's month. */
  payDay: number;
  payMonths: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
} & StatementSettings & BonusSettings;

/**
 * A customer counted as new: its first-ever invoice had cash in `period`. Counted once per company
 * (a later pull of the same period recomputes the period's own rows).
 */
export type NewCustomer = {
  id: string;
  sourceId: string;
  odooPartnerId: number;
  partnerName: string;
  partnerCreated: string | null;
  invoiceId: number;
  invoiceName: string;
  cashDate: string;
  odooUserId: number | null;
  repName: string | null;
  period: string;
};

/**
 * A rep. `odooUserId` is the rep key used by every commission table: −tag id for a customer tag
 * "Sale …" (the real salesperson), the Odoo user id for a salesperson fallback (see ledger.ts).
 */
export type CommissionRep = { id: string; sourceId: string; odooUserId: number; name: string; userId: string | null; active: boolean };

export type CommissionPricelist = {
  id: string;
  sourceId: string;
  odooPricelistId: number;
  name: string;
  priceGroup: PriceGroup;
  isSpecial: boolean;
  /** % of the normal commission paid on special-price lines (50 = half). */
  specialPercent: number;
};

export type CommissionRate = {
  id: string;
  sourceId: string;
  /** '*' = any brand. */
  brand: string;
  /** '*' = any product family (PCR, TBR, ...). */
  family: string;
  priceGroup: PriceGroup | '*';
  /** Set for a rate on one Odoo pricelist, which beats the price group (priceGroup is then '*'). */
  odooPricelistId: number | null;
  pricelistName: string | null;
  /** Set for a per-product override, which beats brand/family/group. */
  odooProductId: number | null;
  productName: string | null;
  kind: RateKind;
  /** Percent (0.9 = 0.9%) or baht per unit. */
  value: number;
  validFrom: string;
  validTo: string | null;
  note: string | null;
};

export type OverdueStep = { id: string; sourceId: string; minDays: number; maxDays: number | null; percent: number; validFrom: string; validTo: string | null };

export type CommissionTarget = { id: string; sourceId: string; odooUserId: number; period: string; amount: number };
/** A rep's salary in a period (table CommissionSalary, migration 20261110120000), for the sales bonus. */
export type CommissionSalary = { odooUserId: number; period: string; amount: number };

/** One invoice line's share of one receipt (cash in), or a correction of a locked period. */
export type LedgerLine = {
  kind: LedgerKind;
  /** Period the cash belongs to (for RETRO: the locked period being corrected). */
  originPeriod: string;
  /** Stable id of the receipt × invoice line, e.g. `P12:R34:L56`. */
  lineKey: string;
  receiptName: string;
  cashDate: string;
  partnerName: string;
  invoiceId: number | null;
  invoiceName: string | null;
  invoiceDate: string | null;
  dueDate: string | null;
  overdueDays: number | null;
  paymentKind: PaymentKind;
  odooUserId: number | null;
  repName: string | null;
  ownerFrom: OwnerFrom;
  pricelistId: number | null;
  pricelistName: string | null;
  pricelistFrom: PricelistFrom;
  productId: number | null;
  productName: string | null;
  brand: string;
  family: string;
  qty: number;
  /** Allocated amount before VAT. */
  base: number;
  /** Allocated amount including VAT (what the customer paid). */
  gross: number;
  issues: string[];
};

export type StoredLedgerLine = LedgerLine & { id: string; sourceId: string; period: string };

export type CommissionAdjustment = { id: string; runId: string; odooUserId: number; amount: number; reason: string; createdById: string | null; createdAt: Date };

/**
 * Amount held from a rep because an invoice stayed unpaid more than `debtDays` after its due date
 * ("หัก ลูกหนี้ค้างชำระ"). Held once, in `heldPeriod`; given back in the period the cash comes in
 * ("คืนเงินลูกหนี้ค้างชำระ"), recorded as `releasedPeriod`.
 */
export type DebtHold = {
  id: string;
  sourceId: string;
  invoiceId: number;
  invoiceName: string;
  partnerName: string;
  dueDate: string;
  odooUserId: number | null;
  repName: string | null;
  /** Unpaid amount before VAT when held. */
  residualBase: number;
  percent: number;
  amount: number;
  heldPeriod: string;
  releasedPeriod: string | null;
};

/** Result of one line after rules are applied. */
export type LineResult = {
  lineKey: string;
  odooUserId: number | null;
  rateId: string | null;
  rateLabel: string;
  specialPercent: number;
  stepPercent: number;
  commission: number;
  /** Statement row the line is counted in. */
  summaryKey?: string;
  /** Commission at the rate (× special %) before the overdue step, and the step range used (null = none). */
  beforeStep?: number;
  stepRange?: { minDays: number; maxDays: number | null } | null;
  /** No overdue step was set up for the cash date, so the line is paid at 100%. */
  noSteps?: boolean;
};

/** A rep's commission per overdue step: how late the money came in and what that did to the pay. */
export type StepAmount = { minDays: number | null; maxDays: number | null; percent: number; base: number; lines: number; beforeStep: number; commission: number; noSteps?: boolean };

/** One row of a rep's statement. */
/** A statement row's commission, with its base before VAT and the rates used (from the rates tab). */
export type SummaryAmount = { key: string; label: string; amount: number; base?: number; rates?: string[] };

/** Why collected money earned no commission. */
export type ExcludedReason = 'NO_RATE' | 'OVERDUE' | 'NO_PRODUCT';
export const EXCLUDED_LABELS: Record<ExcludedReason, string> = {
  NO_RATE: 'ไม่มีอัตราค่าคอม',
  OVERDUE: 'จ่ายช้าเกินขั้นบันได (ได้ 0%)',
  NO_PRODUCT: 'บิลไม่มีรายการสินค้า',
};
export type ExcludedAmount = { reason: ExcludedReason; base: number; lines: number };

/** A credit note issued in the period, shown next to the rep's figures (not deducted). */
export type CreditNote = {
  id: number;
  name: string;
  date: string;
  partnerName: string;
  /** Invoice it reverses, when Odoo links one. */
  originName: string | null;
  odooUserId: number | null;
  repName: string | null;
  /** Amount before VAT (positive). */
  base: number;
  gross: number;
};

/** Result per rep for a run. */
export type RepResult = {
  odooUserId: number;
  repName: string;
  base: number;
  gross: number;
  lines: number;
  /** null = no target set (blocks submitting the run). */
  target: number | null;
  targetMet: boolean;
  /** Commission after the target gate (sum of `summary`). */
  commission: number;
  /** Collected base that earned commission (before the target gate) and what did not, by reason. */
  counted?: number;
  excluded?: ExcludedAmount[];
  /** Commission the lines earned before the target gate (equals `commission` when the target is met). */
  commissionBeforeTarget?: number;
  /** Credit notes issued this period for this rep's customers: shown only, never deducted. */
  creditNoteBase?: number;
  creditNoteCount?: number;
  /** Lines with a rate, grouped by the overdue step they fell in (before the target gate). */
  steps?: StepAmount[];
  /** Commission per statement row, in statement order. */
  summary: SummaryAmount[];
  /** Holds given back this period because the overdue invoice was collected. */
  debtRelease: number;
  /** commission + debtRelease ("รวม" on the statement). */
  subtotal: number;
  centralPercent: number;
  /** Central fund deduction (positive number, subtracted). */
  central: number;
  /** Overdue-invoice holds taken this period (positive number, subtracted). */
  debtHold: number;
  adjustments: number;
  /** Negative balance carried from the previous period. */
  carryIn: number;
  /** Sales bonus of the tier reached (0 when the target is missed), added after the deductions. */
  tierBonus?: number;
  /** The tier reached: its number (1 = lowest) and minimum; null = below the first tier. */
  tier?: { index: number; minAmount: number; salary?: number } | null;
  /** With a sale-order ladder: the rep's confirmed sale orders before VAT and their count. */
  saleOrderBase?: number;
  saleOrderCount?: number;
  /** Base the tier was picked on (missing = collections). */
  bonusBase?: BonusBase;
  /** The rep's salary of the period (null = not set), when the ladder pays by salary. */
  salary?: number | null;
  /** New customers of the period and their bonus (0 when the target is missed), added after the deductions. */
  newCustomers?: { partnerName: string; invoiceName: string }[];
  newCustomerBonus?: number;
  payable: number;
  /** Negative balance carried to the next period. */
  carryOut: number;
};

export type RunResults = {
  reps: RepResult[];
  lines: LineResult[];
  /** Human-readable problems that must be fixed or accepted before the run is submitted. */
  issues: { lineKey?: string; message: string }[];
  /** Base of lines that no rep owns (not paid to anyone). */
  unassignedBase: number;
  /** Cash applied to something other than an invoice (deposits, write-offs), with VAT; paid to no one. */
  notInvoiceGross?: number;
  /** Credit notes issued in the period (shown only), and money refunded to customers. */
  credits?: CreditNote[];
  refunds?: { count: number; amount: number };
  totalPayable: number;
};

export type CommissionRun = {
  id: string;
  sourceId: string;
  period: string;
  status: RunStatus;
  syncedAt: Date | null;
  calculatedAt: Date | null;
  snapshot: RunSnapshot | null;
  results: RunResults | null;
  totalPayable: number;
  submittedById: string | null;
  submittedAt: Date | null;
  approvedById: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Rules a run was calculated with, kept so an approved run can always be explained. */
export type RunSnapshot = {
  rates: CommissionRate[];
  steps: OverdueStep[];
  pricelists: CommissionPricelist[];
  targets: CommissionTarget[];
  /** Rep salaries of the period (missing in runs calculated before salaries existed). */
  salaries?: CommissionSalary[];
  adjustments: CommissionAdjustment[];
  /** Statement rows and deductions in force (missing in runs calculated before statements existed). */
  statement?: StatementSettings;
  /** Holds taken or given back in this period. */
  holds?: DebtHold[];
  /** Credit notes and customer refunds of the period, read from Odoo when calculating. */
  credits?: CreditNote[];
  refunds?: { count: number; amount: number };
  /** Bonus ladder and new-customer amount in force, and the period's new customers. */
  bonus?: BonusSettings;
  newCustomers?: NewCustomer[];
  /** The period's confirmed sale orders, when the ladder is on sale orders. */
  saleOrders?: SaleOrder[];
};
