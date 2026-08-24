const ROLE_PRIORITY: Record<string, number> = {
  WEBSITE_ADMIN: 100,
  TEAM_LEAD: 80,
  CONTENT_MANAGER: 60,
  EDITOR: 50,
  DESIGNER: 50,
  ANALYST: 40,
  AUDITOR: 40,
};

interface CanAssignWebsiteRoleOptions {
  isSuperAdmin: boolean;
  actorRoleName?: string;
  targetRoleName: string;
}

function getRolePriority(roleName: string): number {
  return ROLE_PRIORITY[roleName] ?? 10;
}

export function canAssignWebsiteRole({
  isSuperAdmin,
  actorRoleName,
  targetRoleName,
}: CanAssignWebsiteRoleOptions): boolean {
  if (isSuperAdmin) {
    return true;
  }

  if (!actorRoleName) {
    return false;
  }

  if (actorRoleName === "WEBSITE_ADMIN") {
    return true;
  }

  return getRolePriority(targetRoleName) < getRolePriority(actorRoleName);
}
