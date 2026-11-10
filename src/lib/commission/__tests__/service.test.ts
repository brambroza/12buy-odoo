import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommissionRun, CommissionSource, LedgerLine } from '../types';

const repo = vi.hoisted(() => ({
  ensureRun: vi.fn(), getRun: vi.fn(), updateRun: vi.fn(), listBookedFor: vi.fn(), replaceLedger: vi.fn(), listLedger: vi.fn(), listRates: vi.fn(), listSteps: vi.fn(),
  listPricelists: vi.fn(), listTargets: vi.fn(), listSalaries: vi.fn(), listAdjustments: vi.fn(), listReps: vi.fn(), listDebtHolds: vi.fn(), applyDebtPlan: vi.fn(), listPeriodOverrides: vi.fn(),
  listNewCustomers: vi.fn(), replaceNewCustomers: vi.fn(), upsertReps: vi.fn(), listSaleOrders: vi.fn(), replaceSaleOrders: vi.fn(),
}));
const odoo = vi.hoisted(() => ({ fetchCollections: vi.fn(), fetchCredits: vi.fn(), fetchOverdueInvoices: vi.fn(), fetchPaidInvoiceIds: vi.fn(), fetchFirstInvoices: vi.fn(), fetchRepDirectory: vi.fn(), fetchSaleOrders: vi.fn() }));
vi.mock('../repo', () => repo);
vi.mock('../odoo', () => odoo);
vi.mock('@/lib/settings/crypto', () => ({ decryptSecret: (v: string) => `plain-${v}` }));

const service = await import('../service');

const source: CommissionSource = { id: 's1', name: 'A', url: 'https://a.odoo.test', db: 'a', username: 'u', apiKeyEnc: 'enc', cutoffDay: 20, payDay: 0, payMonths: 1, active: true, createdAt: new Date(0), updatedAt: new Date(0),
  summaryLines: [], centralPercent: 5, debtDays: 120, debtPercent: 1, bonusBase: 'COLLECTION', bonusTiers: [], newCustomerBonus: 0, newCustomerFrom: null };
const runRow = (over: Partial<CommissionRun> = {}): CommissionRun => ({
  id: 'run1', sourceId: 's1', period: '2026-10', status: 'DRAFT', syncedAt: null, calculatedAt: null, snapshot: null, results: null, totalPayable: 0,
  submittedById: null, submittedAt: null, approvedById: null, approvedAt: null, paidAt: null, createdAt: new Date(0), updatedAt: new Date(0), ...over,
});
const line = (over: Partial<LedgerLine> = {}): LedgerLine => ({
  kind: 'COLLECTION', originPeriod: '2026-09', lineKey: 'P1:R1:L1', receiptName: 'R', cashDate: '2026-09-10', partnerName: '', invoiceId: 1, invoiceName: 'I', invoiceDate: null,
  dueDate: '2026-09-01', overdueDays: 9, paymentKind: 'CREDIT', odooUserId: 8, repName: 'A', ownerFrom: 'invoice', pricelistId: 1, pricelistName: 'P', pricelistFrom: 'order', productId: 1, productName: 'x',
  brand: 'B', family: 'PCR', qty: 1, base: 100, gross: 107, issues: [], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  repo.updateRun.mockResolvedValue(true);
  repo.upsertReps.mockResolvedValue({ added: 0, merged: 0 });
  odoo.fetchRepDirectory.mockResolvedValue({ tags: new Map([[3, [-3, 'Ake']]]), userReps: new Map([[9, [-3, 'Ake']]]), users: [{ id: 8, name: 'A' }] });
  for (const fn of [repo.listRates, repo.listSteps, repo.listPricelists, repo.listTargets, repo.listSalaries, repo.listAdjustments, repo.listReps, repo.listLedger, repo.listBookedFor, repo.listDebtHolds, repo.listPeriodOverrides, repo.listNewCustomers, odoo.fetchOverdueInvoices, odoo.fetchFirstInvoices]) fn.mockResolvedValue([]);
  odoo.fetchCredits.mockResolvedValue({ credits: [], refunds: { count: 0, amount: 0 } });
  odoo.fetchPaidInvoiceIds.mockResolvedValue(new Set());
});

