/**
 * Evaluates an Odoo Loyalty coupon / promo code against a web cart, so the dealer sees
 * the discount before ordering. Odoo stays the owner of the coupon: the code is applied
 * again on the sale order (see `odoo/loyalty.ts`) and the totals are compared afterwards.
 *
 * Supported: code-triggered programs whose single reward is a discount
 * (percent, fixed amount, per point) on the order, specific products, or the cheapest unit.
 * Automatic promotions (no code, e.g. "AS-MC ครบ 25,000 ลด 4%") use the same evaluator through
 * `evaluatePromotions`: only the one with the biggest discount is applied.
 */

export type CouponRule = {
  minimumAmount: number;
  /** Whether `minimumAmount` counts VAT (Odoo `minimum_amount_tax_mode`); absent = incl. */
  minimumAmountTaxMode?: 'incl' | 'excl';
  minimumQty: number;
  /** True = any product counts; otherwise products in `productIds` or under `categoryId`. */
  anyProduct: boolean;
  productIds: number[];
  categoryId: number | null;
  /** The rule filters on something the web cannot check (product tag or custom domain). */
  unsupported: boolean;
};

export type CouponReward = {
  /** Odoo `loyalty.reward` id (absent in older cached definitions). */
  id?: number;
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
 * One cart line as the coupon sees it: `amount` is what the discount is computed on (the line
 * after cash/freight discounts and earlier rewards, VAT included, as on the Odoo SO),
 * `categoryIds` the product category with all its parents. `thresholdIncl`/`thresholdExcl` are the
 * line at full price with/without VAT, which Odoo checks a rule's minimum amount against
 * (the end-of-bill discount lines are not products of the rule); absent = `amount`.
 */
export type CouponLine = { productId: number; categoryIds: number[]; qty: number; amount: number; thresholdIncl?: number; thresholdExcl?: number };

export type CouponContext = { pricelistId: number; partnerId: number | null; /** YYYY-MM-DD */ today: string };

export type CouponResult =
  | { ok: true; discount: number; label: string; programId: number; programName: string; rewardId?: number | null }
  | { ok: false; reason: string };

/** The automatic promotion applied to a cart, plus the next better one the dealer could reach. */
export type PromotionOutcome = {
  applied: { programId: number; rewardId: number | null; programName: string; label: string; discount: number } | null;
  /** A better promotion the cart is short of: `remaining` baht more of the rule's products. */
  next: { programId: number; programName: string; label: string; remaining: number } | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Normalizes what a dealer typed: trims spaces; Odoo compares codes exactly, so case is kept. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, '').slice(0, 64);
}

