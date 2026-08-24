import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({
  adapter,
});

// ============================================================
// PERMISSIONS
// ============================================================

const permissions = [
  // ----------------------------------------------------------
  // Global users
  // ----------------------------------------------------------

  { name: "user.read", description: "View global user accounts" },
  { name: "user.create", description: "Create global user accounts" },
  { name: "user.update", description: "Update global user accounts" },
  { name: "user.delete", description: "Delete global user accounts" },

  // ----------------------------------------------------------
  // Website members
  // ----------------------------------------------------------

  { name: "member.read", description: "View members assigned to a website" },
  { name: "member.invite", description: "Invite members to a website" },
  {
    name: "member.update",
    description: "Update member role or assignment within a website",
  },
  { name: "member.remove", description: "Remove a member from a website" },

  // ----------------------------------------------------------
  // Roles
  // ----------------------------------------------------------

  { name: "role.read", description: "View available roles" },
  { name: "role.create", description: "Create roles" },
  { name: "role.update", description: "Update roles" },
  { name: "role.delete", description: "Delete roles" },

  // ----------------------------------------------------------
  // Websites
  // ----------------------------------------------------------

  { name: "website.read", description: "View websites" },
  { name: "website.create", description: "Create websites" },
  { name: "website.update", description: "Update websites" },
  { name: "website.delete", description: "Delete websites" },

  // ----------------------------------------------------------
  // Shortlinks
  // ----------------------------------------------------------

  {
    name: "shortlink.read",
    description: "View shortlinks and shortlink analytics",
  },
  { name: "shortlink.create", description: "Create shortlinks" },
  { name: "shortlink.update", description: "Update shortlinks" },
  { name: "shortlink.delete", description: "Delete shortlinks" },

  // ----------------------------------------------------------
  // Videos
  // ----------------------------------------------------------

  { name: "video.read", description: "View videos" },
  { name: "video.create", description: "Create videos" },
  { name: "video.update", description: "Update videos" },
  { name: "video.delete", description: "Delete videos" },
  { name: "video.publish", description: "Publish videos" },

  // ----------------------------------------------------------
  // Categories
  // ----------------------------------------------------------

  { name: "category.read", description: "View categories" },
  { name: "category.create", description: "Create categories" },
  { name: "category.update", description: "Update categories" },
  { name: "category.delete", description: "Delete categories" },

  // ----------------------------------------------------------
  // Analytics
  // ----------------------------------------------------------

  { name: "view.read", description: "View video analytics" },

  // ----------------------------------------------------------
  // Audit
  // ----------------------------------------------------------

  { name: "audit.read", description: "View audit logs" },

  // ----------------------------------------------------------
  // API clients
  // ----------------------------------------------------------

  { name: "api_client.read", description: "View API clients" },
  { name: "api_client.create", description: "Create API clients" },
  { name: "api_client.revoke", description: "Revoke API clients" },
] as const;

// ============================================================
// SYSTEM ROLES
// ============================================================

const roleDefinitions = [
  {
    name: "SUPER_ADMIN",
    scope: "GLOBAL" as const,
    description: "Full global access to the Veyra system",
  },
  {
    name: "ADMIN",
    scope: "GLOBAL" as const,
    description: "Global administrative access to permitted Veyra resources",
  },
  {
    name: "WEBSITE_ADMIN",
    scope: "WEBSITE" as const,
    description: "Administrative access to an assigned website",
  },
  {
    name: "TEAM_LEAD",
    scope: "WEBSITE" as const,
    description: "Leads the operational team of an assigned website",
  },
  {
    name: "CONTENT_MANAGER",
    scope: "WEBSITE" as const,
    description: "Manages website content and publishing",
  },
  {
    name: "EDITOR",
    scope: "WEBSITE" as const,
    description: "Creates and edits website content",
  },
  {
    name: "DESIGNER",
    scope: "WEBSITE" as const,
    description: "Manages visual and media-related content",
  },
  {
    name: "ANALYST",
    scope: "WEBSITE" as const,
    description: "Views website analytics and performance data",
  },
  {
    name: "AUDITOR",
    scope: "WEBSITE" as const,
    description: "Read-only access to website audit information",
  },
] as const;

// ============================================================
// ROLE PERMISSIONS
// ============================================================

const rolePermissions = {
  SUPER_ADMIN: permissions.map((permission) => permission.name),

  ADMIN: [
    "shortlink.read",
    "shortlink.create",
    "shortlink.update",
    "shortlink.delete",
  ],

  WEBSITE_ADMIN: [
    "member.read",
    "member.invite",
    "member.update",
    "member.remove",

    "role.read",

    "website.read",
    "website.update",

    "video.read",
    "video.create",
    "video.update",
    "video.delete",
    "video.publish",

    "category.read",
    "category.create",
    "category.update",
    "category.delete",

    "view.read",

    "audit.read",

    "api_client.read",
    "api_client.create",
    "api_client.revoke",
  ],

  TEAM_LEAD: [
    "member.read",
    "member.invite",
    "member.update",

    "role.read",

    "website.read",

    "video.read",
    "video.create",
    "video.update",
    "video.delete",
    "video.publish",

    "category.read",
    "category.create",
    "category.update",
    "category.delete",

    "view.read",

    "audit.read",
  ],

  CONTENT_MANAGER: [
    "website.read",

    "video.read",
    "video.create",
    "video.update",
    "video.delete",
    "video.publish",

    "category.read",
    "category.create",
    "category.update",
    "category.delete",

    "view.read",
  ],

  EDITOR: [
    "website.read",

    "video.read",
    "video.create",
    "video.update",

    "category.read",
    "category.create",
    "category.update",
  ],

  DESIGNER: ["website.read", "video.read", "video.update", "category.read"],

  ANALYST: ["website.read", "view.read"],

  AUDITOR: ["website.read", "view.read", "audit.read"],
} as const;

