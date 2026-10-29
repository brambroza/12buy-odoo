'use client';

import {
  BadgeCheck, Ban, CircleAlert, CircleCheck, CloudUpload, Eye, FileDown, Image as ImageIcon, Info, KeyRound, LogIn, LogOut, Mail, MapPinned,
  PackageCheck, Plus, RefreshCw, Rocket, Save, Send, ShoppingCart, Store, Tag, Tags, Trash2, TriangleAlert, Truck, UserCheck, UserX, Users, XCircle,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import type { FlashIcon, FlashType } from '@/lib/flash-shared';
import { cn } from '@/lib/utils';

const ICONS: Record<FlashIcon, LucideIcon> = {
  check: CircleCheck, save: Save, create: Plus, delete: Trash2, cart: ShoppingCart, cartRemove: Trash2, coupon: Tag, order: PackageCheck,
  cancel: XCircle, truck: Truck, upload: CloudUpload, user: UserCheck, userOff: UserX, key: KeyRound, login: LogIn, logout: LogOut, eye: Eye,
  send: Send, publish: Rocket, reject: Ban, sync: RefreshCw, import: FileDown, price: Tags, map: MapPinned, group: Users, store: Store,
  image: ImageIcon, mail: Mail,
};

const DEFAULT_ICON: Record<FlashType, LucideIcon> = { success: BadgeCheck, info: Info, warning: TriangleAlert, error: CircleAlert };

/** Tinted square behind the icon, coloured by toast type (works in light and dark). */
const TONE: Record<FlashType, string> = {
  success: 'bg-emerald-500/12 text-emerald-600 ring-emerald-500/20 dark:text-emerald-400',
  info: 'bg-sky-500/12 text-sky-600 ring-sky-500/20 dark:text-sky-400',
  warning: 'bg-amber-500/15 text-amber-600 ring-amber-500/25 dark:text-amber-400',
  error: 'bg-red-500/12 text-red-600 ring-red-500/20 dark:text-red-400',
};

/** Icon badge used inside every toast. */
export function ToastIcon({ type, icon }: { type: FlashType; icon?: FlashIcon }) {
  const Icon = (icon && ICONS[icon]) || DEFAULT_ICON[type];
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-lg ring-1 ring-inset', TONE[type])}>
      <Icon className="size-[18px]" strokeWidth={2.2} aria-hidden />
    </span>
  );
}

type NotifyOptions = { description?: string; icon?: FlashIcon; id?: string; duration?: number };

/** Shows a toast top-right with the action's icon. Errors stay a little longer so they can be read. */
function show(type: FlashType, title: string, options: NotifyOptions = {}) {
  return toast[type](title, {
    id: options.id,
    description: options.description,
    icon: <ToastIcon type={type} icon={options.icon} />,
    duration: options.duration ?? (type === 'error' ? 6000 : 4000),
  });
}

/** Client-side toasts in the shared style (server actions use `flash()` instead). */
export const notify = {
  success: (title: string, options?: NotifyOptions) => show('success', title, options),
  info: (title: string, options?: NotifyOptions) => show('info', title, options),
  warning: (title: string, options?: NotifyOptions) => show('warning', title, options),
  error: (title: string, options?: NotifyOptions) => show('error', title, options),
  show,
};
