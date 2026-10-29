#!/usr/bin/env node
/**
 * One-off import of the old file stores into Supabase (run once, after `supabase db push`
 * applied 20261029120000_shop_store.sql):
 *   .proto-data/store.json   → ShopCart, ShopOrder (+ moves ShopOrder_seq past the highest ref)
 *   .proto-data/admin.json   → AdminState (id "main"); refuses to overwrite an existing row
 *   .proto-data/uploads/*    → Storage bucket "slips"
 *
 * Usage:  node scripts/import-proto-data.mjs            (dry run: prints what it would do)
 *         node scripts/import-proto-data.mjs --apply    (writes)
 * Safe to re-run: orders/carts are upserted by id/scope, existing slips are skipped.
 * UAT test orders (PO starting with "UAT-") are left out unless --include-uat is given.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const DIR = process.env.PROTO_DATA_DIR ?? path.join(process.cwd(), '.proto-data');
const readJson = (file) => (fs.existsSync(path.join(DIR, file)) ? JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8')) : null);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const check = (label, { error }) => {
  if (error) throw new Error(`${label}: ${error.message}`);
};

const store = readJson('store.json') ?? { carts: {}, coupons: {}, orders: [] };
const admin = readJson('admin.json');
const uploadsDir = path.join(DIR, 'uploads');
const slips = fs.existsSync(uploadsDir) ? fs.readdirSync(uploadsDir).filter((f) => /^[a-z0-9]+-[a-z0-9]+\.(jpg|png|webp)$/i.test(f)) : [];

const INCLUDE_UAT = process.argv.includes('--include-uat');
const orders = store.orders.filter((o) => INCLUDE_UAT || !String(o.poRef ?? '').startsWith('UAT-')).map((o) => ({
  id: o.id,
  ref: o.ref,
  scope: o.sessionId,
  dealerName: o.dealerName,
  status: o.status,
  paymentMethod: o.paymentMethod ?? 'CASH',
  subtotal: o.subtotal ?? o.total,
  cashDiscount: o.cashDiscount ?? 0,
  couponDiscount: o.couponDiscount ?? 0,
  total: o.total,
  lines: o.lines,
  coupon: o.coupon ?? null,
  odooPricelistId: o.odooPricelistId ?? null,
  address: o.address,
  carrier: o.carrier,
  note: o.note ?? '',
  poRef: o.poRef || null,
  trackingRef: o.trackingRef ?? null,
  payment: o.payment ?? { slipFile: null, slipUploadedAt: null, verifiedAt: null },
  events: o.events ?? [],
  odoo: o.odoo ?? null,
  createdAt: o.createdAt,
  updatedAt: new Date().toISOString(),
}));
const scopes = new Set([...Object.keys(store.carts ?? {}), ...Object.keys(store.coupons ?? {})]);
const carts = [...scopes].map((scope) => ({ scope, items: store.carts?.[scope] ?? [], couponCode: store.coupons?.[scope] ?? null, updatedAt: new Date().toISOString() }));
const maxSeq = Math.max(store.seq ?? 0, ...store.orders.map((o) => Number(o.ref.split('-').pop()) || 0));

console.log(`source: ${DIR}`);
console.log(`orders: ${orders.length} (skipped ${store.orders.length - orders.length} UAT) · carts: ${carts.length} · next order number after ${maxSeq}`);
console.log(`admin settings: ${admin ? `${admin.zones?.length ?? 0} zones, ${admin.books?.length ?? 0} books, ${admin.groups?.length ?? 0} groups, ${admin.cashPairs?.length ?? 0} cash pairs` : 'none'}`);
console.log(`slips: ${slips.length}`);
if (!APPLY) {
  console.log('\nDry run only. Re-run with --apply to write.');
  process.exit(0);
}

if (orders.length) check('orders', await db.from('ShopOrder').upsert(orders, { onConflict: 'id' }));
if (carts.length) check('carts', await db.from('ShopCart').upsert(carts, { onConflict: 'scope' }));
check('sequence', await db.rpc('bump_shop_order_seq', { p_min: maxSeq }));

if (admin) {
  const existing = await db.from('AdminState').select('version').eq('id', 'main').maybeSingle();
  check('admin read', existing);
  if (existing.data) console.log('AdminState already exists: left unchanged (delete the row first to re-import).');
  else check('admin', await db.from('AdminState').insert({ id: 'main', data: admin, version: 1, updatedAt: new Date().toISOString() }));
}

let uploaded = 0;
for (const name of slips) {
  const ext = name.split('.').pop().toLowerCase();
  const { error } = await db.storage.from('slips').upload(name, fs.readFileSync(path.join(uploadsDir, name)), { contentType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, upsert: false });
  if (error && !/exists|duplicate/i.test(error.message)) throw new Error(`slip ${name}: ${error.message}`);
  if (!error) uploaded += 1;
}
console.log(`done: ${orders.length} orders, ${carts.length} carts, ${uploaded} new slips`);
