import Link from 'next/link';
import { Home, Search } from 'lucide-react';

type Props = {
  title?: string;
  hint?: string;
  homeHref?: string;
  homeLabel?: string;
  searchHref?: string;
  searchLabel?: string;
  theme?: 'landing' | 'app';
};

/** Friendly 404 card shared by the public site, the dealer shop and the back office. */
export function NotFoundState({
  title = 'ไม่พบหน้าที่ต้องการ',
  hint = 'ลิงก์อาจพิมพ์ผิด หรือหน้านี้ถูกย้ายไปแล้ว',
  homeHref = '/',
  homeLabel = 'กลับหน้าแรก',
  searchHref,
  searchLabel = 'ค้นหาสินค้า',
  theme = 'app',
}: Props) {
  const landing = theme === 'landing';
  const card = landing ? 'border-[var(--lp-line)] bg-white text-[var(--lp-fg)]' : 'border-border bg-card text-card-foreground';
  const muted = landing ? 'text-[var(--lp-muted)]' : 'text-muted-foreground';
  const primary = landing ? 'bg-[var(--lp-accent)] text-[var(--lp-accent-fg)] hover:brightness-110' : 'bg-primary text-primary-foreground hover:opacity-90';
  const outline = landing ? 'border-[var(--lp-line)] hover:bg-[var(--lp-accent-soft)]' : 'border-border hover:bg-muted';
  return (
    <div className={`mx-auto my-10 w-full max-w-md rounded-2xl border p-6 text-center shadow-sm ${card}`}>
      <p className={`text-6xl font-black tracking-tight ${landing ? 'text-[var(--lp-accent)]' : 'text-primary'}`} aria-hidden="true">404</p>
      <h1 className="mt-2 text-xl font-extrabold">{title}</h1>
      <p className={`mt-2 text-sm ${muted}`}>{hint}</p>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={homeHref} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition ${primary}`}>
          <Home className="size-4" aria-hidden="true" /> {homeLabel}
        </Link>
        {searchHref && (
          <Link href={searchHref} className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border px-5 text-sm font-semibold transition ${outline}`}>
            <Search className="size-4" aria-hidden="true" /> {searchLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
