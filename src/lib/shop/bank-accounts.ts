/** A company bank account dealers transfer to before attaching a slip (read from Odoo's Wire Transfer provider). */
export type BankAccount = {
  /** Short code for the logo badge. */
  code: string;
  bankName: string;
  /** Brand color of the badge (used when there is no logo). */
  color: string;
  /** Logo under `public/`, 2:1 image that already shows the bank name. */
  logo?: string;
  branch?: string;
  accountNo: string;
  accountName: string;
  accountType?: string;
};

type BankBrand = { code: string; name: string; color: string; logo?: string; match: RegExp };

/** Thai banks the payment step can show a badge for; matched against the bank name text from Odoo. */
const BANK_BRANDS: BankBrand[] = [
  { code: 'KBANK', name: 'ธนาคารกสิกรไทย', color: '#138f2d', logo: '/banks/kbank.png', match: /กสิกร|kasikorn|kbank/i },
  { code: 'SCB', name: 'ธนาคารไทยพาณิชย์', color: '#4e2e7f', match: /ไทยพาณิชย์|siam commercial|\bscb\b/i },
  { code: 'BBL', name: 'ธนาคารกรุงเทพ', color: '#1e4598', match: /กรุงเทพ|bangkok bank|\bbbl\b/i },
  { code: 'KTB', name: 'ธนาคารกรุงไทย', color: '#1ba5e1', match: /กรุงไทย|krung ?thai|\bktb\b/i },
  { code: 'BAY', name: 'ธนาคารกรุงศรีอยุธยา', color: '#d4a106', match: /กรุงศรี|krungsri|ayudhya|\bbay\b/i },
  { code: 'TTB', name: 'ธนาคารทหารไทยธนชาต', color: '#0050f0', match: /ทหารไทย|ธนชาต|\bttb\b/i },
  { code: 'GSB', name: 'ธนาคารออมสิน', color: '#eb198d', match: /ออมสิน|\bgsb\b/i },
];

/** Badge code, color and logo for a bank name; unknown banks get a neutral badge. */
export function bankBrand(bankName: string): Pick<BankAccount, 'code' | 'color' | 'logo'> & { name: string } {
  const brand = BANK_BRANDS.find((b) => b.match.test(bankName));
  if (brand) return { code: brand.code, name: brand.name, color: brand.color, logo: brand.logo };
  return { code: 'BANK', name: bankName, color: '#475569' };
}
