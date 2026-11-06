'use client';

import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { formatThaiAddress, type ThaiAddress } from '@/lib/thai-address';
import { ThaiAddressFields } from './thai-address-fields';

/** True when every field the checkout schema requires is filled. */
function isComplete(address: ThaiAddress | null): address is ThaiAddress {
  return Boolean(address && address.line.trim().length >= 3 && address.province && address.district && address.subdistrict && /^\d{5}$/.test(address.postalCode));
}

/**
 * Delivery address block of the checkout form. A complete address the shop already knows shows as a card
 * (posted through hidden inputs) with a "เปลี่ยน" button that opens the picker; otherwise the picker opens
 * prefilled with whatever could be read. `guessed` means the address came from the dealer's free-text
 * address, so it is saved as the shop's structured address with this order.
 */
export function CheckoutAddress({ address, guessed, legacyText, canSave }: {
  address: ThaiAddress | null;
  guessed: boolean;
  /** Free-text address shown under the picker when nothing could be read from it. */
  legacyText?: string;
  canSave: boolean;
}) {
  const complete = isComplete(address);
  const [editing, setEditing] = useState(!complete);

  if (complete && !editing) {
    return (
      <div className="space-y-1">
        <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="min-w-0 flex-1">{formatThaiAddress(address)}</p>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 text-xs font-semibold text-primary underline underline-offset-2">เปลี่ยน</button>
        </div>
        {guessed && <p className="text-[11px] text-muted-foreground">ดึงจากที่อยู่ของร้าน ตรวจสอบก่อนสั่ง ระบบจะบันทึกเป็นที่อยู่จัดส่งหลักให้</p>}
        <input type="hidden" name="line" value={address.line} />
        <input type="hidden" name="province" value={address.province} />
        <input type="hidden" name="district" value={address.district} />
        <input type="hidden" name="subdistrict" value={address.subdistrict} />
        <input type="hidden" name="postalCode" value={address.postalCode} />
        {guessed && canSave && <input type="hidden" name="saveAddress" value="on" />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ThaiAddressFields defaultValue={address} legacyText={address ? undefined : legacyText} />
      {canSave && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {/* Checked when the shop has no saved address yet, so the next order is prefilled. */}
          <input type="checkbox" name="saveAddress" defaultChecked={!complete || guessed} className="size-4" /> บันทึกเป็นที่อยู่จัดส่งหลักของร้าน
        </label>
      )}
    </div>
  );
}
