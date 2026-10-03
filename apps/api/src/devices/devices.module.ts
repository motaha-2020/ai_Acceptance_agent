import { Module } from '@nestjs/common';
import { DevicesController, DevicesService } from './devices.js';

@Module({ controllers: [DevicesController], providers: [DevicesService], exports: [DevicesService] })
export class DevicesModule {}
