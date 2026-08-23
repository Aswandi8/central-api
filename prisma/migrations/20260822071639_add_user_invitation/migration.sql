-- CreateTable
CREATE TABLE "user_invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_invitation_tokenHash_key" ON "user_invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "user_invitation_email_idx" ON "user_invitation"("email");

-- CreateIndex
CREATE INDEX "user_invitation_expiresAt_idx" ON "user_invitation"("expiresAt");

-- CreateIndex
CREATE INDEX "user_invitation_usedAt_idx" ON "user_invitation"("usedAt");
