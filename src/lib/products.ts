import { db } from '@/lib/db/client';
import { newId, reviveDates, rowOrNull, rows, toRow, unwrap } from '@/lib/db/rows';
import type { ProductDraft, Product } from '@/types/customer-product';

export async function listProducts(): Promise<Product[]> {
  return rows(await db().from('Product').select('*').is('deletedAt', null).order('createdAt', { ascending: false }));
}

export async function createProduct(draft: ProductDraft): Promise<Product> {
  const row = unwrap(await db().from('Product').insert(toRow({
      ...draft,
      canBeSold: draft.canBeSold ?? true,
      canBePurchased: draft.canBePurchased ?? false,
      id: newId(),
      updatedAt: new Date(),
    })).select('*').single());
  return reviveDates<Product>(row);
}

export async function findProduct(id: string): Promise<Product | null> {
  return rowOrNull(await db().from('Product').select('*').eq('id', id).is('deletedAt', null).maybeSingle());
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
  const exists = await findProduct(id);
  if (!exists) return null;
  const { id: _id, createdAt: _createdAt, ...data } = patch;
  void _id; void _createdAt;
  return rowOrNull(await db().from('Product').update(toRow({ ...data, updatedAt: new Date() })).eq('id', id).select('*').maybeSingle());
}

export async function deleteProduct(id: string): Promise<Product | null> {
  const exists = await findProduct(id);
  if (!exists) return null;
  return rowOrNull(await db().from('Product').update(toRow({ deletedAt: new Date(), updatedAt: new Date() })).eq('id', id).select('*').maybeSingle());
}
