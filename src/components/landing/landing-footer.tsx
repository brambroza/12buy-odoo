import Link from 'next/link';
import { Building2, Clock, Mail, MessageCircle, Phone } from 'lucide-react';
import { SITE } from '@/lib/seo';
import { BrandLogo } from '@/components/landing/brand-logo';
import { copyrightLine, isExternalLink, lineHref, telHref } from '@/lib/landing/cms';
import { getLandingContent } from '@/lib/landing/repo';

/** Footer with company identity, full contact channels and secondary links; text from the landing CMS (contact + footer). */
export async function LandingFooter() {
  const { contact, footer } = await getLandingContent();
  return (
    <footer id="contact" className="scroll-mt-28 border-t border-[var(--lp-line)] bg-white/60 px-4 py-12">
      <div className="mx-auto grid max-w-5xl gap-10 md:grid-cols-[1.3fr_1fr_0.7fr]">
        <div>
          <p className="flex items-center gap-2 text-lg font-extrabold"><BrandLogo size={36} /> {SITE.name}</p>
          <p className="mt-3 whitespace-pre-line text-sm text-[var(--lp-muted)]">{footer.tagline}</p>
          <address className="mt-5 flex items-start gap-2.5 text-sm not-italic text-[var(--lp-muted)]">
            <Building2 className="mt-0.5 size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" />
            <span>
              <span className="block font-semibold text-[var(--lp-fg)]">{contact.legalName}</span>
              {contact.legalNameEn && <span className="block font-semibold text-[var(--lp-fg)]">{contact.legalNameEn}</span>}
              <span className="whitespace-pre-line">{contact.address}</span>
            </span>
          </address>
        </div>

        <div>
          <p className="text-sm font-semibold">{footer.contactHeading}</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <a href={telHref(contact.phone)} className="inline-flex items-center gap-2.5 hover:text-[var(--lp-accent)]">
                <Phone className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {contact.phone}
              </a>
            </li>
            <li>
              <a href={lineHref(contact.lineId)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2.5 hover:text-[var(--lp-accent)]">
                <MessageCircle className="size-4 shrink-0 text-[#06C755]" aria-hidden="true" /> LINE {contact.lineId}
              </a>
            </li>
            {contact.items.map(({ email }) => (
              <li key={email}>
                <a href={`mailto:${email}`} className="inline-flex items-center gap-2.5 break-all hover:text-[var(--lp-accent)]">
                  <Mail className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {email}
                </a>
              </li>
            ))}
            <li className="inline-flex items-center gap-2.5 text-[var(--lp-muted)]">
              <Clock className="size-4 shrink-0 text-[var(--lp-accent)]" aria-hidden="true" /> {contact.businessHours}
            </li>
          </ul>
        </div>

        <div>
          {footer.items.length > 0 && <>
          <p className="text-sm font-semibold">{footer.linksHeading}</p>
          <ul className="mt-3 space-y-2 text-sm text-[var(--lp-muted)]">
            {footer.items.map((link, i) => (
              <li key={`${i}-${link.href}`}>
                {isExternalLink(link.href)
                  ? <a href={link.href} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--lp-fg)]">{link.label}</a>
                  : <Link href={link.href} className="hover:text-[var(--lp-fg)]">{link.label}</Link>}
              </li>
            ))}
          </ul>
          </>}
        </div>
      </div>
      <p className="mx-auto mt-10 max-w-5xl border-t border-[var(--lp-line)] pt-6 text-xs text-[var(--lp-muted)]">{copyrightLine(footer, contact)}</p>
    </footer>
  );
}
