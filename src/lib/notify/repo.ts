/** In-app notification inbox rows (`Notification` table). */
import { db } from '@/lib/db/client';
import { newId, rows, unwrap } from '@/lib/db/rows';

export type NotificationRow = {
  id: string;
  dealerId: string | null;
  userId: string | null;
  type: string;
  title: string;
  body: string;
  href: string | null;
  channels: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

export type NewNotification = Pick<NotificationRow, 'dealerId' | 'userId' | 'type' | 'title' | 'body' | 'href'>;

export async function insertNotification(input: NewNotification): Promise<NotificationRow> {
  return unwrap(await db().from('Notification').insert({ id: newId(), ...input, channels: {} }).select('*').single()) as NotificationRow;
}

export async function setNotificationChannels(id: string, channels: Record<string, unknown>): Promise<void> {
  unwrap(await db().from('Notification').update({ channels }).eq('id', id));
}

/** Newest first for a dealer (all users of the shop) or a staff member. */
export async function listNotifications(scope: { dealerId: string } | { userId: string }, limit = 50): Promise<NotificationRow[]> {
  const q = db().from('Notification').select('*').order('createdAt', { ascending: false }).limit(limit);
  return rows<NotificationRow>(await ('dealerId' in scope ? q.eq('dealerId', scope.dealerId) : q.eq('userId', scope.userId)));
}

export async function countUnread(scope: { dealerId: string } | { userId: string }): Promise<number> {
  const q = db().from('Notification').select('id', { count: 'exact', head: true }).is('readAt', null);
  const { count, error } = await ('dealerId' in scope ? q.eq('dealerId', scope.dealerId) : q.eq('userId', scope.userId));
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Marks one (or every) unread notification of the scope as read. */
export async function markRead(scope: { dealerId: string } | { userId: string }, id?: string): Promise<void> {
  let q = db().from('Notification').update({ readAt: new Date().toISOString() }).is('readAt', null);
  q = 'dealerId' in scope ? q.eq('dealerId', scope.dealerId) : q.eq('userId', scope.userId);
  if (id) q = q.eq('id', id);
  unwrap(await q);
}
