/** Public catalog skeleton in the landing theme (no shadcn Skeleton: that is tuned to the app theme). */
export default function TiresLoading() {
  const block = 'animate-pulse rounded-2xl bg-[var(--lp-bg-2)]';
  return (
    <div className="space-y-4" aria-busy="true" aria-label="กำลังโหลดแคตตาล็อก">
      <div className={`h-4 w-40 ${block}`} />
      <div className={`h-10 w-2/3 ${block}`} />
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }, (_, i) => <div key={i} className={`h-28 ${block}`} />)}
      </div>
    </div>
  );
}
