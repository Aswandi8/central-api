export const SYSTEM_ROLE_NAMES = [
  "SUPER_ADMIN",
  "ADMIN",
  "TEAM_LEAD",
  "CONTENT_MANAGER",
  "EDITOR",
  "DESIGNER",
  "ANALYST",
  "AUDITOR",
] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];

const SYSTEM_ROLE_SET = new Set<string>(SYSTEM_ROLE_NAMES);

export function isSystemRole(name: string): boolean {
  return SYSTEM_ROLE_SET.has(name);
}

export function isSuperAdminRole(name: string): boolean {
  return name === "SUPER_ADMIN";
}
