'use client';

import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Opens the browser print dialog (save as PDF from there). Hidden on the printed page. */
export function PrintButton({ label = 'พิมพ์ / PDF' }: { label?: string }) {
  return <Button type="button" size="sm" variant="outline" className="print:hidden" onClick={() => window.print()}><Printer /> {label}</Button>;
}