describe('overdue-invoice holds on sync', () => {
  const hold = (over: object) => ({ id: 'h', sourceId: 's1', invoiceId: 1, invoiceName: 'I', partnerName: '', dueDate: '2026-04-01', odooUserId: 8, repName: 'A', residualBase: 1000, percent: 1, amount: 10, heldPeriod: '2026-08', releasedPeriod: null, ...over });

  it('holds new overdue invoices, gives back paid ones collected now, and redoes the period on a re-pull', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow() : null));
    odoo.fetchCollections.mockResolvedValue({ lines: [line({ originPeriod: '2026-10', invoiceId: 1 })], receipts: 1, refunds: { count: 0, amount: 0 } });
    repo.listDebtHolds.mockResolvedValue([
      hold({ id: 'old' }),
      hold({ id: 'mine', invoiceId: 2, heldPeriod: '2026-10' }),
      hold({ id: 'given', invoiceId: 3, heldPeriod: '2026-07', releasedPeriod: '2026-10' }),
    ]);
    odoo.fetchOverdueInvoices.mockResolvedValue([
      { invoiceId: 2, invoiceName: 'I2', partnerName: '', dueDate: '2026-05-01', odooUserId: 8, repName: 'A', residualBase: 5000 },
      { invoiceId: 3, invoiceName: 'I3', partnerName: '', dueDate: '2026-05-01', odooUserId: 8, repName: 'A', residualBase: 700 },
    ]);
    odoo.fetchPaidInvoiceIds.mockResolvedValue(new Set([1]));
    const result = await service.syncPeriod(source, '2026-10');
    expect(result).toMatchObject({ ok: true, held: 1, released: 1 });
    expect(odoo.fetchOverdueInvoices).toHaveBeenCalledWith(expect.anything(), '2026-10-20', 120);
    expect(odoo.fetchPaidInvoiceIds).toHaveBeenCalledWith(expect.anything(), [1]);
    // invoice 2 was this period's own hold, so it is planned again; invoice 3 already has a hold.
    expect(repo.applyDebtPlan).toHaveBeenCalledWith('s1', '2026-10', [expect.objectContaining({ invoiceId: 2, amount: 50, heldPeriod: '2026-10' })], ['old']);
  });

  it('reads Odoo with the period\'s own end and the start after the previous period\'s own end', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow() : null));
    repo.listPeriodOverrides.mockResolvedValue([{ period: '2026-09', endDate: '2026-09-25', payDate: null }, { period: '2026-10', endDate: '2026-10-22', payDate: null }]);
    odoo.fetchCollections.mockResolvedValue({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 } });
    await service.syncPeriod(source, '2026-10');
    expect(odoo.fetchCollections).toHaveBeenCalledWith(expect.anything(), '2026-10', { start: '2026-09-26', end: '2026-10-22' });
  });

  it('skips the overdue read when the company does not hold debts', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow() : null));
    odoo.fetchCollections.mockResolvedValue({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 } });
    await service.syncPeriod({ ...source, debtPercent: 0 }, '2026-10');
    expect(odoo.fetchOverdueInvoices).not.toHaveBeenCalled();
    expect(repo.applyDebtPlan).toHaveBeenCalledWith('s1', '2026-10', [], []);
  });
});

