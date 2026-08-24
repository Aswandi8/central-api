-- CreateEnum
CREATE TYPE "ShortLinkStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ShortLinkPreviewType" AS ENUM ('NONE', 'IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "ShortLinkVisitorType" AS ENUM ('HUMAN', 'CRAWLER', 'BOT', 'UNKNOWN');

-- CreateTable
CREATE TABLE "short_link" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "destinationUrl" TEXT NOT NULL,
    "status" "ShortLinkStatus" NOT NULL DEFAULT 'ACTIVE',
    "previewType" "ShortLinkPreviewType" NOT NULL DEFAULT 'NONE',
    "title" TEXT,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "thumbnailWidth" INTEGER,
    "thumbnailHeight" INTEGER,
    "thumbnailMimeType" TEXT,
    "thumbnailSizeBytes" INTEGER,
    "previewVideoUrl" TEXT,
    "previewVideoWidth" INTEGER,
    "previewVideoHeight" INTEGER,
    "previewVideoDurationMs" INTEGER,
    "previewVideoMimeType" TEXT,
    "previewVideoSizeBytes" INTEGER,
    "showPlayButton" BOOLEAN NOT NULL DEFAULT false,
    "displayDuration" TEXT,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "short_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "short_link_click" (
    "id" TEXT NOT NULL,
    "shortLinkId" TEXT NOT NULL,
    "visitorType" "ShortLinkVisitorType" NOT NULL DEFAULT 'UNKNOWN',
    "ipHash" TEXT,
    "referrer" TEXT,
    "userAgent" TEXT,
    "country" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "short_link_click_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "short_link_slug_key" ON "short_link"("slug");

-- CreateIndex
CREATE INDEX "short_link_status_idx" ON "short_link"("status");

-- CreateIndex
CREATE INDEX "short_link_previewType_idx" ON "short_link"("previewType");

-- CreateIndex
CREATE INDEX "short_link_createdById_idx" ON "short_link"("createdById");

-- CreateIndex
CREATE INDEX "short_link_createdAt_idx" ON "short_link"("createdAt");

-- CreateIndex
CREATE INDEX "short_link_click_shortLinkId_idx" ON "short_link_click"("shortLinkId");

-- CreateIndex
CREATE INDEX "short_link_click_clickedAt_idx" ON "short_link_click"("clickedAt");

-- CreateIndex
CREATE INDEX "short_link_click_shortLinkId_clickedAt_idx" ON "short_link_click"("shortLinkId", "clickedAt");

-- CreateIndex
CREATE INDEX "short_link_click_shortLinkId_visitorType_clickedAt_idx" ON "short_link_click"("shortLinkId", "visitorType", "clickedAt");

-- CreateIndex
CREATE INDEX "short_link_click_shortLinkId_ipHash_idx" ON "short_link_click"("shortLinkId", "ipHash");

-- AddForeignKey
ALTER TABLE "short_link" ADD CONSTRAINT "short_link_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "short_link_click" ADD CONSTRAINT "short_link_click_shortLinkId_fkey" FOREIGN KEY ("shortLinkId") REFERENCES "short_link"("id") ON DELETE CASCADE ON UPDATE CASCADE;
