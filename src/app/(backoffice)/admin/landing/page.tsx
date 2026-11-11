import Link from 'next/link';
import { ExternalLink, LayoutTemplate, RotateCcw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { IconSubmit } from '@/components/admin/icon-submit';
import { LandingImageField } from '@/components/admin/landing-image-field';
import { requireAdmin } from '@/lib/auth/session';
import { findUserById } from '@/lib/auth/users';
import { SECTIONS, fieldName, itemName, sectionDef, type FieldDef, type ListItem, type SectionDef } from '@/lib/landing/cms';
import { getLandingAdminState } from '@/lib/landing/repo';
import { listLandingImages } from '@/lib/shop/uploads';
import { cn } from '@/lib/utils';
import { resetLandingSectionAction, saveLandingSectionAction } from '../landing-actions';

const PATH = '/admin/landing';
/** Artwork shipped in public/landing, always offered in the image picker. */
const SHIPPED_IMAGES = ['hero-tall', 'hero-wide', 'car-wide', 'car-tall', 'moto-wide', 'moto-tall', 'battery-wide', 'battery-tall'].map((n) => `/landing/${n}.webp`);
/** Blank rows offered at the end of a variable list so admins can add entries without JavaScript. */
const BLANK_ROWS = 2;
const fmt = new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' });

type Search = { tab?: string; error?: string };

/** One input for a section field or a list-row field. */
function Field({ field, name, value, library, required }: { field: FieldDef; name: string; value: string | number | undefined; library: string[]; required: boolean }) {
  const label = `${field.label}${field.optional ? ' (ไม่บังคับ)' : ''}`;
  if (field.kind === 'image') return <LandingImageField name={name} label={label} value={String(value ?? '')} library={library} />;
  const common = { name, defaultValue: value ?? '', required: required && !field.optional, className: 'mt-1' };
  return (
    <label className="block text-xs font-medium">
      {label}
      {field.kind === 'textarea'
        ? <Textarea {...common} maxLength={field.max} rows={3} />
        : <Input {...common} type={field.kind === 'number' ? 'number' : 'text'} min={field.kind === 'number' ? 0 : undefined} maxLength={field.kind === 'number' ? undefined : field.max} className={cn('mt-1', field.kind === 'href' && 'font-mono')} placeholder={field.kind === 'href' ? '/tires?type=CAR' : undefined} />}
      {field.hint && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{field.hint}</span>}
    </label>
  );
}

/** The editable form for one section; list rows are numbered `i:<row>:<field>`. */
function SectionForm({ def, value, library }: { def: SectionDef; value: Record<string, unknown>; library: string[] }) {
  const items = (value.items as ListItem[] | undefined) ?? [];
  const list = def.list;
  const blanks = list && !list.fixed ? Math.min(BLANK_ROWS, list.max - items.length) : 0;
  const rows: (ListItem | null)[] = [...items, ...Array.from({ length: Math.max(0, blanks) }, () => null)];
  return (
    <form action={saveLandingSectionAction} className="space-y-4 text-sm">
      <input type="hidden" name="section" value={def.key} />
      <input type="hidden" name="rows" value={rows.length} />
      {def.hideable && (
        <label className="inline-flex items-center gap-2 text-xs font-medium"><input type="checkbox" name="show" defaultChecked={value.show !== false} className="accent-primary" /> แสดงส่วนนี้บนหน้าแรก</label>
      )}
      {def.fields.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {def.fields.map((f) => (
            <div key={f.name} className={cn((f.kind === 'textarea' || f.kind === 'image') && 'md:col-span-2')}>
              <Field field={f} name={fieldName(f.name)} value={value[f.name] as string | number | undefined} library={library} required />
            </div>
          ))}
        </div>
      )}
      {list && (
        <div className="space-y-3">
          <p className="text-xs font-semibold">
            {list.label} {list.fixed ? `(${list.min} รายการ แก้ได้เฉพาะข้อความ)` : `(${list.min}–${list.max} รายการ · ช่องว่างด้านล่างใช้เพิ่มรายการใหม่ · เว้นว่างทั้งแถวหรือติ๊กลบเพื่อเอาออก)`}
          </p>
          {rows.map((row, r) => (
            <div key={r} className={cn('space-y-3 rounded-lg border p-3', row ? 'border-border bg-background' : 'border-dashed border-border bg-muted/30')}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <span className="font-semibold">{row ? `${list.label} #${r + 1}` : `เพิ่ม${list.label}ใหม่`}</span>
                {!list.fixed && (
                  <span className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5">ลำดับ<Input name={itemName(r, '_order')} type="number" min={0} max={999} defaultValue={r + 1} className="h-7 w-16" /></label>
                    {row && <label className="inline-flex items-center gap-1.5 text-destructive"><input type="checkbox" name={itemName(r, '_del')} className="accent-destructive" /> ลบ</label>}
                  </span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {list.fields.map((f) => (
                  <div key={f.name} className={cn((f.kind === 'textarea' || list.fields.length === 1) && 'md:col-span-2')}>
                    <Field field={f} name={itemName(r, f.name)} value={row?.[f.name]} library={library} required={Boolean(row) && !!list.fixed} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="sticky bottom-0 -mx-4 flex items-center gap-2 border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
        <Button type="submit" size="sm"><Save /> บันทึก{def.label}</Button>
        <span className="text-xs text-muted-foreground">หน้าแรกเปลี่ยนทันทีหลังบันทึก</span>
      </div>
    </form>
  );
}

/**
 * Landing-page content editor: text and images of every section on `/`, one tab per section.
 * Unsaved sections show the coded default; "คืนค่าเริ่มต้น" removes a section's override again.
 * Promotion cards stay on /admin/promotions.
 */
export default async function LandingEditorPage({ searchParams }: { searchParams: Promise<Search> }) {
  const [, params] = await Promise.all([requireAdmin(), searchParams]);
  const def = sectionDef(params.tab ?? '') ?? SECTIONS[0];
  const [state, uploaded] = await Promise.all([getLandingAdminState(), listLandingImages().catch(() => [])]);
  const updatedBy = state.updatedById ? await findUserById(state.updatedById).catch(() => null) : null;
  const library = [...uploaded.map((n) => `/api/landing-images/${n}`), ...SHIPPED_IMAGES];
  const customised = state.customised.includes(def.key);
  const value = state.content[def.key] as unknown as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><LayoutTemplate className="size-6" /> เนื้อหาหน้าแรก</h1>
          <p className="text-sm text-muted-foreground">
            แก้ข้อความและรูปภาพบนหน้าแรกทีละส่วน ส่วนที่ยังไม่แก้จะใช้ข้อความเริ่มต้นของระบบ
            {state.updatedAt && <> · แก้ล่าสุด {fmt.format(new Date(state.updatedAt))}{updatedBy ? ` โดย ${updatedBy.name}` : ''}</>}
          </p>
        </div>
        <div className="flex gap-2">
          <Button nativeButton={false} variant="outline" size="sm" render={<Link href="/admin/promotions" />}>โปรโมชันหน้าแรก</Button>
          <Button nativeButton={false} variant="outline" size="sm" render={<a href="/" target="_blank" rel="noopener noreferrer" />}><ExternalLink /> ดูหน้าแรก</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <nav aria-label="ส่วนของหน้าแรก" className="flex gap-1 overflow-x-auto lg:flex-col">
          {SECTIONS.map((s) => {
            const active = s.key === def.key;
            const edited = state.customised.includes(s.key);
            const hidden = s.hideable && (state.content[s.key] as { show?: boolean }).show === false;
            return (
              <Link key={s.key} href={`${PATH}?tab=${s.key}`} aria-current={active ? 'page' : undefined} className={cn('flex shrink-0 items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors', active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                <span className={cn(hidden && 'line-through opacity-70')}>{s.label}</span>
                {edited && <span className={cn('size-2 rounded-full', active ? 'bg-primary-foreground' : 'bg-primary')} title="แก้ไขแล้ว" />}
              </Link>
            );
          })}
        </nav>

        <section className="rounded-xl border border-border bg-card px-4 pt-4">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-2 font-semibold">
                {def.label}
                <Badge variant="outline" className={cn('border-transparent', customised ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground')}>{customised ? 'แก้ไขแล้ว' : 'ค่าเริ่มต้น'}</Badge>
              </h2>
              <p className="text-xs text-muted-foreground">{def.description}</p>
            </div>
            {customised && (
              <form action={resetLandingSectionAction}>
                <input type="hidden" name="section" value={def.key} />
                <IconSubmit label="คืนค่าเริ่มต้น" confirm={`คืนค่าเริ่มต้น “${def.label}”? ข้อความและรูปที่แก้ไว้ในส่วนนี้จะหายไป`}><RotateCcw /></IconSubmit>
              </form>
            )}
          </div>
          {params.error && <p className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{params.error}</p>}
          {/* key: remount on tab change so defaultValues reset to that section. */}
          <SectionForm key={def.key} def={def} value={value} library={library} />
        </section>
      </div>
    </div>
  );
}
