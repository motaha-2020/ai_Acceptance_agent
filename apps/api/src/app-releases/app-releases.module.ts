import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller.js';
import { OtaService } from './ota.service.js';
import { AppReleasesAliasController, AppReleasesController } from './releases.controller.js';
import { AppReleasesService } from './releases.service.js';

/** Mobile distribution: APK releases (T5.6/T5.8) and the self-hosted OTA update server (T5.7). */
@Module({
  controllers: [AppReleasesController, AppReleasesAliasController, OtaController],
  providers: [AppReleasesService, OtaService],
})
export class AppReleasesModule {}
