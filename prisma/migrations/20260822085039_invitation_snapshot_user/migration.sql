/*
  Warnings:

  - Added the required column `name` to the `user_invitation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "user_invitation" ADD COLUMN     "name" TEXT NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;
