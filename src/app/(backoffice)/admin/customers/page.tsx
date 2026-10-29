import { redirect } from 'next/navigation';
import { requireBackoffice } from '@/lib/auth/session';
import { findDealerByPartnerId } from '@/lib/dealers/repo';

/**
 * Odoo customers (pricelist / credit limit / delivery method) now live on the dealers page. Old links keep
 * working: `?open=<partnerId>` lands on that customer's web dealer, or on its Odoo-only row.
 */
export default async function OdooCustomersPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [, { open }] = await Promise.all([requireBackoffice(), searchParams]);
  const partnerId = Number(open);
  if (!Number.isInteger(partnerId) || partnerId <= 0) redirect('/admin/dealers');
  const dealer = await findDealerByPartnerId(partnerId);
  const row = dealer ? dealer.id : `odoo-${partnerId}`;
  redirect(`/admin/dealers?open=${encodeURIComponent(row)}`);
}
