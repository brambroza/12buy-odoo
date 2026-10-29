/**
 * Odoo Loyalty (coupons / promo codes): read a code for the cart preview, and apply it
 * to a draft sale order through Odoo's own coupon wizard so Odoo books the discount line
 * and counts the usage. Admins can also create discount-only programs from the web;
 * Odoo stays the source of truth.
 */
import type { CouponDefinition, CouponReward, CouponRule } from '@/lib/shop/coupon';
import { odooSearchRead, odooRead, odooWrite } from './rpc';

type Rel = [number, string] | false;
type RawProgram = {
  id: number; name: string; program_type: string; trigger: 'auto' | 'with_code'; active: boolean;
  date_from: string | false; date_to: string | false; pricelist_ids: number[];
  limit_usage: boolean; max_usage: number; total_order_count: number;
};
type RawRule = {
  id: number; mode: 'auto' | 'with_code'; code: string | false; minimum_amount: number; minimum_qty: number; any_product: boolean;
  valid_product_ids: number[]; product_ids: number[]; product_category_id: Rel; product_tag_id: Rel; product_domain: string | false;
};
type RawReward = {
  id: number; reward_type: CouponReward['type']; description: string | false; discount: number; discount_mode: CouponReward['mode'];
  discount_applicability: CouponReward['applicability']; discount_max_amount: number; required_points: number;
  all_discount_product_ids: number[]; discount_product_ids: number[]; discount_product_category_id: Rel; discount_product_tag_id: Rel; discount_product_domain: string | false;
};
type RawCard = { id: number; program_id: Rel; code: string; points: number; expiration_date: string | false; partner_id: Rel; active: boolean };

const PROGRAM_FIELDS = ['name', 'program_type', 'trigger', 'active', 'date_from', 'date_to', 'pricelist_ids', 'limit_usage', 'max_usage', 'total_order_count'];
const RULE_FIELDS = ['mode', 'code', 'minimum_amount', 'minimum_qty', 'any_product', 'valid_product_ids', 'product_ids', 'product_category_id', 'product_tag_id', 'product_domain'];
const REWARD_FIELDS = ['reward_type', 'description', 'discount', 'discount_mode', 'discount_applicability', 'discount_max_amount', 'required_points',
  'all_discount_product_ids', 'discount_product_ids', 'discount_product_category_id', 'discount_product_tag_id', 'discount_product_domain'];
const COUPON_CARD_TYPES = ['coupons', 'next_order_coupons'];
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { value: CouponDefinition | null; expiresAt: number }>();

const relId = (value: Rel): number | null => (value ? value[0] : null);
const text = (value: string | false): string | null => (value ? value : null);
/** An Odoo domain the web cannot evaluate (anything other than empty / `[]`). */
const customDomain = (value: string | false): boolean => Boolean(value && value.replace(/\s/g, '') !== '[]');

/**
 * Product scope of a rule or reward. Odoo's computed product list is used when it has
 * one; otherwise the explicit products and category. A tag or custom domain without a
 * computed list cannot be checked on the web.
 */
function productScope(computed: number[], explicit: number[], category: Rel, tag: Rel, domain: string | false) {
  const productIds = [...new Set([...(computed ?? []), ...(explicit ?? [])])];
  const unsupported = !(computed ?? []).length && Boolean(tag || customDomain(domain));
  return { productIds, categoryId: relId(category), unsupported };
}

/** Shapes Odoo rows into the evaluator's definition. `codeRuleId` limits code rules to the one that matched. */
export function toDefinition(code: string, program: RawProgram, rules: RawRule[], rewards: RawReward[], card: RawCard | null, codeRuleId: number | null): CouponDefinition {
  const usable = rules.filter((r) => r.mode === 'auto' || r.id === codeRuleId);
  return {
    code,
    source: card ? 'card' : 'rule',
    programId: program.id,
    programName: program.name,
    programType: program.program_type,
    trigger: program.trigger,
    active: program.active,
    dateFrom: text(program.date_from),
    dateTo: text(program.date_to),
    pricelistIds: program.pricelist_ids ?? [],
    limitUsage: program.limit_usage,
    maxUsage: program.max_usage ?? 0,
    usedCount: program.total_order_count ?? 0,
    card: card ? { points: card.points, expirationDate: text(card.expiration_date), partnerId: relId(card.partner_id), active: card.active } : null,
    rules: usable.map((r): CouponRule => ({
      minimumAmount: r.minimum_amount ?? 0,
      minimumQty: r.minimum_qty ?? 0,
      anyProduct: r.any_product,
      ...(r.any_product ? { productIds: [], categoryId: null, unsupported: false } : productScope(r.valid_product_ids, r.product_ids, r.product_category_id, r.product_tag_id, r.product_domain)),
    })),
    rewards: rewards.map((r): CouponReward => ({
      type: r.reward_type,
      description: r.description || '',
      discount: r.discount ?? 0,
      mode: r.discount_mode,
      applicability: r.discount_applicability,
      maxAmount: r.discount_max_amount ?? 0,
      ...(r.discount_applicability === 'specific'
        ? productScope(r.all_discount_product_ids, r.discount_product_ids, r.discount_product_category_id, r.discount_product_tag_id, r.discount_product_domain)
        : { productIds: [], categoryId: null, unsupported: false }),
      requiredPoints: r.required_points ?? 0,
    })),
  };
}

