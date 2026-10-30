import { describe, expect, it } from 'vitest';
import { companyAccountOf, messageLines, parseWireTransferMessage } from '@/lib/odoo/wire-transfer';
import { bankBrand } from '@/lib/shop/bank-accounts';

// The message as finance typed it in Odoo (Wire Transfer > Messages > Pending).
const ODOO_MESSAGE = '<div data-oe-version="2.0"><div>กรุณาโอนเงินเข้าบัญชี</div><div>\nธนาคารกสิกรไทย สาขาสุขุมวิท 55 (ทองหล่อ 20)<br>ชื่อบัญชี: บจก. วันทูบาย ช้อป</div><h6>Bank Account</h6><ul><li><pre data-embedded="readonlySyntaxHighlighting" data-language-id="plaintext">239-276-246-1</pre></li></ul><p><br></p></div>';

describe('Wire Transfer message', () => {
  it('splits the HTML into text lines', () => {
    expect(messageLines('<p>a&nbsp;&amp; b</p><br/><li> c </li>')).toEqual(['a & b', 'c']);
  });

  it('reads bank, branch, account name and number from the Odoo message', () => {
    expect(parseWireTransferMessage(ODOO_MESSAGE)).toEqual([{
      code: 'KBANK',
      color: '#138f2d',
      logo: '/banks/kbank.png',
      bankName: 'ธนาคารกสิกรไทย',
      branch: 'สุขุมวิท 55 (ทองหล่อ 20)',
      accountNo: '239-276-246-1',
      accountName: 'บจก. วันทูบาย ช้อป',
      accountType: undefined,
    }]);
  });

  it('gives each account the bank written before it, and the last values for what is missing', () => {
    const html = '<p>ชื่อบัญชี: บริษัท ก จำกัด</p><p>ธนาคารกสิกรไทย ออมทรัพย์</p><p>111-1-11111-1</p><p>ธนาคารไทยพาณิชย์ สาขา สีลม</p><p>222 222 2222</p>';
    const [kbank, scb] = parseWireTransferMessage(html);
    expect(kbank).toMatchObject({ code: 'KBANK', accountNo: '111-1-11111-1', accountName: 'บริษัท ก จำกัด', accountType: 'ออมทรัพย์', branch: 'สีลม' });
    expect(scb).toMatchObject({ code: 'SCB', bankName: 'ธนาคารไทยพาณิชย์', accountNo: '222-222-2222', branch: 'สีลม' });
  });

  it('fills the bank and name from the company account with the same number', () => {
    const [account] = parseWireTransferMessage('<p>เลขบัญชี 2392762461</p>', [{ accountNo: '239-276-246-1', bankName: 'ธนาคารกสิกรไทย', holder: 'บริษัท วันทูบาย ช้อป จำกัด' }]);
    expect(account).toMatchObject({ code: 'KBANK', accountNo: '2392762461', accountName: 'บริษัท วันทูบาย ช้อป จำกัด' });
  });

  it('ignores short numbers and repeated accounts', () => {
    expect(parseWireTransferMessage('<p>โทร 02-123-4567</p><p>สาขา 55</p>')).toEqual([]);
    expect(parseWireTransferMessage('<p>239-276-246-1</p><p>2392762461</p>')).toHaveLength(1);
  });
});

describe('company bank account', () => {
  it('splits the number from the bank name stored in account_number', () => {
    expect(companyAccountOf({ id: 1, account_number: '239-276-246-1 ธนาคารกสิกรไทย', bank_name: false, holder_name: 'บริษัท วันทูบาย ช้อป จำกัด', partner_id: [1, 'x'] }))
      .toEqual({ accountNo: '239-276-246-1', bankName: 'ธนาคารกสิกรไทย', holder: 'บริษัท วันทูบาย ช้อป จำกัด' });
    expect(companyAccountOf({ id: 2, account_number: 'n/a', bank_name: false, holder_name: false, partner_id: false })).toBeNull();
  });

  it('brands known Thai banks and falls back to a neutral badge', () => {
    expect(bankBrand('ธนาคารกรุงเทพ').code).toBe('BBL');
    expect(bankBrand('Some Bank')).toMatchObject({ code: 'BANK', name: 'Some Bank' });
  });
});
