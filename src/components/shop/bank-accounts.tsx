'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { BankAccount } from '@/lib/shop/bank-accounts';

/** Copies the account number without dashes so it pastes straight into a banking app. */
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\D/g, ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (http / old browser): the number is still selectable.
    }
  };
  return (
    <button type="button" onClick={copy} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted" aria-label="คัดลอกเลขที่บัญชี">
      {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  );
}

/** "โอนเงินผ่านธนาคาร" list: a table on desktop, stacked cards on phones. */
export function BankAccounts({ accounts }: { accounts: BankAccount[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">โอนเงินผ่านธนาคาร</h3>
      <div className="hidden grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)] gap-x-4 border-b border-border pb-2 text-xs font-semibold text-muted-foreground sm:grid">
        <span>#</span><span>ธนาคาร</span><span>บัญชี</span>
      </div>
      <ol className="divide-y divide-border">
        {accounts.map((a, i) => (
          <li key={a.accountNo} className="grid gap-3 py-3 text-sm sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.3fr)] sm:gap-x-4">
            <span className="hidden text-muted-foreground sm:block">{i + 1}</span>
            {a.logo ? (
              <div className="space-y-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.logo} alt={a.bankName} width={160} height={80} className="h-auto w-36 rounded-md bg-white" />
                <p className="text-xs text-muted-foreground">สาขา {a.branch}</p>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: a.color }} aria-hidden>{a.code}</span>
                <div>
                  <p className="font-medium" style={{ color: a.color }}>{a.bankName}</p>
                  <p className="text-xs text-muted-foreground">สาขา {a.branch}</p>
                </div>
              </div>
            )}
            <dl className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2"><dt className="font-semibold">เลขที่บัญชี</dt><dd className="font-mono text-base">{a.accountNo}</dd><CopyButton value={a.accountNo} /></div>
              <div className="flex flex-wrap gap-2"><dt className="font-semibold">ชื่อ</dt><dd>{a.accountName}</dd></div>
              <div className="flex flex-wrap gap-2"><dt className="font-semibold">ประเภทบัญชี</dt><dd>{a.accountType}</dd></div>
            </dl>
          </li>
        ))}
      </ol>
    </div>
  );
}