/** Why a program cannot be used at all, independent of the cart; null when usable. */
function programProblem(def: CouponDefinition, ctx: CouponContext, trigger: CouponDefinition['trigger'] = 'with_code'): string | null {
  if (!def.active) return 'โค้ดนี้ปิดใช้งานแล้ว';
  if (def.source === 'rule' && def.trigger !== trigger) return trigger === 'with_code' ? 'โปรโมชันนี้ไม่ต้องใช้โค้ด' : 'โปรโมชันนี้ต้องใช้โค้ด';
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

/** Amount of these lines that counts toward a rule's minimum (full price, with or without VAT). */
function thresholdAmount(rule: CouponRule, lines: CouponLine[]): number {
  return lines.reduce((sum, l) => sum + ((rule.minimumAmountTaxMode === 'excl' ? l.thresholdExcl : l.thresholdIncl) ?? l.amount), 0);
}

/**
 * A program applies when at least one of its rules is met by the cart.
 * `remaining` = the least extra amount of a rule's products that would meet one (0 when met).
 */
function rulesMet(rules: CouponRule[], lines: CouponLine[]): { ok: boolean; minimumAmount: number; remaining: number; hasMatching: boolean } {
  if (!rules.length) return { ok: true, minimumAmount: 0, remaining: 0, hasMatching: true };
  let remaining = Infinity;
  let hasMatching = false;
  for (const rule of rules) {
    const matching = rule.anyProduct ? lines : lines.filter((l) => inScope(l, rule.productIds, rule.categoryId));
    const amount = round2(thresholdAmount(rule, matching));
    const qty = matching.reduce((sum, l) => sum + l.qty, 0);
    if (matching.length && amount >= rule.minimumAmount && qty >= Math.max(1, rule.minimumQty)) return { ok: true, minimumAmount: rule.minimumAmount, remaining: 0, hasMatching: true };
    if (matching.length) hasMatching = true;
    // Only rules short on amount can be reached by adding more; a quantity rule gives no baht hint.
    if (matching.length && qty >= Math.max(1, rule.minimumQty)) remaining = Math.min(remaining, round2(rule.minimumAmount - amount));
  }
  return { ok: false, minimumAmount: Math.min(...rules.map((r) => r.minimumAmount)), remaining, hasMatching };
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

/** Discount of the program's single reward on these lines, capped at its max and at the amount it applies to. */
function rewardDiscount(def: CouponDefinition, lines: CouponLine[]): number {
  const reward = def.rewards[0];
  const base = discountBase(reward, lines);
  if (base <= 0) return 0;
  let discount = reward.mode === 'percent' ? base * (reward.discount / 100)
    : reward.mode === 'per_point' ? reward.discount * (def.card?.points ?? 0)
    : reward.discount;
  if (reward.maxAmount > 0) discount = Math.min(discount, reward.maxAmount);
  return round2(Math.max(0, Math.min(discount, base)));
}

/** Checks the coupon and computes its discount for these lines. Never exceeds the amount it applies to. */
export function evaluateCoupon(def: CouponDefinition, lines: CouponLine[], ctx: CouponContext): CouponResult {
  const problem = programProblem(def, ctx);
  if (problem) return { ok: false, reason: problem };
  if (def.source === 'rule') {
    const met = rulesMet(def.rules, lines);
    if (!met.ok) return { ok: false, reason: met.minimumAmount > 0 ? `ยอดสั่งยังไม่ถึงขั้นต่ำของโค้ด (฿${met.minimumAmount.toLocaleString('th-TH')})` : 'ไม่มีสินค้าที่ร่วมรายการในตะกร้า' };
  }
  if (discountBase(def.rewards[0], lines) <= 0) return { ok: false, reason: 'ไม่มีสินค้าที่ร่วมรายการในตะกร้า' };
  const discount = rewardDiscount(def, lines);
  if (discount <= 0) return { ok: false, reason: 'โค้ดนี้ไม่มีส่วนลดสำหรับตะกร้านี้' };
  return { ok: true, discount, label: rewardLabel(def.rewards[0]), programId: def.programId, programName: def.programName, rewardId: def.rewards[0].id ?? null };
}

/**
 * Automatic promotions (Odoo `trigger = auto`, no code) for this cart. Only the one with the biggest
 * discount is applied (tiers such as ครบ 25,000 ลด 4% / ครบ 70,000 ลด 8.5% do not add up); ties go
 * to the lower program id. `next` is the nearest promotion with a bigger reward that the cart is short
 * of, when the cart already holds some of its products. Programs the web cannot evaluate are skipped.
 * `lines` are the lines after the applied promotion, for a coupon computed afterwards.
 */
export function evaluatePromotions(defs: CouponDefinition[], lines: CouponLine[], ctx: CouponContext): PromotionOutcome & { lines: CouponLine[] } {
  let best: { def: CouponDefinition; discount: number } | null = null;
  const short: { def: CouponDefinition; remaining: number }[] = [];
  for (const def of [...defs].sort((a, b) => a.programId - b.programId)) {
    if (programProblem(def, ctx, 'auto')) continue;
    const met = rulesMet(def.rules, lines);
    if (!met.ok) {
      if (met.hasMatching && Number.isFinite(met.remaining) && met.remaining > 0) short.push({ def, remaining: met.remaining });
      continue;
    }
    const discount = rewardDiscount(def, lines);
    if (discount > 0 && discount > (best?.discount ?? 0)) best = { def, discount };
  }
  const reward = best?.def.rewards[0];
  const applied = best && reward ? { programId: best.def.programId, rewardId: reward.id ?? null, programName: best.def.programName, label: rewardLabel(reward), discount: best.discount } : null;
  // Bigger reward of the same kind: a higher % (or a bigger baht amount) than the applied one.
  const bigger = (r: CouponReward) => !reward || (r.mode === reward.mode ? r.discount > reward.discount : r.mode === 'percent');
  const nearest = short.filter((s) => bigger(s.def.rewards[0])).sort((a, b) => a.remaining - b.remaining)[0];
  const next = nearest ? { programId: nearest.def.programId, programName: nearest.def.programName, label: rewardLabel(nearest.def.rewards[0]), remaining: nearest.remaining } : null;
  const scope = reward?.applicability === 'specific' ? { productIds: reward.productIds, categoryId: reward.categoryId } : null;
  return { applied, next, lines: applied ? linesAfterReward(lines, applied.discount, scope) : lines };
}

/**
 * Lines after an order-level reward: the discount is spread over the lines it applied to in
 * proportion to their amount, so a coupon applied afterwards is computed on what is left (as Odoo does).
 */
export function linesAfterReward(lines: CouponLine[], discount: number, scope?: { productIds: number[]; categoryId: number | null } | null): CouponLine[] {
  if (discount <= 0) return lines;
  const inReward = (l: CouponLine) => !scope || inScope(l, scope.productIds, scope.categoryId);
  const base = lines.filter(inReward).reduce((sum, l) => sum + l.amount, 0);
  if (base <= 0) return lines;
  const factor = Math.max(0, 1 - discount / base);
  return lines.map((l) => (inReward(l) ? { ...l, amount: round2(l.amount * factor) } : l));
}
