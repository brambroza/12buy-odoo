import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Geist, Noto_Sans_Thai } from 'next/font/google';
import { cn } from '@/lib/utils';
import { AppShell } from '@/components/app-shell';
import { Suspense } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { FlashListener } from '@/components/flash-listener';
import { SITE, siteUrl } from '@/lib/seo';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist', display: 'swap' });
const notoThai = Noto_Sans_Thai({ subsets: ['thai', 'latin'], variable: '--font-noto-thai', display: 'swap', weight: ['400', '500', '600', '700', '800'] });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: SITE.name, template: `%s | ${SITE.name}` },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fff7f7' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" className={cn('font-sans', geist.variable, notoThai.variable)}>
      <body>
        <AppShell>{children}</AppShell>
        <Toaster position="top-right" />
        <Suspense><FlashListener /></Suspense>
      </body>
    </html>
  );
}
