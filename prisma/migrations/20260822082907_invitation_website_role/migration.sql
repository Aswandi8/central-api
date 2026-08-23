/*
  Warnings:

  - Added the required column `roleId` to the `user_invitation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `websiteId` to the `user_invitation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_invitation" ADD COLUMN     "roleId" TEXT NOT NULL,
ADD COLUMN     "websiteId" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "user_invitation_websiteId_idx" ON "user_invitation"("websiteId");

-- CreateIndex
CREATE INDEX "user_invitation_roleId_idx" ON "user_invitation"("roleId");

-- CreateIndex
CREATE INDEX "user_invitation_userId_websiteId_idx" ON "user_invitation"("userId", "websiteId");

-- CreateIndex
CREATE INDEX "user_invitation_websiteId_roleId_idx" ON "user_invitation"("websiteId", "roleId");

-- AddForeignKey
ALTER TABLE "user_invitation" ADD CONSTRAINT "user_invitation_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitation" ADD CONSTRAINT "user_invitation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