// ============================================================
// LEGACY ADMIN MIGRATION
// ============================================================

async function migrateLegacyAdminRole() {
  const legacyAdmin = await prisma.role.findUnique({
    where: { name: "ADMIN" },
    select: {
      id: true,
      scope: true,
    },
  });

  if (!legacyAdmin || legacyAdmin.scope === "GLOBAL") {
    return;
  }

  console.log("↻ Migrating legacy WEBSITE ADMIN → WEBSITE_ADMIN...");

  const globalAssignments = await prisma.userRole.count({
    where: { roleId: legacyAdmin.id },
  });

  if (globalAssignments > 0) {
    throw new Error(
      `Legacy ADMIN has ${globalAssignments} invalid global assignments. Resolve them before migration.`,
    );
  }

  const existingWebsiteAdmin = await prisma.role.findUnique({
    where: { name: "WEBSITE_ADMIN" },
    select: { id: true },
  });

  if (!existingWebsiteAdmin) {
    await prisma.role.update({
      where: { id: legacyAdmin.id },
      data: {
        name: "WEBSITE_ADMIN",
        scope: "WEBSITE",
        description: "Administrative access to an assigned website",
      },
    });

    console.log("✓ Legacy ADMIN renamed to WEBSITE_ADMIN");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.userWebsiteRole.updateMany({
      where: { roleId: legacyAdmin.id },
      data: { roleId: existingWebsiteAdmin.id },
    });

    await tx.userInvitation.updateMany({
      where: { roleId: legacyAdmin.id },
      data: { roleId: existingWebsiteAdmin.id },
    });

    await tx.rolePermission.deleteMany({
      where: { roleId: legacyAdmin.id },
    });

    await tx.role.delete({
      where: { id: legacyAdmin.id },
    });
  });

  console.log("✓ Legacy ADMIN assignments migrated to WEBSITE_ADMIN");
}

// ============================================================
// HELPERS
// ============================================================

async function syncRolePermissions(
  roleId: string,
  permissionNames: readonly string[],
  permissionMap: Map<string, string>,
) {
  const permissionIds = permissionNames.map((permissionName) => {
    const permissionId = permissionMap.get(permissionName);

    if (!permissionId) {
      throw new Error(`Permission not found: ${permissionName}`);
    }

    return permissionId;
  });

  await prisma.rolePermission.deleteMany({
    where: {
      roleId,
      permissionId: {
        notIn: permissionIds,
      },
    },
  });

  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
      update: {},
      create: {
        roleId,
        permissionId,
      },
    });
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("🌱 Starting database seed...");

  // ==========================================================
  // LEGACY ROLE MIGRATION
  // ==========================================================

  await migrateLegacyAdminRole();

  // ==========================================================
  // PERMISSIONS
  // ==========================================================

  const permissionMap = new Map<string, string>();

  for (const permissionData of permissions) {
    const permission = await prisma.permission.upsert({
      where: { name: permissionData.name },
      update: { description: permissionData.description },
      create: {
        name: permissionData.name,
        description: permissionData.description,
      },
    });

    permissionMap.set(permission.name, permission.id);
  }

  console.log(`✓ ${permissions.length} permissions ready`);

  // ==========================================================
  // ROLES
  // ==========================================================

  const roleMap = new Map<string, string>();

  for (const roleData of roleDefinitions) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: {
        description: roleData.description,
        scope: roleData.scope,
      },
      create: {
        name: roleData.name,
        description: roleData.description,
        scope: roleData.scope,
      },
    });

    roleMap.set(role.name, role.id);
  }

  console.log(`✓ ${roleDefinitions.length} system roles ready`);

  // ==========================================================
  // ROLE PERMISSIONS
  // ==========================================================

  for (const roleData of roleDefinitions) {
    const roleId = roleMap.get(roleData.name);

    if (!roleId) {
      throw new Error(`Role not found: ${roleData.name}`);
    }

    await syncRolePermissions(
      roleId,
      rolePermissions[roleData.name],
      permissionMap,
    );

    console.log(`✓ ${roleData.name} permissions synchronized`);
  }

  // ==========================================================
  // RBAC INTEGRITY
  // ==========================================================

  const superAdminRoleId = roleMap.get("SUPER_ADMIN");

  if (!superAdminRoleId) {
    throw new Error("SUPER_ADMIN role not found");
  }

  const superAdminCount = await prisma.userRole.count({
    where: { roleId: superAdminRoleId },
  });

  if (superAdminCount > 1) {
    throw new Error(
      `Invalid RBAC state: ${superAdminCount} users have SUPER_ADMIN role. Only one is allowed.`,
    );
  }

  const invalidGlobalAssignments = await prisma.userRole.count({
    where: {
      role: {
        scope: "WEBSITE",
      },
    },
  });

  if (invalidGlobalAssignments > 0) {
    throw new Error(
      `Invalid RBAC state: ${invalidGlobalAssignments} WEBSITE role assignments exist in user_role.`,
    );
  }

  const invalidWebsiteAssignments = await prisma.userWebsiteRole.count({
    where: {
      role: {
        scope: "GLOBAL",
      },
    },
  });

  if (invalidWebsiteAssignments > 0) {
    throw new Error(
      `Invalid RBAC state: ${invalidWebsiteAssignments} GLOBAL role assignments exist in user_website_role.`,
    );
  }

  console.log("✓ RBAC integrity checks passed");
  console.log("🌱 Database seed completed.");
}

// ============================================================
// EXECUTE
// ============================================================

main()
  .catch((error) => {
    console.error("❌ Seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
