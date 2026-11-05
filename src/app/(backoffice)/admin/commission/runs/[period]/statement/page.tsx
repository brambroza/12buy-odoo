import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { CommissionStatement } from '@/components/admin/commission-statement';
import { PrintButton } from '@/components/admin/print-button';
import { can } from '@/lib/auth/permissions';
import type { Role } from '@/lib/auth/roles';
import { requireBackoffice } from '@/lib/auth/session';
import { isPeriod, payDate, periodLabel, thaiDay } from '@/lib/commission/period';
import { getRun, getSource, listRepsOfUser, listSources } from '@/lib/commission/repo';
import { isLocked } from '@/lib/commission/service';
import { statementSettings } from '@/lib/commission/statement';
import { RUN_STATUS_LABELS } from '@/lib/commission/types';

type Search = { source?: string; rep?: string };

/**
 * Printable per-rep commission statements of one period, like the client's sheet. Staff with
 * `commission.view` see everyone (or `?rep=` only); a rep with `commission.view_own` sees only
 * their own statement, and only once the run is approved.
 */
export default async function CommissionStatementPage({ params, searchParams }: { params: Promise<{ period: string }>; searchParams: Promise<Search> }) {
  const user = await requireBackoffice();
  const [{ period }, sp] = await Promise.all([params, searchParams]);
  if (!isPeriod(period)) notFound();
  const role = user.role as Role;
  const viewAll = can(role, 'commission.view');
  if (!viewAll && !can(role, 'commission.view_own')) redirect('/admin');
  const source = sp.source ? await getSource(sp.source) : (await listSources()).find((s) => s.active) ?? null;
  if (!source) notFound();
  const run = await getRun(source.id, period);

  let allowed: Set<number> | null = null;
  if (!viewAll) {
    allowed = new Set((await listRepsOfUser(user.id)).filter((r) => r.sourceId === source.id).map((r) => r.odooUserId));
    if (!isLocked(run)) allowed = new Set();
  }
  const wanted = sp.rep ? Number(sp.rep) : null;
  const reps = (run?.results?.reps ?? [])
    .filter((r) => (wanted === null || r.odooUserId === wanted) && (!allowed || allowed.has(r.odooUserId)))
    .filter((r) => r.summary)
    .sort((a, b) => a.repName.localeCompare(b.repName, 'th'));
  const snapshot = run?.snapshot;
  const settings = snapshot?.statement ?? statementSettings(source);
  const back = viewAll ? `/admin/commission/runs/${period}?source=${source.id}&period=${period}` : '/admin/commission/me';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href={back} className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" /> กลับ</Link>
        <h1 className="text-xl font-bold">ใบสรุปค่าคอม {periodLabel(period, source.cutoffDay)}</h1>
        <span className="ml-auto"><PrintButton label={reps.length > 1 ? `พิมพ์ทั้งหมด (${reps.length} คน)` : 'พิมพ์ / PDF'} /></span>
      </div>
      {run && run.status === 'DRAFT' && reps.length > 0 && <p className="text-sm text-amber-700 print:hidden">รอบนี้ยังเป็นร่าง ตัวเลขอาจเปลี่ยนเมื่อคำนวณใหม่</p>}
      {reps.length === 0 && (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {!run?.results ? 'รอบนี้ยังไม่ได้คำนวณ' : !viewAll && !isLocked(run) ? 'รอบนี้ยังไม่อนุมัติ' : 'ไม่มีใบสรุป (ถ้าเพิ่งเพิ่มบรรทัดใบสรุป ให้กดคำนวณใหม่)'}
        </p>
      )}
      {reps.map((rep) => (
        <CommissionStatement key={rep.odooUserId} company={source.name} periodText={periodLabel(period, source.cutoffDay)} payText={thaiDay(payDate(period))}
          rep={rep} debtDays={settings.debtDays} status={run ? RUN_STATUS_LABELS[run.status] : ''}
          holds={(snapshot?.holds ?? []).filter((h) => h.odooUserId === rep.odooUserId)}
          adjustments={(snapshot?.adjustments ?? []).filter((a) => a.odooUserId === rep.odooUserId)} />
      ))}
    </div>
  );
}
