import { db } from '@/lib/db/client';
import { newId, reviveDates, rowOrNull, rows, toRow, unwrap } from '@/lib/db/rows';
import type { CustomerDraft, Customer } from '@/types/customer-product';

export async function listCustomers(): Promise<Customer[]> {
  return rows(await db().from('Customer').select('*').is('deletedAt', null).order('createdAt', { ascending: false }));
}

export async function createCustomer(draft: CustomerDraft): Promise<Customer> {
  const row = unwrap(await db().from('Customer').insert(toRow({
      ...draft,
      id: newId(),
      updatedAt: new Date(),
    })).select('*').single());
  return reviveDates<Customer>(row);
}

export async function findCustomer(id: string): Promise<Customer | null> {
  return rowOrNull(await db().from('Customer').select('*').eq('id', id).is('deletedAt', null).maybeSingle());
}

export async function updateCustomer(id: string, patch: Partial<Customer>): Promise<Customer | null> {
  const exists = await findCustomer(id);
  if (!exists) return null;
  const { id: _id, createdAt: _createdAt, ...data } = patch;
  void _id; void _createdAt;
  return rowOrNull(await db().from('Customer').update(toRow({ ...data, updatedAt: new Date() })).eq('id', id).select('*').maybeSingle());
}

export async function deleteCustomer(id: string): Promise<Customer | null> {
  const exists = await findCustomer(id);
  if (!exists) return null;
  return rowOrNull(await db().from('Customer').update(toRow({ deletedAt: new Date(), updatedAt: new Date() })).eq('id', id).select('*').maybeSingle());
}
