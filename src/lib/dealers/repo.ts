import { db } from '@/lib/db/client';
import { escapeLike, newId, quoteFilterValue, reviveDates, rowOrNull, rows, toRow, unwrap } from '@/lib/db/rows';
import type { Dealer, DealerStatus, DealerTier, DealerType, Json, User } from '@/lib/db/types';

export type DealerInput = {
  name: string;
  province: string;
  types: DealerType[];
  tier: DealerTier;
  status?: DealerStatus;
  odooPartnerId?: number | null;
  address?: string | null;
  shippingAddress?: Json;
  phone?: string | null;
  lineId?: string | null;
  taxId?: string | null;
  creditEnabled?: boolean;
  creditLimit?: number | null;
  creditOpening?: number;
  notes?: string | null;
  avatarFile?: string | null;
};

export type DealerUser = Pick<User, 'id' | 'email' | 'name' | 'role' | 'isActive' | 'lastLoginAt' | 'mustChangePassword' | 'createdAt'>;
export type DealerWithUsers = Dealer & { users: DealerUser[] };

const WITH_USERS = '*, users:User(id, email, name, role, isActive, lastLoginAt, mustChangePassword, createdAt)';

/** Embedded users come back unordered; keep them oldest first like the admin UI expects. */
function sortUsers(dealer: DealerWithUsers): DealerWithUsers {
  return { ...dealer, users: [...dealer.users].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()) };
}

/** Dealers with their logins; `q` matches name (case-insensitive), province or phone. */
export async function listDealers(filter: { status?: DealerStatus; q?: string } = {}): Promise<DealerWithUsers[]> {
  let query = db().from('Dealer').select(WITH_USERS).order('status').order('createdAt', { ascending: false });
  if (filter.status) query = query.eq('status', filter.status);
  if (filter.q) {
    const like = quoteFilterValue(`%${escapeLike(filter.q)}%`);
    query = query.or(`name.ilike.${like},province.like.${like},phone.like.${like}`);
  }
  return rows<DealerWithUsers>(await query).map(sortUsers);
}

export async function getDealer(id: string): Promise<DealerWithUsers | null> {
  const dealer = rowOrNull<DealerWithUsers>(await db().from('Dealer').select(WITH_USERS).eq('id', id).maybeSingle());
  return dealer ? sortUsers(dealer) : null;
}

export async function createDealer(input: DealerInput): Promise<Dealer> {
  const row = unwrap(await db().from('Dealer').insert(toRow({ ...input, id: newId(), status: input.status ?? 'PENDING', updatedAt: new Date() })).select('*').single());
  return reviveDates<Dealer>(row);
}

export async function updateDealer(id: string, patch: Partial<DealerInput> & { approvedAt?: Date | null; approvedById?: string | null }): Promise<void> {
  unwrap(await db().from('Dealer').update(toRow({ ...patch, updatedAt: new Date() })).eq('id', id));
}

/** The web dealer already linked to this Odoo partner, if any. */
export async function findDealerByPartnerId(odooPartnerId: number): Promise<Dealer | null> {
  return rowOrNull<Dealer>(await db().from('Dealer').select('*').eq('odooPartnerId', odooPartnerId).maybeSingle());
}

/** Hard-deletes a dealer that has no users or orders yet (undoing a half-finished self-activation). */
export async function deleteDealer(id: string): Promise<void> {
  unwrap(await db().from('Dealer').delete().eq('id', id));
}
