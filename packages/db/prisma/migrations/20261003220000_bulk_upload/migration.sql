-- ADR 0005 phase A: bulk upload (capture source, upload batch, AI-proposed category awaiting confirmation).
-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('camera', 'web_bulk', 'app_gallery');

-- CreateEnum
CREATE TYPE "CategoryState" AS ENUM ('confirmed', 'classifying', 'proposed');

-- AlterTable
ALTER TABLE "photos" ADD COLUMN     "captureSource" "CaptureSource" NOT NULL DEFAULT 'camera',
ADD COLUMN     "categoryConfidence" DOUBLE PRECISION,
ADD COLUMN     "categoryState" "CategoryState" NOT NULL DEFAULT 'confirmed',
ADD COLUMN     "fileName" TEXT,
ADD COLUMN     "proposedAlternative" "PhotoCategory",
ADD COLUMN     "proposedCategory" "PhotoCategory",
ADD COLUMN     "uploadBatchId" TEXT;

-- CreateIndex
CREATE INDEX "photos_uploadBatchId_idx" ON "photos"("uploadBatchId");

