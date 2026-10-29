'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { levelLabels, listDistricts, listProvinces, listSubdistricts, type ThaiAddress, type ThaiAddressData } from '@/lib/thai-address';

const selectClass = 'mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm disabled:opacity-50';

/** Loads the ~290 KB address list once, as its own chunk, only when a form needs it. */
let dataPromise: Promise<ThaiAddressData> | null = null;
function loadData(): Promise<ThaiAddressData> {
  dataPromise ??= import('@/data/thai-address.json').then((m) => m.default as ThaiAddressData);
  return dataPromise;
}

/**
 * Address inputs: house no./street, then จังหวัด → อำเภอ/เขต → ตำบล/แขวง selects.
 * Picking a ตำบล fills the รหัสไปรษณีย์, which stays editable.
 * Posts `line`, `province`, `district`, `subdistrict`, `postalCode`.
 */
export function ThaiAddressFields({ defaultValue, legacyText }: { defaultValue?: ThaiAddress | null; legacyText?: string }) {
  const [data, setData] = useState<ThaiAddressData | null>(null);
  const [province, setProvince] = useState(defaultValue?.province ?? '');
  const [district, setDistrict] = useState(defaultValue?.district ?? '');
  const [subdistrict, setSubdistrict] = useState(defaultValue?.subdistrict ?? '');
  const [postalCode, setPostalCode] = useState(defaultValue?.postalCode ?? '');

  useEffect(() => {
    let alive = true;
    loadData().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);

  const provinces = useMemo(() => (data ? listProvinces(data) : []), [data]);
  const districts = useMemo(() => (data && province ? listDistricts(data, province) : []), [data, province]);
  const subdistricts = useMemo(() => (data && province && district ? listSubdistricts(data, province, district) : []), [data, province, district]);
  const labels = levelLabels(province);

  const pickProvince = (value: string) => { setProvince(value); setDistrict(''); setSubdistrict(''); setPostalCode(''); };
  const pickDistrict = (value: string) => { setDistrict(value); setSubdistrict(''); setPostalCode(''); };
  const pickSubdistrict = (value: string) => {
    setSubdistrict(value);
    const match = subdistricts.find((s) => s.name === value);
    if (match) setPostalCode(match.postalCode);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="text-xs text-muted-foreground">บ้านเลขที่ / หมู่ / ซอย / ถนน</span>
        <Input name="line" defaultValue={defaultValue?.line ?? ''} required minLength={3} maxLength={200} placeholder="เช่น 99/1 ม.3 ถ.มิตรภาพ" className="mt-1" autoComplete="street-address" />
        {!defaultValue && legacyText && <span className="mt-1 block text-[11px] text-muted-foreground">ที่อยู่เดิม: {legacyText}</span>}
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">จังหวัด</span>
        <select name="province" required value={province} onChange={(e) => pickProvince(e.target.value)} disabled={!data} className={selectClass}>
          <option value="">{data ? '— เลือกจังหวัด —' : 'กำลังโหลด...'}</option>
          {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">{province ? labels.district : 'อำเภอ / เขต'}</span>
        <select name="district" required value={district} onChange={(e) => pickDistrict(e.target.value)} disabled={!districts.length} className={selectClass}>
          <option value="">— เลือก{province ? labels.district : 'อำเภอ / เขต'} —</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">{province ? labels.subdistrict : 'ตำบล / แขวง'}</span>
        <select name="subdistrict" required value={subdistrict} onChange={(e) => pickSubdistrict(e.target.value)} disabled={!subdistricts.length} className={selectClass}>
          <option value="">— เลือก{province ? labels.subdistrict : 'ตำบล / แขวง'} —</option>
          {subdistricts.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="text-xs text-muted-foreground">รหัสไปรษณีย์</span>
        <Input name="postalCode" required inputMode="numeric" pattern="\d{5}" maxLength={5} value={postalCode} onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="เลือกตำบลแล้วเติมให้อัตโนมัติ" className="mt-1" autoComplete="postal-code" />
      </label>
    </div>
  );
}
