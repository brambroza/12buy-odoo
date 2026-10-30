import { db } from '@/lib/db/client';
import { newId, reviveDates, rows, unwrap } from '@/lib/db/rows';
import type { Dealer, DealerLead, LeadStatus } from '@/lib/db/types';
import { hashPassword } from '@/lib/auth/password';
import type { DealerLeadInput } from './schema';

export type LeadWithDealer = DealerLead & { dealer: Pick<Dealer, 'id' | 'name' | 'status'> | null };

/** Persists a validated lead from the public sign-up form; the password is stored only as a hash. */
export async function createLead(input: DealerLeadInput, source = 'landing'): Promise<DealerLead> {
  const base = {
    id: newId(), shopName: input.shopName, taxId: input.taxId, province: input.address.province, types: input.types, phone: input.phone, lineId: input.lineId || null, source,
    email: input.email, passwordHash: hashPassword(input.password), address: input.address,
  };
  const first = await db().from('DealerLead').insert({ ...base, consentAt: new Date().toISOString() }).select('*').single();
  // Until migration 20261030200000 adds `consentAt`, store the lead without it rather than losing the sign-up.
  const result = first.error?.code === '42703' || /consentAt/.test(first.error?.message ?? '') ? await db().from('DealerLead').insert(base).select('*').single() : first;
  return reviveDates<DealerLead>(unwrap(result));
}

/** A not-yet-handled lead (NEW / CONTACTED) that already uses this email. */
export async function findOpenLeadByEmail(email: string): Promise<DealerLead | null> {
  const data = unwrap(await db().from('DealerLead').select('*').eq('email', email.trim().toLowerCase()).in('status', ['NEW', 'CONTACTED']).order('createdAt', { ascending: false }).limit(1).maybeSingle());
  return data ? reviveDates<DealerLead>(data) : null;
}

/** A not-yet-handled lead (NEW / CONTACTED) for this tax id (13 digits). */
export async function findOpenLeadByTaxId(taxId: string): Promise<DealerLead | null> {
  const data = unwrap(await db().from('DealerLead').select('*').eq('taxId', taxId).in('status', ['NEW', 'CONTACTED']).order('createdAt', { ascending: false }).limit(1).maybeSingle());
  return data ? reviveDates<DealerLead>(data) : null;
}

/** Drops the stored password hash once the lead no longer needs it (approved or rejected). */
export async function clearLeadPassword(id: string): Promise<void> {
  unwrap(await db().from('DealerLead').update({ passwordHash: null }).eq('id', id));
}

export async function listLeads(status?: LeadStatus): Promise<LeadWithDealer[]> {
  let query = db().from('DealerLead').select('*, dealer:Dealer(id, name, status)').order('createdAt', { ascending: false });
  if (status) query = query.eq('status', status);
  return rows(await query);
}

export async function findLead(id: string): Promise<DealerLead | null> {
  const data = unwrap(await db().from('DealerLead').select('*').eq('id', id).maybeSingle());
  return data ? reviveDates<DealerLead>(data) : null;
}

export async function countNewLeads(): Promise<number> {
  const { count, error } = await db().from('DealerLead').select('id', { count: 'exact', head: true }).eq('status', 'NEW');
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}

export async function setLeadStatus(id: string, status: LeadStatus, extra: { note?: string; dealerId?: string } = {}): Promise<void> {
  const data: Record<string, unknown> = { status, handledAt: new Date().toISOString() };
  if (extra.note !== undefined) data.note = extra.note;
  if (extra.dealerId !== undefined) data.dealerId = extra.dealerId;
  unwrap(await db().from('DealerLead').update(data).eq('id', id));
}
