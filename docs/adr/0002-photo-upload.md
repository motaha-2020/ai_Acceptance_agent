# ADR 0002: Photo upload — idempotent single-request uploads, content-addressed storage

Status: accepted (2026-10-03, P2/T2.4)

## Context
Technicians capture photos offline inside exchanges (weak or no signal). The mobile app keeps a
local queue and retries uploads until they succeed. Photos are ~150 KB–5 MB (790 sample photos
average ~170 KB). A retry after a lost response must never create a second photo, and the same
photo must not be silently re-used for another site.

## Decision
1. **One multipart request per photo** (`POST /api/v1/photos`, fields `metadata` JSON + `file`),
   max `UPLOAD_MAX_BYTES` (default 25 MB). No chunked/resumable protocol (tus/S3 multipart) for now.
2. **Idempotency key = `clientUuid`** generated on the device at capture time and stored with a
   UNIQUE constraint:
   - same `clientUuid` again (same uploader + visit) → `200` with the stored photo and
     `duplicate: "client_uuid"`; no new row, no new analysis job;
   - concurrent retries race on the unique index; losers return the winner's photo;
   - same `clientUuid` for a different visit/uploader → `409 CLIENT_UUID_CONFLICT`.
3. **Content addressing**: SHA-256 of the original bytes. Objects live at
   `photos/<sha[0:2]>/<sha>/{original.<ext>,web.jpg,thumb.jpg}` and are written only if missing,
   so identical bytes are stored once.
   - identical bytes in the same visit+category → existing photo returned (`duplicate: "content"`);
   - identical bytes elsewhere → a new photo flagged with `duplicateOfId` so reviewers can spot
     re-used photos (the sample data has 95 duplicate groups, some across sites).
4. **Validation by decoding** with sharp (JPEG/PNG/WebP, ≥ 64×64), never by declared MIME type.
   EXIF (make/model/time/GPS) is extracted with exifr; client GPS/time win over EXIF.
   Variants: `web` 1600 px (review UI and AI input, bounds token cost), `thumb` 320 px; both
   auto-rotated JPEG.
5. Analysis is enqueued after the DB commit with job id `analyze:<photoId>` (deduplicated). If the
   enqueue fails the photo stays `uploaded`; `POST /photos/requeue-stuck` recovers it.
6. Downloads only via short-lived signed URLs (S3 presigned, or HMAC-signed `/files/*` for the
   local driver); storage keys are never exposed.

## Why not resumable uploads now
Photos are small; a failed request re-sends at most a few MB, and the idempotency key already
makes retries safe. tus or S3 multipart would add a second state machine (partial uploads,
expiry, cleanup) on both mobile and server. Revisit if videos or > 25 MB files are added:
the `clientUuid` contract stays the same, only the transport changes.

## Consequences
- Mobile must generate and persist `clientUuid` with the queued photo, and treat `200` and `201`
  as success.
- Re-shots that fix snags send `fixesPhotoId` (must be a rejected photo of the same site/category).
