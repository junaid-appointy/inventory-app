/**
 * RBAC primitives: types + pure permission checker.
 *
 * The hook form (`useCan`) lives in `src/auth/AuthProvider.tsx` because
 * it depends on the live session. This file stays React-free so it can
 * be used from non-component code (db helpers, sync workers, tests).
 */

// Permissions are namespaced strings: `<module>.<verb>` or
// `<module>.<resource>.<verb>`. Keep them short; resolve against a real
// policy engine later.
export type Permission = string;

export type Role = 'guard' | 'supervisor' | 'manager' | 'admin';

export type Principal = {
  userId: string;
  roles: Role[];
  permissions: Permission[];
};

// Stand-in for the not-yet-authenticated user. Holds zero permissions
// so any gated UI hides until the real session loads.
export const ANONYMOUS_PRINCIPAL: Principal = {
  userId: 'anon',
  roles: [],
  permissions: [],
};

export function can(principal: Principal, permission: Permission): boolean {
  if (principal.permissions.includes('*')) return true;
  return principal.permissions.includes(permission);
}
