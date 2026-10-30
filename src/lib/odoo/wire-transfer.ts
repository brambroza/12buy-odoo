/**
 * Bank accounts for cash orders, read from Odoo's "Wire Transfer" payment provider
 * (`payment.provider`, `custom_mode = wire_transfer`). Finance edits the provider's message in Odoo
 * (Website > Payment Providers > Wire Transfer > Messages); the web parses the bank, branch,
 * account name and account numbers from it. The company's bank accounts on bank journals
 * (`res.partner.bank`) fill in what the message leaves out, and are used alone when the message
 * has no account number.
 */
import { bankBrand, type BankAccount } from '@/lib/shop/bank-accounts';
import { odooSearchRead } from './rpc';

type RawProvider = { id: number; name: string; pending_msg: string | false };
type RawJournal = { id: number; bank_account_id: [number, string] | false };
type RawPartnerBank = { id: number; account_number: string | false; bank_name: string | false; holder_name: string | false; partner_id: [number, string] | false };

/** A company account from `res.partner.bank`, before branding. */
export type CompanyBankAccount = { accountNo: string; bankName: string; holder: string };

export type WireTransferInfo = { accounts: BankAccount[]; error: boolean };

const TTL_MS = 5 * 60 * 1000;
let cache: { value: WireTransferInfo; expiresAt: number } | null = null;

const ENTITIES: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/** Text lines of the provider's HTML message: block tags and `<br>` become line breaks. */
export function messageLines(html: string): string[] {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li|ul|ol|pre|h[1-6]|tr|table)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|#39);/g, (m) => ENTITIES[m] ?? m);
  return text.split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** Digits only, for comparing account numbers written with or without dashes. */
const digits = (value: string) => value.replace(/\D/g, '');

/** An account number on the line (10+ digits, dashes or spaces allowed), or null. */
function accountNoIn(line: string): string | null {
  const match = line.match(/\d[\d\- ]{7,}\d/);
  return match && digits(match[0]).length >= 10 ? match[0].replace(/ /g, '-') : null;
}

type Context = { bankName?: string; branch?: string; holder?: string; accountType?: string };

/** Bank, branch, account name and type mentioned on one line of the message. */
function contextIn(line: string): Context {
  const found: Context = {};
  const bank = line.match(/ธนาคาร[^\s,]+/);
  if (bank) found.bankName = bank[0];
  const branch = line.match(/สาขา\s*[:：]?\s*(.+)/);
  if (branch) found.branch = branch[1].trim();
  const holder = line.match(/ชื่อบัญชี\s*[:：]?\s*(.+)/);
  if (holder) found.holder = holder[1].trim();
  const type = line.match(/ออมทรัพย์|กระแสรายวัน|ฝากประจำ/);
  if (type) found.accountType = type[0];
  return found;
}

/**
 * Accounts written in the Wire Transfer message. Each account number takes the bank, branch,
 * name and type written before it; anything still missing takes the last value in the message,
 * then the company account with the same number (`company`).
 */
export function parseWireTransferMessage(html: string, company: CompanyBankAccount[] = []): BankAccount[] {
  const lines = messageLines(html);
  let context: Context = {};
  const found: { accountNo: string; context: Context }[] = [];
  for (const line of lines) {
    context = { ...context, ...contextIn(line) };
    const accountNo = accountNoIn(line);
    if (accountNo && !found.some((f) => digits(f.accountNo) === digits(accountNo))) found.push({ accountNo, context });
  }
  return found.map(({ accountNo, context: before }) => {
    const match = company.find((c) => digits(c.accountNo) === digits(accountNo));
    const c = { ...context, ...before };
    return toBankAccount({ accountNo, bankName: c.bankName ?? match?.bankName ?? '', branch: c.branch, holder: c.holder ?? match?.holder ?? '', accountType: c.accountType });
  });
}

/**
 * Splits `res.partner.bank.account_number` the way this Odoo stores it ("239-276-246-1 ธนาคารกสิกรไทย")
 * into the number and the bank name; `bank_name` wins when it is set.
 */
export function companyAccountOf(row: RawPartnerBank): CompanyBankAccount | null {
  const raw = (row.account_number || '').trim();
  const accountNo = accountNoIn(raw);
  if (!accountNo) return null;
  const rest = raw.replace(/\d[\d\- ]{7,}\d/, '').trim();
  return { accountNo, bankName: (row.bank_name || rest).trim(), holder: (row.holder_name || (row.partner_id ? row.partner_id[1] : '')).trim() };
}

function toBankAccount(input: { accountNo: string; bankName: string; branch?: string; holder: string; accountType?: string }): BankAccount {
  const brand = bankBrand(input.bankName);
  return {
    code: brand.code,
    color: brand.color,
    logo: brand.logo,
    bankName: input.bankName || brand.name,
    branch: input.branch,
    accountNo: input.accountNo,
    accountName: input.holder,
    accountType: input.accountType,
  };
}

/** Bank accounts on the company's bank journals. */
async function companyAccounts(): Promise<CompanyBankAccount[]> {
  const journals = await odooSearchRead<RawJournal>('account.journal', [['type', '=', 'bank']], ['id', 'bank_account_id'], { limit: 20 });
  const ids = journals.map((j) => (j.bank_account_id ? j.bank_account_id[0] : 0)).filter(Boolean);
  if (!ids.length) return [];
  const rows = await odooSearchRead<RawPartnerBank>('res.partner.bank', [['id', 'in', ids]], ['id', 'account_number', 'bank_name', 'holder_name', 'partner_id'], { limit: 20 });
  return rows.map(companyAccountOf).filter((a): a is CompanyBankAccount => a !== null);
}

async function load(): Promise<WireTransferInfo> {
  const [providers, company] = await Promise.all([
    odooSearchRead<RawProvider>('payment.provider', [['custom_mode', '=', 'wire_transfer'], ['is_published', '=', true]], ['id', 'name', 'pending_msg'], { limit: 1, order: 'sequence asc, id asc' }),
    companyAccounts(),
  ]);
  const fromMessage = providers[0]?.pending_msg ? parseWireTransferMessage(providers[0].pending_msg, company) : [];
  const accounts = fromMessage.length ? fromMessage : company.map((c) => toBankAccount({ accountNo: c.accountNo, bankName: c.bankName, holder: c.holder }));
  return { accounts, error: false };
}

/**
 * Accounts to show on the cash payment step (cached 5 minutes). When Odoo cannot be reached the
 * last good list is kept; with none, `error` is true and the list is empty.
 */
export async function getWireTransferAccounts(): Promise<WireTransferInfo> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  try {
    const value = await load();
    cache = { value, expiresAt: Date.now() + TTL_MS };
    return value;
  } catch (error) {
    console.error('Wire Transfer accounts from Odoo failed', error);
    if (cache) return cache.value;
    return { accounts: [], error: true };
  }
}
