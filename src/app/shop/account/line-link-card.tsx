import { MessageCircle, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { unlinkLineAction } from '@/app/shop/actions';

/**
 * "เชื่อม LINE" card on the dealer account page: link via LINE Login to receive order pushes,
 * show the linked state, and unlink. Hidden details when the LINE channel is not configured yet.
 */
export function LineLinkCard({ linked, linkedAt, configured, basicId, status }: { linked: boolean; linkedAt: Date | null | undefined; configured: boolean; basicId: string; status?: string }) {
  const addFriend = basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : null;
  return (
    <section id="line" className="space-y-3">
      <h2 className="flex items-center gap-2 font-bold"><MessageCircle className="size-4 text-[#06c755]" /> แจ้งเตือนผ่าน LINE</h2>
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        {status === 'linked' && <p className="mb-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-emerald-700 dark:text-emerald-400">เชื่อม LINE เรียบร้อย</p>}
        {status === 'failed' && <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-destructive">เชื่อม LINE ไม่สำเร็จ ลองใหม่อีกครั้ง หรือทักทีมงาน</p>}
        {status === 'unconfigured' && <p className="mb-2 rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800">ระบบยังไม่ได้เปิดใช้ LINE แจ้งทีมงานให้ตั้งค่าก่อน</p>}
        {linked ? (
          <>
            <p className="font-medium text-emerald-700 dark:text-emerald-400">เชื่อมแล้ว{linkedAt ? ` · ${new Date(linkedAt).toLocaleDateString('th-TH', { dateStyle: 'medium' })}` : ''}</p>
            <p className="mt-1 text-muted-foreground">รับแจ้งเตือนเมื่อออเดอร์ได้รับการยืนยัน จัดส่ง วางบิล และชำระ {addFriend && <>ยังไม่ได้รับข้อความ? <a href={addFriend} target="_blank" rel="noreferrer" className="text-primary underline">เพิ่มเพื่อน {basicId}</a> ก่อน</>}</p>
            <form action={unlinkLineAction} className="mt-3"><Button type="submit" variant="outline" size="sm"><Unlink className="size-4" /> ยกเลิกการเชื่อม</Button></form>
          </>
        ) : (
          <>
            <p className="text-muted-foreground">รับแจ้งเตือนสถานะออเดอร์ทุกขั้นในแชท LINE ของคุณ กดปุ่มด้านล่างแล้วเข้าสู่ระบบ LINE หนึ่งครั้ง</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button nativeButton={false} render={<a href="/api/auth/line/start" />} size="sm" className="bg-[#06c755] text-white hover:bg-[#05b34c]" disabled={!configured}><MessageCircle className="size-4" /> เชื่อม LINE</Button>
              {addFriend && <a href={addFriend} target="_blank" rel="noreferrer" className="text-xs text-primary underline">เพิ่มเพื่อน {basicId}</a>}
            </div>
            {!configured && <p className="mt-2 text-xs text-muted-foreground">ทีมงานยังไม่ได้เปิดใช้ LINE แจ้งเตือน (ตั้งค่าได้ที่หลังบ้าน → ตั้งค่า LINE)</p>}
          </>
        )}
      </div>
    </section>
  );
}
