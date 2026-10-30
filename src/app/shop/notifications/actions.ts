'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireDealerAccess } from '@/lib/auth/session';
import { markRead } from '@/lib/notify/repo';
import { safeNext } from '@/lib/safe-next';

/** Marks one notification read and opens its link. */
export async function markNotificationReadAction(formData: FormData) {
  const user = await requireDealerAccess();
  const id = String(formData.get('id') ?? '');
  if (user.dealerId && id) await markRead({ dealerId: user.dealerId }, id);
  revalidatePath('/shop', 'layout');
  redirect(safeNext(String(formData.get('href') ?? ''), '/shop/notifications'));
}

export async function markAllNotificationsReadAction() {
  const user = await requireDealerAccess();
  if (user.dealerId) await markRead({ dealerId: user.dealerId });
  revalidatePath('/shop', 'layout');
}