describe('syncPeriod', () => {
  it('refuses an approved period', async () => {
    repo.ensureRun.mockResolvedValue(runRow({ status: 'APPROVED' }));
    expect(await service.syncPeriod(source, '2026-10')).toMatchObject({ ok: false });
    expect(odoo.fetchCollections).not.toHaveBeenCalled();
  });

  it('stores the pull, books RETRO for a locked previous period and resets the run to draft', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-09' ? runRow({ id: 'prev', period, status: 'PAID' }) : runRow()));
    odoo.fetchCollections.mockImplementation(async (_c: unknown, period: string) => ({ lines: period === '2026-10' ? [line({ originPeriod: '2026-10' })] : [], receipts: 1, refunds: { count: 0, amount: 0 } }));
    repo.listBookedFor.mockResolvedValue([line()]);
    const result = await service.syncPeriod(source, '2026-10');
    expect(result).toMatchObject({ ok: true, lines: 1, retro: 1 });
    expect(odoo.fetchCollections).toHaveBeenCalledWith(expect.anything(), '2026-09', { start: '2026-08-21', end: '2026-09-20' });
    expect(repo.replaceLedger).toHaveBeenCalledWith('s1', '2026-10', 'RETRO', [expect.objectContaining({ kind: 'RETRO', base: -100, originPeriod: '2026-09' })]);
    expect(repo.updateRun).toHaveBeenCalledWith('run1', ['DRAFT', 'PENDING_APPROVAL'], expect.objectContaining({ status: 'DRAFT', results: null }));
    // Sale orders are pulled only when the incentive is measured on them.
    expect(odoo.fetchSaleOrders).not.toHaveBeenCalled();
    expect(repo.replaceSaleOrders).not.toHaveBeenCalled();
    // Reps are pulled with the period so tag reps in the ledger exist on the targets page.
    expect(repo.upsertReps).toHaveBeenCalledWith('s1', [{ id: -3, name: 'Ake' }, { id: 8, name: 'A' }], new Map([[9, -3]]));
  });

  it('does not write when the run got approved while Odoo was being read', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow({ status: 'APPROVED' }) : null));
    odoo.fetchCollections.mockResolvedValue({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 } });
    expect(await service.syncPeriod(source, '2026-10')).toMatchObject({ ok: false });
    expect(repo.replaceLedger).not.toHaveBeenCalled();
  });
});

describe('calculatePeriod', () => {
  it('needs a draft that has been pulled', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    expect(await service.calculatePeriod(source, '2026-10')).toMatchObject({ ok: false, reason: expect.stringContaining('ดึงข้อมูล') });
    repo.ensureRun.mockResolvedValue(runRow({ status: 'PENDING_APPROVAL' }));
    expect(await service.calculatePeriod(source, '2026-10')).toMatchObject({ ok: false });
  });

  it('stores results and the rules used, carrying negatives from an approved previous run', async () => {
    repo.ensureRun.mockResolvedValue(runRow({ syncedAt: new Date() }));
    repo.listLedger.mockResolvedValue([line({ originPeriod: '2026-10' })]);
    repo.listReps.mockResolvedValue([{ id: 'r', sourceId: 's1', odooUserId: 8, name: 'A', userId: null, active: true }]);
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-09'
      ? runRow({ status: 'APPROVED', results: { reps: [{ odooUserId: 8, carryOut: -50 } as never], lines: [], issues: [], unassignedBase: 0, totalPayable: 0 } })
      : runRow({ syncedAt: new Date() })));
    expect(await service.calculatePeriod(source, '2026-10')).toMatchObject({ ok: true });
    const patch = repo.updateRun.mock.calls[0][2];
    expect(patch.results.reps[0]).toMatchObject({ odooUserId: 8, carryIn: -50 });
    expect(patch.snapshot).toHaveProperty('rates');
    expect(patch.snapshot.statement).toMatchObject({ centralPercent: 5, debtDays: 120 });
    expect(patch.results.reps[0]).toMatchObject({ centralPercent: 5, central: 0, summary: expect.any(Array) });
  });

  it('shows credit notes with the results, and still calculates when Odoo cannot be read', async () => {
    repo.ensureRun.mockResolvedValue(runRow({ syncedAt: new Date() }));
    repo.listLedger.mockResolvedValue([line({ originPeriod: '2026-10' })]);
    repo.getRun.mockResolvedValue(runRow({ syncedAt: new Date() }));
    odoo.fetchCredits.mockResolvedValue({ credits: [{ id: 1, name: 'RINV/1', date: '2026-10-05', partnerName: 'ร้าน', originName: null, odooUserId: 8, repName: 'A', base: 500, gross: 535 }], refunds: { count: 0, amount: 0 } });
    await service.calculatePeriod(source, '2026-10');
    expect(repo.updateRun.mock.calls[0][2].results.reps[0]).toMatchObject({ creditNoteBase: 500, creditNoteCount: 1 });
    odoo.fetchCredits.mockRejectedValue(new Error('timeout'));
    repo.updateRun.mockClear();
    expect(await service.calculatePeriod(source, '2026-10')).toMatchObject({ ok: true });
    expect(repo.updateRun.mock.calls[0][2].results.issues).toContainEqual({ message: expect.stringContaining('ดึงใบลดหนี้ (CN)') });
  });
});

