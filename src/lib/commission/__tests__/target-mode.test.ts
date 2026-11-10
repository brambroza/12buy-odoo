import { describe, expect, it } from 'vitest';
import { normalizeTargetSteps, targetNote, targetPayPercent, targetSettings } from '../target-mode';

describe('target modes', () => {
  it('defaults to the old gate and cleans steps', () => {
    expect(targetSettings({})).toEqual({ targetMode: 'GATE', targetSteps: [] });
    expect(targetSettings({ targetMode: 'NOPE' }).targetMode).toBe('GATE');
    expect(normalizeTargetSteps([{ minPercent: 100, payPercent: 100 }, { minPercent: 80, payPercent: 50 }, { minPercent: -1, payPercent: 5 }, { minPercent: 80, payPercent: 60 }, null]))
      .toEqual([{ minPercent: 80, payPercent: 60 }, { minPercent: 100, payPercent: 100 }]);
    expect(normalizeTargetSteps('x')).toEqual([]);
  });

  it('pays by mode', () => {
    const at = (targetMode: 'GATE' | 'EXCESS' | 'PROPORTIONAL' | 'LADDER', collected: number, target: number | null) =>
      targetPayPercent({ targetMode, targetSteps: [{ minPercent: 90, payPercent: 70 }] }, collected, target);
    expect([at('GATE', 99, 100), at('GATE', 100, 100)]).toEqual([0, 100]);
    expect([at('EXCESS', 100, 100), at('EXCESS', 200, 100), at('EXCESS', -5, 100)]).toEqual([0, 50, 0]);
    expect([at('PROPORTIONAL', 50, 100), at('PROPORTIONAL', 150, 100), at('PROPORTIONAL', -5, 100)]).toEqual([50, 100, 0]);
    expect([at('LADDER', 89.99, 100), at('LADDER', 90, 100), at('LADDER', 500, 100)]).toEqual([0, 70, 70]);
    expect([at('EXCESS', 5, 0), at('LADDER', 5, null)]).toEqual([100, 100]);
  });

  it('explains the result', () => {
    expect(targetNote({ target: 100, targetMode: 'EXCESS', targetPercent: 125, targetPayPercent: 20 })).toBe('ทำได้ 125% ของเป้า · คิดเฉพาะส่วนที่เกินเป้า ได้ค่าคอม 20%');
    expect(targetNote({ target: 0, targetMode: 'GATE', targetPercent: null, targetPayPercent: 100 })).toBeNull();
    expect(targetNote({ target: 100 })).toBeNull();
  });
});
