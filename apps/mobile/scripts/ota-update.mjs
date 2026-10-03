#!/usr/bin/env node
// Turns an `expo export --platform android` output directory into the body of POST /api/v1/updates
// (CreateOtaUpdateRequest in @acceptance/shared) plus the list of files to upload to object storage.
//
//   node scripts/ota-update.mjs <distDir> --channel staging --runtime 1.0.0 --prefix ota/android/1.0.0/<id>
//        [--message "..."] [--critical] [--commit abc1234] [--expo-config dist/expo-config.json]
// Writes <distDir>/update.json and <distDir>/uploads.txt (lines: "<local path>\t<storage key>\t<content type>").
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  xml: 'application/xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  json: 'application/json',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  mp4: 'video/mp4',
};

export function contentTypeFor(ext) {
  return CONTENT_TYPES[ext.toLowerCase()] ?? 'application/octet-stream';
}

const sha256b64url = (buf) => createHash('sha256').update(buf).digest('base64url');
const md5hex = (buf) => createHash('md5').update(buf).digest('hex');
const posix = (p) => p.split(/[\\/]+/).join('/');

/**
 * @param {string} distDir   expo export output
 * @param {{channel:string, runtimeVersion:string, prefix:string, message?:string, critical?:boolean, gitCommit?:string, expoClient?:object}} opts
 * @param {(p:string)=>Buffer} [read]
 */
export function buildUpdateRequest(distDir, opts, read = (p) => readFileSync(p)) {
  if (!/^ota\/[A-Za-z0-9._/-]+$/.test(opts.prefix)) throw new Error(`bad storage prefix ${opts.prefix}`);
  const metadata = JSON.parse(read(path.join(distDir, 'metadata.json')).toString('utf8'));
  const android = metadata?.fileMetadata?.android;
  if (!android?.bundle) throw new Error('metadata.json has no android bundle (run expo export --platform android)');

  const uploads = [];
  const entry = (relPath, ext, contentType) => {
    const rel = posix(relPath);
    const local = path.join(distDir, rel);
    const data = read(local);
    const storageKey = `${opts.prefix}/${rel}`;
    uploads.push({ local, storageKey, contentType });
    return { hash: sha256b64url(data), key: md5hex(data), contentType, storageKey, ...(ext ? { fileExtension: `.${ext}` } : {}) };
  };

  const launchAsset = entry(android.bundle, null, 'application/javascript');
  const seen = new Set();
  const assets = [];
  for (const a of android.assets ?? []) {
    const rel = posix(a.path);
    if (seen.has(rel)) continue;
    seen.add(rel);
    assets.push(entry(rel, a.ext, contentTypeFor(a.ext)));
  }
  const body = {
    channel: opts.channel,
    platform: 'android',
    runtimeVersion: opts.runtimeVersion,
    ...(opts.message ? { message: opts.message } : {}),
    isCritical: Boolean(opts.critical),
    launchAsset,
    assets,
    ...(opts.expoClient ? { expoClient: opts.expoClient } : {}),
    ...(opts.gitCommit ? { gitCommit: opts.gitCommit } : {}),
    publish: true,
  };
  return { body, uploads };
}

function arg(argv, name) {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

function main(argv) {
  const distDir = argv[0];
  if (!distDir) throw new Error('usage: ota-update.mjs <distDir> --channel C --runtime R --prefix P');
  const expoConfigPath = arg(argv, '--expo-config');
  const expoClient = expoConfigPath ? JSON.parse(readFileSync(expoConfigPath, 'utf8')) : undefined;
  const { body, uploads } = buildUpdateRequest(distDir, {
    channel: arg(argv, '--channel') ?? 'staging',
    runtimeVersion: arg(argv, '--runtime') ?? '',
    prefix: arg(argv, '--prefix') ?? '',
    message: arg(argv, '--message'),
    critical: argv.includes('--critical'),
    gitCommit: arg(argv, '--commit'),
    expoClient,
  });
  writeFileSync(path.join(distDir, 'update.json'), JSON.stringify(body));
  writeFileSync(
    path.join(distDir, 'uploads.txt'),
    uploads.map((u) => `${posix(path.relative(distDir, u.local))}\t${u.storageKey}\t${u.contentType}`).join('\n') + '\n',
  );
  process.stdout.write(`${uploads.length} files, launch asset ${body.launchAsset.storageKey}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
