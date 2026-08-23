-- ============================================================
-- ROLE SCOPE
-- ============================================================

CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'WEBSITE');

ALTER TABLE "role"
ADD COLUMN "scope" "RoleScope" NOT NULL DEFAULT 'WEBSITE';

UPDATE "role"
SET "scope" = 'GLOBAL'
WHERE UPPER("name") = 'SUPER_ADMIN';

CREATE INDEX "role_scope_idx"
ON "role"("scope");

-- ============================================================
-- USER INVITATION RELATIONS
-- ============================================================

ALTER TABLE "user_invitation"
ADD COLUMN "userId" TEXT,
ADD COLUMN "invitedById" TEXT,
ADD COLUMN "revokedAt" TIMESTAMP(3);

UPDATE "user_invitation" AS invitation
SET "userId" = "user"."id"
FROM "user"
WHERE LOWER("user"."email") = LOWER(invitation."email")
AND invitation."userId" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "user_invitation"
    WHERE "userId" IS NULL
  ) THEN
    RAISE EXCEPTION
      'Migration aborted: an invitation could not be matched to an existing user.';
  END IF;
END
$$;

ALTER TABLE "user_invitation"
ALTER COLUMN "userId" SET NOT NULL;

CREATE INDEX "user_invitation_userId_idx"
ON "user_invitation"("userId");

CREATE INDEX "user_invitation_invitedById_idx"
ON "user_invitation"("invitedById");

CREATE INDEX "user_invitation_revokedAt_idx"
ON "user_invitation"("revokedAt");

ALTER TABLE "user_invitation"
ADD CONSTRAINT "user_invitation_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "user"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "user_invitation"
ADD CONSTRAINT "user_invitation_invitedById_fkey"
FOREIGN KEY ("invitedById")
REFERENCES "user"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- ============================================================
-- WEBSITE-SCOPED USER ROLE
-- ============================================================

CREATE TABLE "user_website_role" (
  "userId" TEXT NOT NULL,
  "websiteId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_website_role_pkey"
  PRIMARY KEY ("userId", "websiteId")
);

CREATE INDEX "user_website_role_websiteId_idx"
ON "user_website_role"("websiteId");

CREATE INDEX "user_website_role_roleId_idx"
ON "user_website_role"("roleId");

CREATE INDEX "user_website_role_websiteId_roleId_idx"
ON "user_website_role"("websiteId", "roleId");

ALTER TABLE "user_website_role"
ADD CONSTRAINT "user_website_role_userId_fkey"
FOREIGN KEY ("userId")
REFERENCES "user"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "user_website_role"
ADD CONSTRAINT "user_website_role_websiteId_fkey"
FOREIGN KEY ("websiteId")
REFERENCES "website"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "user_website_role"
ADD CONSTRAINT "user_website_role_roleId_fkey"
FOREIGN KEY ("roleId")
REFERENCES "role"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

-- ============================================================
-- REMOVE LEGACY USER_WEBSITE
-- ============================================================

ALTER TABLE "user_website"
DROP CONSTRAINT "user_website_userId_fkey";

ALTER TABLE "user_website"
DROP CONSTRAINT "user_website_websiteId_fkey";

DROP TABLE "user_website";