describe('approval', () => {
  it('submits only calculated drafts without blocking issues', async () => {
    repo.getRun.mockResolvedValue(runRow());
    expect(await service.submitRun('s1', '2026-10', 'u1')).toMatchObject({ ok: false, reason: expect.stringContaining('คำนวณ') });
    repo.getRun.mockResolvedValue(runRow({ calculatedAt: new Date(), results: { reps: [], lines: [], issues: [{ message: 'ยังไม่ได้ตั้งเป้าของ A รอบนี้' }], unassignedBase: 0, totalPayable: 0 } }));
    expect(await service.submitRun('s1', '2026-10', 'u1')).toMatchObject({ ok: false, reason: expect.stringContaining('เป้า') });
    repo.getRun.mockResolvedValue(runRow({ calculatedAt: new Date(), results: { reps: [], lines: [], issues: [], unassignedBase: 0, totalPayable: 0 } }));
    expect(await service.submitRun('s1', '2026-10', 'u1')).toMatchObject({ ok: true });
    expect(repo.updateRun).toHaveBeenCalledWith('run1', ['DRAFT'], expect.objectContaining({ status: 'PENDING_APPROVAL', submittedById: 'u1' }));
  });

  it('refuses approval by the submitter and by a stale click', async () => {
    repo.getRun.mockResolvedValue(runRow({ status: 'PENDING_APPROVAL', submittedById: 'u1' }));
    expect(await service.approveRun('s1', '2026-10', 'u1')).toMatchObject({ ok: false, reason: expect.stringContaining('ไม่ใช่คนเดียวกับผู้ส่ง') });
    repo.updateRun.mockResolvedValue(false);
    expect(await service.approveRun('s1', '2026-10', 'u2')).toMatchObject({ ok: false });
    repo.updateRun.mockResolvedValue(true);
    expect(await service.approveRun('s1', '2026-10', 'u2')).toMatchObject({ ok: true });
  });

  it('sends back, marks paid only from the right status, and reports locks', async () => {
    repo.getRun.mockResolvedValue(runRow({ status: 'PENDING_APPROVAL' }));
    expect(await service.rejectRun('s1', '2026-10')).toMatchObject({ ok: true });
    expect(await service.markRunPaid('s1', '2026-10')).toMatchObject({ ok: false });
    repo.getRun.mockResolvedValue(runRow({ status: 'APPROVED' }));
    expect(await service.markRunPaid('s1', '2026-10')).toMatchObject({ ok: true });
    expect(await service.rejectRun('s1', '2026-10')).toMatchObject({ ok: false });
    expect(service.isLocked(runRow({ status: 'PAID' }))).toBe(true);
    expect(service.isLocked(null)).toBe(false);
  });
});

describe('clients', () => {
  it('caches one client per company and rebuilds it after the connection changes', () => {
    const a = service.clientFor(source);
    expect(service.clientFor(source)).toBe(a);
    expect(service.clientFor({ ...source, updatedAt: new Date(1) })).not.toBe(a);
    service.forgetClient('s1');
    expect(service.tryClientFor(source)).not.toBeNull();
  });
});