async function loadProgram(programId: number, code: string, card: RawCard | null, codeRuleId: number | null): Promise<CouponDefinition | null> {
  const context = { active_test: false };
  const [programs, rules, rewards] = await Promise.all([
    odooSearchRead<RawProgram>('loyalty.program', [['id', '=', programId]], PROGRAM_FIELDS, { limit: 1, context }),
    odooSearchRead<RawRule>('loyalty.rule', [['program_id', '=', programId]], RULE_FIELDS),
    odooSearchRead<RawReward>('loyalty.reward', [['program_id', '=', programId]], REWARD_FIELDS),
  ]);
  return programs[0] ? toDefinition(code, programs[0], rules, rewards, card, codeRuleId) : null;
}

/**
 * Looks a code up in Odoo: first as a promo-code rule, then as a coupon card.
 * Returns null when Odoo knows no such code. Cached for a minute per code.
 */
export async function findCoupon(code: string): Promise<CouponDefinition | null> {
  const hit = cache.get(code);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  let value: CouponDefinition | null = null;
  const [rule] = await odooSearchRead<{ id: number; program_id: Rel }>('loyalty.rule', [['mode', '=', 'with_code'], ['code', '=', code]], ['program_id'], { limit: 1 });
  if (rule?.program_id) {
    value = await loadProgram(rule.program_id[0], code, null, rule.id);
  } else {
    // Only single-use coupons: loyalty, gift card and eWallet cards also have codes, but they are points or payment.
    const [card] = await odooSearchRead<RawCard>('loyalty.card', [['code', '=', code], ['program_id.program_type', 'in', COUPON_CARD_TYPES]],
      ['program_id', 'code', 'points', 'expiration_date', 'partner_id', 'active'], { limit: 1, context: { active_test: false } });
    if (card?.program_id) value = await loadProgram(card.program_id[0], code, card, null);
  }
  cache.set(code, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Programs that dealers can use by typing a code (for the admin overview). */
export async function listCodePrograms(): Promise<{ program: RawProgram; codes: string[]; couponCount: number; rewards: RawReward[] }[]> {
  const programs = await odooSearchRead<RawProgram & { coupon_count: number }>('loyalty.program',
    ['|', ['trigger', '=', 'with_code'], ['program_type', 'in', ['coupons', 'promo_code']]], [...PROGRAM_FIELDS, 'coupon_count'], { context: { active_test: false }, order: 'active desc, id desc' });
  if (!programs.length) return [];
  const ids = programs.map((p) => p.id);
  const [rules, rewards] = await Promise.all([
    odooSearchRead<{ program_id: Rel; code: string | false }>('loyalty.rule', [['program_id', 'in', ids], ['mode', '=', 'with_code']], ['program_id', 'code']),
    odooSearchRead<RawReward & { program_id: Rel }>('loyalty.reward', [['program_id', 'in', ids]], ['program_id', ...REWARD_FIELDS]),
  ]);
  return programs.map((program) => ({
    program,
    codes: rules.filter((r) => relId(r.program_id) === program.id && r.code).map((r) => r.code as string),
    couponCount: program.coupon_count ?? 0,
    rewards: rewards.filter((r) => relId(r.program_id) === program.id),
  }));
}

/**
 * Applies a code to a draft sale order with Odoo's `sale.loyalty.coupon.wizard`.
 * Skips when the order already has a reward line (safe to retry). Throws when Odoo
 * rejects the code or asks to choose between several rewards.
 */
export async function applyCouponToOrder(saleOrderId: number, code: string): Promise<void> {
  // `is_reward_line` is not stored, so search on the reward link instead.
  const rewardLines = await odooRead<number>('sale.order.line', 'search_count', [[['order_id', '=', saleOrderId], ['reward_id', '!=', false]]]);
  if (rewardLines > 0) return;
  const created = await odooWrite<number | number[]>('sale.loyalty.coupon.wizard', 'create', [[{ order_id: saleOrderId, coupon_code: code }]]);
  const wizardId = Array.isArray(created) ? created[0] : created;
  const result = await odooWrite<unknown>('sale.loyalty.coupon.wizard', 'action_apply', [[wizardId]]);
  if (result && typeof result === 'object' && 'res_model' in result) {
    throw new Error(`โค้ด ${code} มีรางวัลให้เลือกหลายแบบ ต้องเลือกในใบสั่งขายของ Odoo`);
  }
}

/** A discount-only program the admin creates on the web: one code rule (or coupon cards) and one discount reward. */
export type NewCodeProgram = {
  name: string;
  kind: 'promo_code' | 'coupons';
  /** Promo-code programs only; coupons get generated card codes. */
  code: string | null;
  discount: number;
  mode: 'percent' | 'per_order';
  applicability: 'order' | 'cheapest' | 'specific';
  /** Product category the discount applies to when `applicability` is `specific`. */
  categoryId: number | null;
  /** Cap for a percent discount in baht; 0 = no cap. */
  maxAmount: number;
  /** Promo-code programs only (coupon programs keep Odoo's default of no rule). */
  minimumAmount: number;
  minimumQty: number;
  dateFrom: string | null;
  dateTo: string | null;
  /** Orders the program may be used on in total; 0 = unlimited. */
  maxUsage: number;
};

/**
 * `loyalty.program` create values with the rule and reward as one2many commands.
 * Every field Odoo would otherwise fill from the program type is set explicitly.
 */
export function buildProgramValues(input: NewCodeProgram): Record<string, unknown> {
  const reward = {
    reward_type: 'discount',
    discount: input.discount,
    discount_mode: input.mode,
    discount_applicability: input.applicability,
    discount_max_amount: input.mode === 'percent' ? input.maxAmount : 0,
    required_points: 1,
    ...(input.applicability === 'specific' && input.categoryId ? { discount_product_category_id: input.categoryId } : {}),
  };
  const rules = input.kind === 'promo_code'
    ? [[0, 0, { mode: 'with_code', code: input.code, minimum_amount: input.minimumAmount, minimum_qty: input.minimumQty, reward_point_amount: 1, reward_point_mode: 'order' }]]
    : [];
  return {
    name: input.name,
    program_type: input.kind,
    trigger: 'with_code',
    applies_on: 'current',
    date_from: input.dateFrom || false,
    date_to: input.dateTo || false,
    limit_usage: input.maxUsage > 0,
    max_usage: input.maxUsage,
    rule_ids: [[5, 0, 0], ...rules],
    reward_ids: [[5, 0, 0], [0, 0, reward]],
  };
}

/** True when Odoo already has this code as a promo-code rule or a card of any program. */
export async function codeTaken(code: string): Promise<boolean> {
  const context = { active_test: false };
  const [rules, cards] = await Promise.all([
    odooRead<number>('loyalty.rule', 'search_count', [[['code', '=', code]]], { context }),
    odooRead<number>('loyalty.card', 'search_count', [[['code', '=', code]]], { context }),
  ]);
  return rules + cards > 0;
}

/** Creates the program in Odoo and returns its id. The code must be checked with `codeTaken` first. */
export async function createCodeProgram(input: NewCodeProgram): Promise<number> {
  const created = await odooWrite<number | number[]>('loyalty.program', 'create', [[buildProgramValues(input)]]);
  if (input.code) cache.delete(input.code);
  return Array.isArray(created) ? created[0] : created;
}

/**
 * Creates single-use coupon cards (1 point each, enough for the 1-point reward) and returns
 * their codes. Odoo generates the codes. `partnerId` limits every card to that customer.
 */
export async function generateCoupons(programId: number, options: { count: number; partnerId: number | null; expirationDate: string | null }): Promise<string[]> {
  const values = Array.from({ length: options.count }, () => ({
    program_id: programId,
    points: 1,
    ...(options.partnerId ? { partner_id: options.partnerId } : {}),
    ...(options.expirationDate ? { expiration_date: options.expirationDate } : {}),
  }));
  const created = await odooWrite<number | number[]>('loyalty.card', 'create', [values]);
  const ids = Array.isArray(created) ? created : [created];
  const cards = await odooSearchRead<{ code: string }>('loyalty.card', [['id', 'in', ids]], ['code']);
  return cards.map((c) => c.code);
}

/** Coupon cards of one program, newest first (for the admin to copy and hand out). */
export async function listProgramCards(programId: number, limit = 200) {
  return odooSearchRead<{ id: number; code: string; points: number; expiration_date: string | false; partner_id: Rel; use_count: number }>(
    'loyalty.card', [['program_id', '=', programId]], ['code', 'points', 'expiration_date', 'partner_id', 'use_count'], { limit, order: 'id desc' });
}

/** Archives or restores a program; an archived program's codes stop working in the cart and in Odoo. */
export async function setProgramActive(programId: number, active: boolean): Promise<void> {
  await odooWrite<boolean>('loyalty.program', 'write', [[programId], { active }]);
  cache.clear();
}
