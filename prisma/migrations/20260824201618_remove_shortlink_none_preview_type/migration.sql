/*
  Warnings:

  - The values [NONE] on the enum `ShortLinkPreviewType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ShortLinkPreviewType_new" AS ENUM ('IMAGE', 'VIDEO');
ALTER TABLE "public"."short_link" ALTER COLUMN "previewType" DROP DEFAULT;
ALTER TABLE "short_link" ALTER COLUMN "previewType" TYPE "ShortLinkPreviewType_new" USING ("previewType"::text::"ShortLinkPreviewType_new");
ALTER TYPE "ShortLinkPreviewType" RENAME TO "ShortLinkPreviewType_old";
ALTER TYPE "ShortLinkPreviewType_new" RENAME TO "ShortLinkPreviewType";
DROP TYPE "public"."ShortLinkPreviewType_old";
COMMIT;

-- AlterTable
ALTER TABLE "short_link" ALTER COLUMN "previewType" DROP DEFAULT;