describe('new customers on sync', () => {
  it('counts customers created after the start day once, redoing the period on a re-pull', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow() : null));
    odoo.fetchCollections.mockResolvedValue({ lines: [line({ originPeriod: '2026-10', invoiceId: 1 }), line({ originPeriod: '2026-10', invoiceId: 2, lineKey: 'k2' })], receipts: 2, refunds: { count: 0, amount: 0 } });
    repo.listNewCustomers.mockResolvedValue([
      { odooPartnerId: 21, period: '2026-09' },
      { odooPartnerId: 22, period: '2026-10' },
    ]);
    odoo.fetchFirstInvoices.mockResolvedValue([
      { partnerId: 21, partnerName: 'counted before', partnerCreated: '2026-09-25', invoiceId: 1, invoiceName: 'I1' },
      { partnerId: 22, partnerName: 'this period', partnerCreated: '2026-10-01', invoiceId: 2, invoiceName: 'I2' },
    ]);
    const result = await service.syncPeriod({ ...source, newCustomerFrom: '2026-09-21' }, '2026-10');
    expect(result).toMatchObject({ ok: true, newCustomers: 1 });
    expect(odoo.fetchFirstInvoices).toHaveBeenCalledWith(expect.anything(), [1, 2]);
    expect(repo.replaceNewCustomers).toHaveBeenCalledWith('s1', '2026-10', [expect.objectContaining({ odooPartnerId: 22, invoiceId: 2, odooUserId: 8, period: '2026-10' })]);
  });

  it('reads nothing from Odoo when no start day is set', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockImplementation(async (_s: string, period: string) => (period === '2026-10' ? runRow() : null));
    odoo.fetchCollections.mockResolvedValue({ lines: [line({ originPeriod: '2026-10' })], receipts: 1, refunds: { count: 0, amount: 0 } });
    await service.syncPeriod(source, '2026-10');
    expect(odoo.fetchFirstInvoices).not.toHaveBeenCalled();
    expect(repo.replaceNewCustomers).toHaveBeenCalledWith('s1', '2026-10', []);
  });
});

describe('syncPeriod with an incentive on sale orders', () => {
  it('pulls the period\'s confirmed sale orders and stores them', async () => {
    repo.ensureRun.mockResolvedValue(runRow());
    repo.getRun.mockResolvedValue(runRow());
    odoo.fetchCollections.mockResolvedValue({ lines: [], receipts: 0, refunds: { count: 0, amount: 0 } });
    const order = { orderId: 1, orderName: 'S1', orderDate: '2026-10-01', partnerName: 'ร้าน', odooUserId: -3, repName: 'Ake', amountUntaxed: 100, amountTotal: 107, period: '2026-10' };
    odoo.fetchSaleOrders.mockResolvedValue([order]);
    const result = await service.syncPeriod({ ...source, bonusBase: 'SALE_ORDER' }, '2026-10');
    expect(result).toMatchObject({ ok: true, saleOrders: 1 });
    expect(odoo.fetchSaleOrders).toHaveBeenCalledWith(expect.anything(), '2026-10', { start: '2026-09-21', end: '2026-10-20' });
    expect(repo.replaceSaleOrders).toHaveBeenCalledWith('s1', '2026-10', [order]);
  });
});

describe('targetReps', () => {
  it('lists every Sale tag from Odoo plus untagged salespeople with collections, skipping reps switched off', async () => {
    repo.listReps.mockResolvedValue([
      { id: 'a', sourceId: 's1', odooUserId: 32, name: 'Wit', userId: null, active: false },
      { id: 'b', sourceId: 's1', odooUserId: 6, name: 'Sea', userId: null, active: true },
      { id: 'c', sourceId: 's1', odooUserId: -9, name: 'Old', userId: null, active: false },
    ]);
    repo.listLedger.mockResolvedValue([line({ odooUserId: -12, repName: 'Wit', base: 700 }), line({ odooUserId: 6, repName: 'Sea', base: 50 }), line({ odooUserId: -9, base: 5 })]);
    odoo.fetchRepDirectory.mockResolvedValue({ tags: new Map([[12, [-12, 'Wit']], [3, [-3, 'Ake']]]), userReps: new Map(), users: [] });
    const { reps, odooError } = await service.targetReps(source, '2026-11');
    expect(odooError).toBeNull();
    expect(reps).toEqual([
      { odooUserId: -3, name: 'Ake', tag: true, collected: 0 },
      { odooUserId: -12, name: 'Wit', tag: true, collected: 700 },
      { odooUserId: 6, name: 'Sea', tag: false, collected: 50 },
    ]);
  });
});
