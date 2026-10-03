import { createHash } from 'node:crypto';
import exifr from 'exifr';
import sharp from 'sharp';
import { DomainError } from '../core/errors.js';

export const ACCEPTED_FORMATS = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' } as const;
type AcceptedFormat = keyof typeof ACCEPTED_FORMATS;

export const VARIANTS = {
  /** Review queue / mobile list thumbnails. */
  thumb: { maxSide: 320, quality: 70 },
  /** Review screen and AI input (keeps token cost bounded). */
  web: { maxSide: 1600, quality: 82 },
} as const;

export interface ExifSummary {
  make?: string;
  model?: string;
  software?: string;
  takenAt?: string;
  orientation?: number;
  gps?: { lat: number; lng: number; altitude?: number };
}

export interface ProcessedImage {
  sha256: string;
  mimeType: (typeof ACCEPTED_FORMATS)[AcceptedFormat];
  ext: 'jpg' | 'png' | 'webp';
  width: number;
  height: number;
  sizeBytes: number;
  exif: ExifSummary | null;
  web: Buffer;
  thumb: Buffer;
}

export function sha256Hex(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Storage keys are content-addressed so identical bytes are stored once. */
export function photoKeys(sha256: string, ext: string): { original: string; web: string; thumb: string } {
  const base = `photos/${sha256.slice(0, 2)}/${sha256}`;
  return { original: `${base}/original.${ext}`, web: `${base}/web.jpg`, thumb: `${base}/thumb.jpg` };
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : undefined);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export async function extractExif(data: Uint8Array): Promise<ExifSummary | null> {
  try {
    const raw = (await exifr.parse(Buffer.from(data), { tiff: true, exif: true, gps: true, xmp: false, icc: false, iptc: false })) as
      | Record<string, unknown>
      | undefined;
    if (!raw) return null;
    const lat = num(raw.latitude);
    const lng = num(raw.longitude);
    const taken = raw.DateTimeOriginal ?? raw.CreateDate;
    return {
      make: str(raw.Make),
      model: str(raw.Model),
      software: str(raw.Software),
      takenAt: taken instanceof Date && !Number.isNaN(taken.getTime()) ? taken.toISOString() : undefined,
      orientation: num(raw.Orientation),
      gps: lat !== undefined && lng !== undefined && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, altitude: num(raw.GPSAltitude) } : undefined,
    };
  } catch {
    return null; // EXIF is best effort; a photo without readable EXIF is still valid.
  }
}

/**
 * Validate the bytes by decoding them (never trust the client's content type), hash them,
 * read EXIF and render auto-rotated JPEG variants.
 */
export async function processImage(data: Uint8Array): Promise<ProcessedImage> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(data, { failOn: 'error' }).metadata();
  } catch {
    throw new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE', 'File is not a readable image');
  }
  const format = meta.format as string | undefined;
  if (!format || !(format in ACCEPTED_FORMATS)) {
    throw new DomainError(415, 'UNSUPPORTED_MEDIA_TYPE', `Unsupported image format ${format ?? 'unknown'}; use JPEG, PNG or WebP`);
  }
  const accepted = format as AcceptedFormat;
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) {
    throw new DomainError(422, 'IMAGE_TOO_SMALL', 'Image must be at least 64x64 pixels');
  }
  const render = (v: { maxSide: number; quality: number }) =>
    sharp(data)
      .rotate() // apply EXIF orientation
      .resize({ width: v.maxSide, height: v.maxSide, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: v.quality, mozjpeg: true })
      .toBuffer();
  const [web, thumb, exif] = await Promise.all([render(VARIANTS.web), render(VARIANTS.thumb), extractExif(data)]);
  const rotated = (meta.orientation ?? 1) >= 5;
  return {
    sha256: sha256Hex(data),
    mimeType: ACCEPTED_FORMATS[accepted],
    ext: accepted === 'jpeg' ? 'jpg' : accepted,
    width: rotated ? meta.height : meta.width,
    height: rotated ? meta.width : meta.height,
    sizeBytes: data.byteLength,
    exif,
    web,
    thumb,
  };
}
