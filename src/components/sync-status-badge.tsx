import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const LABELS: Record<string, string> = {
  LocalOnly: 'ยังไม่ Sync',
  Syncing: 'กำลัง Sync',
  Synced: 'Synced',
  Failed: 'Sync ล้มเหลว',
};

const STYLES: Record<string, string> = {
  LocalOnly: 'bg-muted text-muted-foreground',
  Syncing: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  Synced: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  Failed: 'bg-destructive/15 text-destructive',
};

export function SyncStatusBadge({ status }: { status: string }) {
  return <Badge variant="outline" className={cn('border-transparent', STYLES[status])}>{LABELS[status] ?? status}</Badge>;
}
