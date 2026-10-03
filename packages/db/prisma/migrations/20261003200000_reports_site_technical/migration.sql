-- P6 reports: report lifecycle (queued -> running -> ready | failed) and per-site technical data.
ALTER TYPE "ReportStatus" RENAME VALUE 'draft' TO 'queued';
ALTER TYPE "ReportStatus" RENAME VALUE 'generating' TO 'running';
ALTER TYPE "ReportStatus" RENAME VALUE 'generated' TO 'ready';
ALTER TABLE "reports" ALTER COLUMN "status" SET DEFAULT 'queued';

ALTER TABLE "reports"
  ADD COLUMN "draft" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "docxBytes" INTEGER,
  ADD COLUMN "pdfBytes" INTEGER,
  ADD COLUMN "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "meta" JSONB,
  ADD COLUMN "startedAt" TIMESTAMPTZ(3),
  ADD COLUMN "finishedAt" TIMESTAMPTZ(3);

CREATE TABLE "site_technical_data" (
    "siteId" TEXT NOT NULL,
    "siteData" JSONB,
    "inventory" JSONB,
    "lld" JSONB,
    "portMap" JSONB,
    "utilization" JSONB,
    "fiberTests" JSONB,
    "survey" JSONB,
    "sources" JSONB,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "site_technical_data_pkey" PRIMARY KEY ("siteId")
);

ALTER TABLE "site_technical_data" ADD CONSTRAINT "site_technical_data_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
