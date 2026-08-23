-- CreateEnum
CREATE TYPE "SocialShareStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "social_share" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "videoUrl" TEXT,
    "streamUrl" TEXT,
    "storageKey" TEXT,
    "thumbnail" TEXT,
    "shareThumbnail" TEXT,
    "duration" INTEGER,
    "displayDuration" TEXT,
    "targetUrl" TEXT NOT NULL,
    "status" "SocialShareStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "social_share_websiteId_idx" ON "social_share"("websiteId");

-- CreateIndex
CREATE INDEX "social_share_status_idx" ON "social_share"("status");

-- CreateIndex
CREATE INDEX "social_share_createdAt_idx" ON "social_share"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "social_share_websiteId_slug_key" ON "social_share"("websiteId", "slug");

-- AddForeignKey
ALTER TABLE "social_share" ADD CONSTRAINT "social_share_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
