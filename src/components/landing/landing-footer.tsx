import Link from 'next/link';
import { Building2, Clock, Mail, MessageCircle, Phone } from 'lucide-react';
import { SITE } from '@/lib/seo';
import { BrandLogo } from '@/components/landing/brand-logo';

/** Footer with company identity, full contact channels and secondary links. */
export function LandingFooter() {
  const lineHref = `https://line.me/R/ti/p/${encodeURIComponent(SITE.lineId)}`;
  const telHref = `tel:${SITE.phone.replace(/-/g, '')}`;
  return (
    <footer id="contact" className="scroll-mt-28 border-t border-[var(--lp-line)] bg-white/60 px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.3fr_1fr_0.7fr]">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold"><BrandLogo size={36} /> {SITE.name}</p>
          <p className="mt-3 text-sm text-[var(--lp-muted)]">ระบบสั่งซื้อยางสำหรับดีลเลอร์ เชื่อมต่อกับระบบบัญชีและสต็อกของบริษัทโดยตรง</p>
          <address className="mt-5 flex items-start gap-2.5 text-sm not-italic text-[var(--lp-muted)]">
            <Building2 className="mt-0.5 size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-[var(--lp-fg)]">{SITE.legalName}</span>
              <span className="block font-semibold text-[var(--lp-fg)]">{SITE.legalNameEn}</span>
              {SITE.address}
            </span>
          </address>
        </div>

        <div>
          <p className="text-sm font-semibold">ติดต่อเรา</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <a href={telHref} className="inline-flex items-center gap-2.5 hover:text-[var(--lp-accent)]">
                <Phone className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {SITE.phone}
              </a>
            </li>
            <li>
              <a href={lineHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 hover:text-[var(--lp-accent)]">
                <MessageCircle className="size-4 shrink-0 text-[#06C755]" aria-hidden="true" /> LINE {SITE.lineId}
              </a>
            </li>
            {SITE.emails.map((email) => (
              <li key={email}>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2.5 break-all hover:text-[var(--lp-accent)]">
                  <Mail className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {email}
                </a>
              </li>
            ))}
            <li className="inline-flex items-center gap-2.5 text-[var(--lp-muted)]">
              <Clock className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {SITE.businessHours}
            </li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">ลิงก์</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--lp-muted)]">
            <li><Link href="/tires" className="hover:text-[var(--lp-fg)]">แคตตาล็อกสินค้า</Link></li>
            <li><Link href="/login" className="hover:text-[var(--lp-fg)]">เข้าสู่ระบบดีลเลอร์</Link></li>
            <li><Link href="/#register" className="hover:text-[var(--lp-fg)]">สมัครเป็นดีลเลอร์</Link></li>
            <li><Link href="/#features" className="hover:text-[var(--lp-fg)]">ฟีเจอร์</Link></li>
            <li><Link href="/privacy" className="hover:text-[var(--lp-fg)]">นโยบายความเป็นส่วนตัว</Link></li>
            <li><Link href="/terms" className="hover:text-[var(--lp-fg)]">เงื่อนไขการใช้งาน</Link></li>
          </ul>
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-5xl border-t border-[var(--lp-line)] pt-6 text-xs text-[var(--lp-muted)]">© {new Date().getFullYear()} {SITE.legalName} สงวนลิขสิทธิ์</p>
    </footer>
  );
}
