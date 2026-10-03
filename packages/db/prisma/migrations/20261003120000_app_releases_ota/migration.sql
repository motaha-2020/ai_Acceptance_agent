-- T5.5-T5.9: native APK releases (download + forced update) and self-hosted expo-updates OTA.
-- AlterTable
ALTER TABLE "app_releases" ADD COLUMN     "apkSha256" TEXT,
ADD COLUMN     "apkSizeBytes" INTEGER,
ADD COLUMN     "minSupportedVersionCode" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'android',
ADD COLUMN     "versionCode" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ota_updates" (
    "id" UUID NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'android',
    "runtimeVersion" TEXT NOT NULL,
    "message" TEXT,
    "isCritical" BOOLEAN NOT NULL DEFAULT false,
    "launchAsset" JSONB NOT NULL,
    "assets" JSONB NOT NULL,
    "expoClient" JSONB,
    "gitCommit" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ota_updates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_channel_heads" (
    "channel" "ReleaseChannel" NOT NULL,
    "platform" TEXT NOT NULL,
    "runtimeVersion" TEXT NOT NULL,
    "updateId" UUID,
    "rollBackToEmbedded" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ota_channel_heads_pkey" PRIMARY KEY ("channel","platform","runtimeVersion")
);

-- CreateIndex
CREATE INDEX "ota_updates_channel_platform_runtimeVersion_createdAt_idx" ON "ota_updates"("channel", "platform", "runtimeVersion", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_releases_platform_channel_versionCode_key" ON "app_releases"("platform", "channel", "versionCode");

-- AddForeignKey
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_channel_heads" ADD CONSTRAINT "ota_channel_heads_updateId_fkey" FOREIGN KEY ("updateId") REFERENCES "ota_updates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ota_channel_heads" ADD CONSTRAINT "ota_channel_heads_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- An OTA update is what devices downloaded and verified (signed manifest): never edit it in place.
-- Publish a new update or move the channel head instead.
CREATE TRIGGER ota_updates_immutable
  BEFORE UPDATE ON "ota_updates"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
