const ROLE_PRIORITY: Record<string, number> = {
  ADMIN: 100,
  TEAM_LEAD: 80,
  CONTENT_MANAGER: 60,
  EDITOR: 50,
  DESIGNER: 50,
  ANALYST: 40,
  AUDITOR: 40,
};

export function getRolePriority(roleName: string): number {
  return ROLE_PRIORITY[roleName] ?? 10;
}

export function canAssignWebsiteRole({
  isSuperAdmin,
  actorRoleName,
  targetRoleName,
}: {
  isSuperAdmin: boolean;
  actorRoleName?: string;
  targetRoleName: string;
}): boolean {
  if (isSuperAdmin) {
    return true;
  }

  if (!actorRoleName) {
    return false;
  }

  if (actorRoleName === "ADMIN") {
    return true;
  }

  return getRolePriority(targetRoleName) < getRolePriority(actorRoleName);
}
