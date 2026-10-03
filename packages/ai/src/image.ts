import sharp from 'sharp';

export interface PreparedImage {
  data: Buffer;
  mediaType: 'image/jpeg';
  width: number;
  height: number;
  base64: string;
}

export interface ImagePrepOptions {
  /**
   * Longest side in pixels after downscaling. ~1568 px keeps Claude below its internal resize
   * threshold and bounds image tokens for every vendor. Images are never upscaled.
   */
  maxSide: number;
  /** JPEG quality 1..100. */
  quality: number;
}

export const DEFAULT_IMAGE_PREP: ImagePrepOptions = { maxSide: 1568, quality: 85 };

/** Applies EXIF orientation, downsizes to `maxSide`, re-encodes as JPEG (strips metadata such as GPS). */
export async function prepareImage(input: Uint8Array, opts: ImagePrepOptions = DEFAULT_IMAGE_PREP): Promise<PreparedImage> {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: opts.maxSide, height: opts.maxSide, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: opts.quality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });
  return { data, mediaType: 'image/jpeg', width: info.width, height: info.height, base64: data.toString('base64') };
}
