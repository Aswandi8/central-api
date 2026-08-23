export const PROTECTED_GLOBAL_ROLE_NAMES = ["SUPER_ADMIN"] as const;

type ProtectedGlobalRoleName = (typeof PROTECTED_GLOBAL_ROLE_NAMES)[number];

interface GlobalRoleAssignmentLike {
  role: {
    name: string;
  };
}

export function isProtectedUser(
  globalRoles: readonly GlobalRoleAssignmentLike[],
): boolean {
  return globalRoles.some((assignment) =>
    PROTECTED_GLOBAL_ROLE_NAMES.includes(
      assignment.role.name as ProtectedGlobalRoleName,
    ),
  );
}
