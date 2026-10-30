/**
 * Fine-grained staff permissions. `PERMISSIONS` in `roles.ts` is the single source: each entry has a
 * `key` checked by `can()` in server actions and used to hide buttons, so the matrix page shows exactly
 * what the code enforces.
 */
import { PERMISSIONS, isBackofficeRole, type Role } from './roles';

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

const byKey = new Map<string, readonly Role[]>(PERMISSIONS.map((p) => [p.key, p.roles]));

/** True when `role` holds permission `key`. Unknown keys are refused. */
export function can(role: Role, key: PermissionKey): boolean {
  if (!isBackofficeRole(role)) return false;
  return byKey.get(key)?.includes(role) ?? false;
}

/** Thai label of a permission (for error messages). */
export function permissionLabel(key: PermissionKey): string {
  return PERMISSIONS.find((p) => p.key === key)?.label ?? key;
}
