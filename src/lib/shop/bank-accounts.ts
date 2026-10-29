/** A company bank account dealers transfer to before attaching a slip. */
export type BankAccount = {
  /** Short code for the logo badge. */
  code: string;
  bankName: string;
  /** Brand color of the badge (used when there is no logo). */
  color: string;
  /** Logo under `public/`, 2:1 image that already shows the bank name. */
  logo?: string;
  branch: string;
  accountNo: string;
  accountName: string;
  accountType: string;
};

/** Accounts shown on the payment step. Edit here when the finance team changes accounts. */
export const BANK_ACCOUNTS: BankAccount[] = [
  {
    code: 'KBANK',
    bankName: 'ธนาคารกสิกรไทย จำกัด (มหาชน)',
    color: '#138f2d',
    logo: '/banks/kbank.png',
    branch: 'ถนนสุขุมวิท 55 (ทองหล่อ 20)',
    accountNo: '600-201-1199',
    accountName: 'บริษัท ดรีมเมคเกอร์-ไทย คอร์ปอเรชั่น จำกัด',
    accountType: 'ออมทรัพย์',
  },
];
