-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('admin', 'pm', 'reviewer', 'engineer', 'technician', 'viewer');

-- CreateEnum
CREATE TYPE "PhotoCategory" AS ENUM ('rack', 'rack_base', 'router', 'patch_cords', 'armoured_cables', 'duct', 'management', 'odf_cross_connect', 'odf_cross_connect_labels', 'odf_tie', 'odf_tie_labels', 'odf_sheet', 'uplink', 'uplink_labels', 'pdu', 'power_path', 'earth_path', 'power_labels', 'power_system', 'test_room');

-- CreateEnum
CREATE TYPE "PhotoStatus" AS ENUM ('captured', 'uploaded', 'ai_analyzed', 'pending_review', 'approved', 'rejected', 'fixed');

-- CreateEnum
CREATE TYPE "SnagStatus" AS ENUM ('open', 'fixed', 'verified');

-- CreateEnum
CREATE TYPE "SnagSource" AS ENUM ('ai', 'human');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('minor', 'major', 'critical');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('agree', 'override', 'add_snag');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('accept', 'reject', 'uncertain');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('planned', 'in_progress', 'submitted', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "VisitType" AS ENUM ('installation', 'snag_fix', 'survey');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('open', 'submitted');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('succeeded', 'failed');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('draft', 'generating', 'generated', 'failed');

-- CreateEnum
CREATE TYPE "ReleaseChannel" AS ENUM ('production', 'staging');

-- CreateEnum
CREATE TYPE "CompanyKind" AS ENUM ('contractor', 'client', 'vendor');

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CompanyKind" NOT NULL DEFAULT 'contractor',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "conditions" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "companyId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "clientName" TEXT,
    "description" TEXT,
    "companyId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "region" TEXT,
    "room" TEXT,
    "floor" TEXT,
    "racks" INTEGER,
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "meta" JSONB,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "hostname" TEXT,
    "serial" TEXT,
    "loopbackIp" TEXT,
    "role" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "VisitType" NOT NULL DEFAULT 'installation',
    "status" "VisitStatus" NOT NULL DEFAULT 'planned',
    "scheduledFor" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_assignments" (
    "visitId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "assignedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_assignments_pkey" PRIMARY KEY ("visitId","userId")
);

