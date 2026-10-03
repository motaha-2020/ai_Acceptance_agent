import { Inject, Injectable } from '@nestjs/common';
import type { Photo } from '@acceptance/db';
import type { ObjectStorage } from '@acceptance/storage';
import type { AppConfig } from '../config/config.js';
import { CONFIG, STORAGE } from '../core/tokens.js';

export interface PhotoUrls {
  thumb: string;
  web: string;
  original: string;
  expiresAt: string;
}

export type PhotoDto = Omit<Photo, 'exif' | 'deviceInfo' | 'originalKey' | 'webKey' | 'thumbKey' | 'gpsLat' | 'gpsLng' | 'gpsAccuracy'> & {
  gps: { lat: number; lng: number; accuracy: number | null } | null;
  urls: PhotoUrls;
};

/** Maps Photo rows to API DTOs with short-lived signed download URLs (storage keys stay private). */
@Injectable()
export class PhotoPresenter {
  constructor(
    @Inject(STORAGE) private readonly storage: ObjectStorage,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async urls(p: Pick<Photo, 'id' | 'originalKey' | 'webKey' | 'thumbKey' | 'mimeType'>): Promise<PhotoUrls> {
    const expiresIn = this.config.SIGNED_URL_TTL_SECONDS;
    const ext = p.originalKey.split('.').pop() ?? 'jpg';
    const [thumb, web, original] = await Promise.all([
      this.storage.signedUrl(p.thumbKey, { expiresIn }),
      this.storage.signedUrl(p.webKey, { expiresIn }),
      this.storage.signedUrl(p.originalKey, { expiresIn, downloadName: `${p.id}.${ext}` }),
    ]);
    return { thumb, web, original, expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString() };
  }

  async present(p: Photo): Promise<PhotoDto> {
    const { exif: _exif, deviceInfo: _deviceInfo, originalKey: _o, webKey: _w, thumbKey: _t, gpsLat, gpsLng, gpsAccuracy, ...rest } = p;
    return {
      ...rest,
      gps: gpsLat !== null && gpsLng !== null ? { lat: gpsLat, lng: gpsLng, accuracy: gpsAccuracy } : null,
      urls: await this.urls(p),
    };
  }

  /** Detail view also exposes EXIF and device info. */
  async presentDetail(p: Photo): Promise<PhotoDto & { exif: Photo['exif']; deviceInfo: Photo['deviceInfo'] }> {
    return { ...(await this.present(p)), exif: p.exif, deviceInfo: p.deviceInfo };
  }

  presentMany(rows: Photo[]): Promise<PhotoDto[]> {
    return Promise.all(rows.map((r) => this.present(r)));
  }
}
