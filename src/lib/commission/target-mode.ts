/** How a rep's collection target turns into the share of commission paid. Pure. */
import { TARGET_MODE_LABELS, TARGET_MODES, type RepResult, type TargetMode, type TargetSettings, type TargetStep } from './types';

/** Starting LADDER for a company that picks it: below 80% nothing, 80–99% half, 100% on full. */
export const DEFAULT_TARGET_STEPS: TargetStep[] = [{ minPercent: 80, payPercent: 50 }, { minPercent: 100, payPercent: 100 }];

/** Steps sorted by `minPercent`, one per start, with non-negative numbers. */
export function normalizeTargetSteps(raw: unknown): TargetStep[] {
  if (!Array.isArray(raw)) return [];
  const byStart = new Map<number, number>();
  for (const s of raw as Partial<TargetStep>[]) {
    const minPercent = Number(s?.minPercent);
    const payPercent = Number(s?.payPercent);
    if (!Number.isFinite(minPercent) || !Number.isFinite(payPercent) || minPercent < 0 || payPercent < 0) continue;
    byStart.set(minPercent, payPercent);
  }
  return [...byStart].map(([minPercent, payPercent]) => ({ minPercent, payPercent })).sort((a, b) => a.minPercent - b.minPercent);
}

/** Target settings of a company; GATE until migration 20261110200000 and when not changed. */
export function targetSettings(source: { targetMode?: unknown; targetSteps?: unknown }): TargetSettings {
  const mode = TARGET_MODES.includes(source.targetMode as TargetMode) ? (source.targetMode as TargetMode) : 'GATE';
  return { targetMode: mode, targetSteps: normalizeTargetSteps(source.targetSteps) };
}

/** Collections as % of the target; null when there is no target (unset or 0). */
export function achievementPercent(collected: number, target: number | null): number | null {
  return target ? (collected / target) * 100 : null;
}

/**
 * % of the commission paid for `collected` against `target`. No target (unset or 0) pays 100%.
 * A collected base of 0 or below pays nothing under EXCESS (there is no excess).
 */
export function targetPayPercent(settings: TargetSettings, collected: number, target: number | null): number {
  if (!target) return 100;
  switch (settings.targetMode) {
    case 'EXCESS':
      return collected > target ? ((collected - target) / collected) * 100 : 0;
    case 'PROPORTIONAL':
      return Math.max(0, Math.min(100, (collected / target) * 100));
    case 'LADDER': {
      // Rounded so that exactly 80% of the target is not 79.99999% in floating point.
      const reached = Math.round((collected / target) * 100 * 1e6) / 1e6;
      let pay = 0;
      for (const step of settings.targetSteps) if (reached >= step.minPercent) pay = step.payPercent;
      return pay;
    }
    default:
      return collected >= target ? 100 : 0;
  }
}

const percentText = (n: number) => `${Math.round(n * 100) / 100}%`;

/**
 * How the target was applied to a rep, in Thai, e.g. "ทำได้ 119% ของเป้า · คิดเฉพาะส่วนที่เกินเป้า ได้ 16.13%".
 * Null without a target (unset or 0) and for runs calculated before target modes.
 */
export function targetNote(rep: Pick<RepResult, 'target' | 'targetMode' | 'targetPercent' | 'targetPayPercent'>): string | null {
  if (!rep.target || rep.targetPercent == null || rep.targetPayPercent === undefined || !rep.targetMode) return null;
  return `ทำได้ ${percentText(rep.targetPercent)} ของเป้า · ${TARGET_MODE_LABELS[rep.targetMode]} ได้ค่าคอม ${percentText(rep.targetPayPercent)}`;
}
