/*
  Warnings:

  - You are about to drop the column `storageKey` on the `social_share` table. All the data in the column will be lost.
  - You are about to drop the column `streamUrl` on the `social_share` table. All the data in the column will be lost.
  - Made the column `videoUrl` on table `social_share` required. This step will fail if there are existing NULL values in that column.
  - Made the column `thumbnail` on table `social_share` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "social_share" DROP COLUMN "storageKey",
DROP COLUMN "streamUrl",
ALTER COLUMN "videoUrl" SET NOT NULL,
ALTER COLUMN "thumbnail" SET NOT NULL;