-- CreateTable
CREATE TABLE "checklist_templates" (
    "id" TEXT NOT NULL,
    "category" "PhotoCategory" NOT NULL,
    "version" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "titleAr" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "textAr" TEXT NOT NULL,
    "guardsCodes" TEXT[],
    "sidRef" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "category" "PhotoCategory" NOT NULL,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'open',
    "submittedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photos" (
    "id" TEXT NOT NULL,
    "clientUuid" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "visitId" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "category" "PhotoCategory" NOT NULL,
    "status" "PhotoStatus" NOT NULL DEFAULT 'uploaded',
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "originalKey" TEXT NOT NULL,
    "webKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "exif" JSONB,
    "capturedAt" TIMESTAMPTZ(3),
    "gpsLat" DOUBLE PRECISION,
    "gpsLng" DOUBLE PRECISION,
    "gpsAccuracy" DOUBLE PRECISION,
    "deviceInfo" JSONB,
    "duplicateOfId" TEXT,
    "fixesPhotoId" TEXT,
    "aiSkipReason" TEXT,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "rejectionReason" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "verdict" "Verdict",
    "confidence" DOUBLE PRECISION,
    "categoryMatches" BOOLEAN,
    "detectedCategory" "PhotoCategory",
    "qualityIssues" TEXT[],
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DECIMAL(12,6),
    "latencyMs" INTEGER,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "raw" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "snags" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "analysisId" TEXT,
    "code" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "bbox" JSONB,
    "textAr" TEXT NOT NULL,
    "textEn" TEXT NOT NULL,
    "status" "SnagStatus" NOT NULL DEFAULT 'open',
    "source" "SnagSource" NOT NULL,
    "createdById" TEXT,
    "dismissedAt" TIMESTAMPTZ(3),
    "dismissedById" TEXT,
    "fixPhotoId" TEXT,
    "fixedAt" TIMESTAMPTZ(3),
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "snags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "analysisId" TEXT,
    "snagId" TEXT,
    "decision" "ReviewDecision" NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "aiVerdict" "Verdict",
    "category" "PhotoCategory" NOT NULL,
    "reason" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autonomy_policies" (
    "id" TEXT NOT NULL,
    "category" "PhotoCategory" NOT NULL,
    "minSamples" INTEGER NOT NULL DEFAULT 200,
    "minAgreement" DOUBLE PRECISION NOT NULL DEFAULT 0.98,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.9,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "autonomy_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "docxKey" TEXT,
    "pdfKey" TEXT,
    "error" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT,
    "unit" TEXT NOT NULL,
    "partNumber" TEXT,
    "meta" JSONB,

    CONSTRAINT "material_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_lines" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "materialItemId" TEXT,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "partNumber" TEXT,
    "qty" DOUBLE PRECISION,
    "unit" TEXT,
    "serials" TEXT[],
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "statusCode" INTEGER NOT NULL,
    "requestId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_releases" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "runtimeVersion" TEXT NOT NULL,
    "apkKey" TEXT,
    "bundleKey" TEXT,
    "minSupported" TEXT NOT NULL,
    "notes" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMPTZ(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_releases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_roleId_action_subject_key" ON "permissions"("roleId", "action", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");

-- CreateIndex
CREATE INDEX "sites_projectId_idx" ON "sites"("projectId");

-- CreateIndex
CREATE INDEX "devices_serial_idx" ON "devices"("serial");

-- CreateIndex
CREATE UNIQUE INDEX "devices_siteId_hostname_key" ON "devices"("siteId", "hostname");

-- CreateIndex
CREATE INDEX "visits_siteId_idx" ON "visits"("siteId");

-- CreateIndex
CREATE INDEX "visits_status_idx" ON "visits"("status");

-- CreateIndex
CREATE INDEX "visit_assignments_userId_idx" ON "visit_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_templates_category_version_key" ON "checklist_templates"("category", "version");

-- CreateIndex
CREATE UNIQUE INDEX "checklist_items_templateId_code_key" ON "checklist_items"("templateId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_visitId_category_key" ON "submissions"("visitId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "photos_clientUuid_key" ON "photos"("clientUuid");

-- CreateIndex
CREATE INDEX "photos_status_category_uploadedAt_idx" ON "photos"("status", "category", "uploadedAt");

-- CreateIndex
CREATE INDEX "photos_siteId_idx" ON "photos"("siteId");

-- CreateIndex
CREATE INDEX "photos_visitId_idx" ON "photos"("visitId");

-- CreateIndex
CREATE INDEX "photos_sha256_idx" ON "photos"("sha256");

-- CreateIndex
CREATE INDEX "analyses_photoId_createdAt_idx" ON "analyses"("photoId", "createdAt");

-- CreateIndex
CREATE INDEX "analyses_createdAt_idx" ON "analyses"("createdAt");

-- CreateIndex
CREATE INDEX "snags_photoId_idx" ON "snags"("photoId");

-- CreateIndex
CREATE INDEX "snags_status_code_idx" ON "snags"("status", "code");

-- CreateIndex
CREATE INDEX "reviews_photoId_createdAt_idx" ON "reviews"("photoId", "createdAt");

-- CreateIndex
CREATE INDEX "reviews_category_createdAt_idx" ON "reviews"("category", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "autonomy_policies_category_key" ON "autonomy_policies"("category");

-- CreateIndex
CREATE UNIQUE INDEX "reports_siteId_version_key" ON "reports"("siteId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "material_items_code_key" ON "material_items"("code");

-- CreateIndex
CREATE INDEX "bom_lines_siteId_idx" ON "bom_lines"("siteId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_version_channel_key" ON "app_releases"("version", "channel");

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_assignments" ADD CONSTRAINT "visit_assignments_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_assignments" ADD CONSTRAINT "visit_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_assignments" ADD CONSTRAINT "visit_assignments_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_visitId_fkey" FOREIGN KEY ("visitId") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photos" ADD CONSTRAINT "photos_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_dismissedById_fkey" FOREIGN KEY ("dismissedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_fixPhotoId_fkey" FOREIGN KEY ("fixPhotoId") REFERENCES "photos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "snags" ADD CONSTRAINT "snags_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "photos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_snagId_fkey" FOREIGN KEY ("snagId") REFERENCES "snags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autonomy_policies" ADD CONSTRAINT "autonomy_policies_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_lines" ADD CONSTRAINT "bom_lines_materialItemId_fkey" FOREIGN KEY ("materialItemId") REFERENCES "material_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_releases" ADD CONSTRAINT "app_releases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
