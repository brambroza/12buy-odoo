/**
 * Emails a freshly issued temporary password to the user it belongs to. Never throws: the caller
 * shows the password to staff for a LINE/phone hand-off when the email could not be sent.
 */
import { getDealer } from '@/lib/dealers/repo';
import type { User } from '@/lib/db/types';
import { sendMail, type MailResult } from '@/lib/mail/send';
import { tempPasswordEmail } from '@/lib/mail/templates';
import { SITE, absoluteUrl } from '@/lib/seo';

export async function sendTempPasswordEmail(user: Pick<User, 'name' | 'email' | 'dealerId'>, tempPassword: string): Promise<MailResult> {
  const shop = user.dealerId ? (await getDealer(user.dealerId).catch(() => null))?.name ?? null : null;
  const body = tempPasswordEmail({ name: user.name, email: user.email, tempPassword, loginUrl: absoluteUrl('/login'), brand: SITE.name, shop });
  return sendMail({ to: user.email, ...body });
}
