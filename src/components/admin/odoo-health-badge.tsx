'use client';

import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

type Health = { status: 'ok' | 'degraded' | 'down'; db: { ok: boolean; latencyMs: number }; odoo: { ok: boolean; latencyMs: number }; checkedAt: string };
const POLL_MS = 120_000;

/** Top-bar dot: green = DB + Odoo answer, amber = Odoo slow/unreachable, red = database down. Polls /api/health. */
export function OdooHealthBadge() {
  const [health, setHealth] = useState<Health | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = (await res.json()) as Health;
        if (alive) setHealth(data);
      } catch {
        if (alive) setHealth({ status: 'down', db: { ok: false, latencyMs: 0 }, odoo: { ok: false, latencyMs: 0 }, checkedAt: new Date().toISOString() });
      }
    };
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  if (!health) return null;
  const slow = health.odoo.ok && health.odoo.latencyMs > 3000;
  const tone = health.status === 'down' ? 'bg-destructive' : health.status === 'degraded' || slow ? 'bg-amber-500' : 'bg-emerald-500';
  const label = health.status === 'down' ? 'ฐานข้อมูลไม่ตอบ' : !health.odoo.ok ? 'Odoo ไม่ตอบ (เว็บยังใช้ได้ แต่ส่งออเดอร์/ดึงสถานะไม่ได้)' : slow ? `Odoo ตอบช้า ${health.odoo.latencyMs} ms` : `Odoo ปกติ ${health.odoo.latencyMs} ms · DB ${health.db.latencyMs} ms`;
  return (
    <a href="/admin/settings" title={label} aria-label={`สถานะระบบ: ${label}`} className="hidden items-center gap-1.5 rounded-full border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted sm:inline-flex">
      <span className={cn('size-2 rounded-full', tone)} aria-hidden />
      <Activity className="size-3" aria-hidden />
      <span className="hidden lg:inline">{health.status === 'ok' && !slow ? 'Odoo ปกติ' : health.status === 'down' ? 'DB ล่ม' : 'Odoo มีปัญหา'}</span>
    </a>
  );
}
