import { db } from '@/lib/db/client';
import { newId, reviveDates, rowOrNull, unwrap } from '@/lib/db/rows';
import type { Dealer, Role, User } from '@/lib/db/types';
import { hashPassword } from './password';

export { isUniqueViolation } from '@/lib/db/rows';

/** Normalises an email for lookups and storage. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function findUserByEmail(email: string): Promise<(User & { dealer: Dealer | null }) | null> {
  return rowOrNull(await db().from('User').select('*, dealer:Dealer(*)').eq('email', normalizeEmail(email)).maybeSingle());
}

export async function findUserById(id: string): Promise<User | null> {
  return rowOrNull(await db().from('User').select('*').eq('id', id).maybeSingle());
}

/** Creates a user with a hashed password. Throws a DbError with code 23505 when the email exists. */
export async function createUser(input: { email: string; name: string; password: string; role: Role; dealerId?: string | null; mustChangePassword?: boolean }): Promise<User> {
  const row = unwrap(await db().from('User').insert({
    id: newId(),
    email: normalizeEmail(input.email),
    name: input.name.trim(),
    passwordHash: hashPassword(input.password),
    role: input.role,
    dealerId: input.dealerId ?? null,
    mustChangePassword: input.mustChangePassword ?? false,
    updatedAt: new Date().toISOString(),
  }).select('*').single());
  return reviveDates<User>(row);
}

/** Creates a user from a password hash collected earlier (dealer sign-up). Throws 23505 when the email exists. */
export async function createUserWithHash(input: { email: string; name: string; passwordHash: string; role: Role; dealerId: string }): Promise<User> {
  const row = unwrap(await db().from('User').insert({
    id: newId(), email: normalizeEmail(input.email), name: input.name.trim(), passwordHash: input.passwordHash, role: input.role,
    dealerId: input.dealerId, mustChangePassword: false, updatedAt: new Date().toISOString(),
  }).select('*').single());
  return reviveDates<User>(row);
}

/** Patches a user row and bumps `updatedAt`. */
export async function updateUser(id: string, patch: Partial<Pick<User, 'passwordHash' | 'mustChangePassword' | 'isActive' | 'lastLoginAt' | 'name'>>): Promise<void> {
  const data: Record<string, unknown> = { ...patch, updatedAt: new Date().toISOString() };
  if (patch.lastLoginAt) data.lastLoginAt = patch.lastLoginAt.toISOString();
  unwrap(await db().from('User').update(data).eq('id', id));
}

export function setPassword(userId: string, password: string, mustChangePassword = false) {
  return updateUser(userId, { passwordHash: hashPassword(password), mustChangePassword });
}

export async function countUsers(): Promise<number> {
  const { count, error } = await db().from('User').select('id', { count: 'exact', head: true });
  if (error) unwrap({ data: null, error });
  return count ?? 0;
}

/** Back-office accounts ordered by role then creation. */
export async function listStaffUsers(): Promise<User[]> {
  const data = unwrap(await db().from('User').select('*').in('role', ['SUPER_ADMIN', 'ADMIN', 'SALES', 'WAREHOUSE']).order('role').order('createdAt'));
  return reviveDates<User[]>(data ?? []);
}
