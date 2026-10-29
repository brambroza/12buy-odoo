/**
 * Evaluates an Odoo Loyalty coupon / promo code against a web cart, so the dealer sees
 * the discount before ordering. Odoo stays the owner of the coupon: the code is applied
 * again on the sale order (see `odoo/loyalty.ts`) and the totals are compared afterwards.
 *
 * Supported: code-triggered programs whose single reward is a discount
 * (percent, fixed amount, per point) on the order, specific products, or the cheapest unit.
 */

export type CouponRule = {
  minimumAmount: number;
  minimumQty: number;
  /** True = any product counts; otherwise products in `productIds` or under `categoryId`. */
  anyProduct: boolean;
  productIds: number[];
  categoryId: number | null;
  /** The rule filters on something the web cannot check (product tag or custom domain). */
  unsupported: boolean;
};

export type CouponReward = {
  type: 'product' | 'discount' | 'shipping';
  description: string;
  discount: number;
  mode: 'percent' | 'per_order' | 'per_point';
  applicability: 'order' | 'cheapest' | 'specific';
  /** 0 = no cap. */
  maxAmount: number;
  /** When `applicability` is `specific`: products in `productIds` or under `categoryId`. */
  productIds: number[];
  categoryId: number | null;
  /** `specific` filters on something the web cannot check (product tag or custom domain). */
  unsupported: boolean;
  requiredPoints: number;
};

/** A code as found in Odoo: either a promo-code rule, or a single coupon card. */
export type CouponDefinition = {
  code: string;
  source: 'rule' | 'card';
  programId: number;
  programName: string;
  programType: string;
  trigger: 'auto' | 'with_code';
  active: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  /** Empty = every pricelist. */
  pricelistIds: number[];
  limitUsage: boolean;
  maxUsage: number;
  usedCount: number;
  card: { points: number; expirationDate: string | null; partnerId: number | null; active: boolean } | null;
  rules: CouponRule[];
  rewards: CouponReward[];
};

/**
 * One cart line as the coupon sees it: `amount` is the line total after any cash discount,
 * `categoryIds` the product category with all its parents.
 */
export type CouponLine = { productId: number; categoryIds: number[]; qty: number; amount: number };

export type CouponContext = { pricelistId: number; partnerId: number | null; /** YYYY-MM-DD */ today: string };

export type CouponResult =
  | { ok: true; discount: number; label: string; programId: number; programName: string }
  | { ok: false; reason: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normalizes what a dealer typed: trims spaces; Odoo compares codes exactly, so case is kept. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').slice(0, 64);
}

/** Why a program cannot be used at all, independent of the cart; null when usable. */
function programProblem(def: CouponDefinition, ctx: CouponContext): string | null {
  if (!def.active) return 'โค้ดนี้ปิดใช้งานแล้ว';
  if (def.source === 'rule' && def.trigger !== 'with_code') return 'โปรโมชันนี้ไม่ต้องใช้โค้ด';
  if (def.dateFrom && ctx.today < def.dateFrom.slice(0, 10)) return `โค้ดนี้เริ่มใช้ได้ ${def.dateFrom.slice(0, 10)}`;
  if (def.dateTo && ctx.today > def.dateTo.slice(0, 10)) return 'โค้ดนี้หมดอายุแล้ว';
  if (def.pricelistIds.length && !def.pricelistIds.includes(ctx.pricelistId)) return 'โค้ดนี้ใช้กับกลุ่มราคาของร้านไม่ได้';
  if (def.limitUsage && def.maxUsage > 0 && def.usedCount >= def.maxUsage) return 'โค้ดนี้ถูกใช้ครบจำนวนแล้ว';
  if (def.card) {
    if (!def.card.active) return 'คูปองนี้ถูกยกเลิกแล้ว';
    if (def.card.expirationDate && ctx.today > def.card.expirationDate) return 'คูปองนี้หมดอายุแล้ว';
    if (def.card.partnerId && def.card.partnerId !== ctx.partnerId) return 'คูปองนี้เป็นของลูกค้ารายอื่น';
  }
  const discounts = def.rewards.filter((r) => r.type === 'discount');
  if (def.rewards.length !== 1 || discounts.length !== 1 || discounts[0].unsupported || def.rules.some((r) => r.unsupported)) return 'คูปองแบบนี้ยังใช้บนเว็บไม่ได้ ติดต่อฝ่ายขาย';
  if (def.card && def.card.points < discounts[0].requiredPoints) return 'คูปองนี้ถูกใช้ไปแล้ว';
  return null;
}

