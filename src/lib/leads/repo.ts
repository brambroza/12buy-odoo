import { db } from '@/lib/db/client';
import { newId, reviveDates, rows, unwrap } from '@/lib/db/rows';
import type { Dealer, DealerLead, LeadStatus } from '@/lib/db/types';
import type { DealerLeadInput } from './schema';

export type LeadWithDealer = DealerLead & { dealer: Pick<Dealer, 'id' | 'name' | 'status'> | null };

/** Persists a validated lead from the public sign-up form. */
export async function createLead(input: DealerLeadInput, source = 'landing'): Promise<DealerLead> {
  const row = unwrap(await db().from('DealerLead').insert({
    id: newId(), shopName: input.shopName, province: input.province, types: input.types, phone: input.phone, lineId: input.lineId || null, source,
  }).select('*').single());
  return reviveDates<DealerLead>(row);
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
