'use client';

/**
 * Root-level wrapper. Public pages (landing, login, catalog, setup), the dealer
 * shop and the back office each bring their own chrome, so this is a passthrough
 * kept as the single place to add global client providers later.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