/** Whether a line's product is in a product list or under a category. */
function inScope(line: CouponLine, productIds: number[], categoryId: number | null): boolean {
  return productIds.includes(line.productId) || (categoryId !== null && line.categoryIds.includes(categoryId));
}

/** A promo-code program applies when at least one of its rules is met by the cart. */
function rulesMet(rules: CouponRule[], lines: CouponLine[]): { ok: boolean; minimumAmount: number } {
  if (!rules.length) return { ok: true, minimumAmount: 0 };
  for (const rule of rules) {
    const matching = rule.anyProduct ? lines : lines.filter((l) => inScope(l, rule.productIds, rule.categoryId));
    const amount = matching.reduce((sum, l) => sum + l.amount, 0);
    const qty = matching.reduce((sum, l) => sum + l.qty, 0);
    if (matching.length && amount >= rule.minimumAmount && qty >= Math.max(1, rule.minimumQty)) return { ok: true, minimumAmount: rule.minimumAmount };
  }
  return { ok: false, minimumAmount: Math.min(...rules.map((r) => r.minimumAmount)) };
}

/** Amount the reward is computed on. */
function discountBase(reward: CouponReward, lines: CouponLine[]): number {
  if (reward.applicability === 'specific') return lines.filter((l) => inScope(l, reward.productIds, reward.categoryId)).reduce((sum, l) => sum + l.amount, 0);
  if (reward.applicability === 'cheapest') {
    const units = lines.filter((l) => l.qty > 0).map((l) => l.amount / l.qty);
    return units.length ? Math.min(...units) : 0;
  }
  return lines.reduce((sum, l) => sum + l.amount, 0);
}

/** Readable summary of the reward, e.g. `ลด 5%` or `ลด ฿500`. */
export function rewardLabel(reward: CouponReward): string {
  if (reward.description) return reward.description;
  const target = reward.applicability === 'specific' ? ' สินค้าที่ร่วมรายการ' : reward.applicability === 'cheapest' ? ' ชิ้นที่ถูกที่สุด' : '';
  if (reward.mode === 'percent') return `ลด ${reward.discount}%${target}`;
  return `ลด ฿${reward.discount.toLocaleString('th-TH')}${reward.mode === 'per_point' ? ' ต่อแต้ม' : ''}${target}`;
}

/** Checks the coupon and computes its discount for these lines. Never exceeds the amount it applies to. */
export function evaluateCoupon(def: CouponDefinition, lines: CouponLine[], ctx: CouponContext): CouponResult {
  const problem = programProblem(def, ctx);
  if (problem) return { ok: false, reason: problem };
  if (def.source === 'rule') {
    const met = rulesMet(def.rules, lines);
    if (!met.ok) return { ok: false, reason: met.minimumAmount > 0 ? `ยอดสั่งยังไม่ถึงขั้นต่ำของโค้ด (฿${met.minimumAmount.toLocaleString('th-TH')})` : 'ไม่มีสินค้าที่ร่วมรายการในตะกร้า' };
  }
  const reward = def.rewards[0];
  const base = discountBase(reward, lines);
  if (base <= 0) return { ok: false, reason: 'ไม่มีสินค้าที่ร่วมรายการในตะกร้า' };
  let discount = reward.mode === 'percent' ? base * (reward.discount / 100)
    : reward.mode === 'per_point' ? reward.discount * (def.card?.points ?? 0)
    : reward.discount;
  if (reward.maxAmount > 0) discount = Math.min(discount, reward.maxAmount);
  discount = round2(Math.min(discount, base));
  if (discount <= 0) return { ok: false, reason: 'โค้ดนี้ไม่มีส่วนลดสำหรับตะกร้านี้' };
  return { ok: true, discount, label: rewardLabel(reward), programId: def.programId, programName: def.programName };
}
