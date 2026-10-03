# ADR 0005: Bulk photo upload and agent memory

Date: 2026-10-03 · Status: accepted (design) · Owner decisions: 2026-10-03

## Context

The owner wants to (1) upload many photos at once, have the AI analyse each one and the reviewer
decide, and (2) have the agent improve from those reviewer decisions over time.

Vision models do not learn from use (their weights never change for us). "Learning" therefore means
an **agent memory** that is part of the prompt: lessons and reference examples distilled from
reviewer decisions. Reviews are already stored as immutable labels (`reviews`, dismissed AI snags,
human snags), so the raw material exists.

Owner decisions: bulk upload from the **web portal and the mobile app**; the **AI proposes each
photo's category** and the uploader confirms or corrects it; what the agent learns is **approved by
an admin and must pass an evaluation gate** before it is used.

## Decision

### Phase A - bulk upload on the web (category proposed by the AI)

1. `Photo.captureSource`: `camera` (default, mobile live capture) | `web_bulk` | `app_gallery`, shown
   to reviewers (a bulk/gallery photo is not proof of a live site visit).
2. `Photo.uploadBatchId` groups one upload session; `Photo.categorySource`: `user` | `ai_proposed` |
   `user_confirmed`, plus `categoryConfidence`.
3. New status `awaiting_category` (before `uploaded`): bulk photos are stored with the batch's default
   category, a `classify-photo` job (worker, cheap model, small prompt with the 20 category
   descriptions) proposes the category; nothing is analysed until the uploader confirms.
   Confirming (bulk endpoint) may move the photo to another submission and enqueues `analyze-photo`.
   The API never talks to AI vendors (keys stay in the worker), so classification is a queue job.
4. Web page "Bulk upload": pick site + visit, drop files/folders, client-side queue (idempotent
   `clientUuid` per file, 3 parallel), then a review table of proposed categories (sorted by
   confidence) with "confirm all" and per-row correction.

### Phase B - gallery import in the mobile app

`expo-image-picker` (native module -> APK 1.1.0, raises `minSupportedVersionCode` only if needed).
Inside a category screen the technician may add photos from the gallery; they upload with
`captureSource = app_gallery` and the photo's own EXIF time. Camera stays the default.

### Phase C - agent memory with admin approval and an evaluation gate

* Tables: `agent_lessons` (category, optional code, text ar/en, evidence review ids + counts, status
  `proposed | approved | rejected | retired`), `agent_examples` (photo, category, good/snag, codes,
  explanation, status), `agent_memory_versions` (approved lesson + example ids, eval result, status
  `candidate | active | rejected | superseded`).
* Proposals: a `propose-memory` job (on demand from the Memory page, later daily) aggregates new
  reviews per category - AI snags dismissed with the reviewer's reason, snags the AI missed, verdict
  overrides - and asks a strong model to write candidate lessons with their evidence. Photos where
  the AI was wrong become candidate examples. Nothing is used until an admin approves it.
* Gate: building a version from the approved items runs the active and the candidate memory on a
  server-side gate set (T3.5 validation photos + held-out reviewed production photos). The candidate
  is activated only if false accepts do not increase and false rejects do not increase by more than a
  tolerance; the report is stored with the version.
* Use: the worker loads the active version (cached, versioned) - lessons appended to the category
  block, approved examples merged with the curated few-shot - and the memory version becomes part
  of `promptVersion`, so every analysis records which memory it used. Rollback = activate the
  previous version.

## Consequences

* Upload volume rises (classification call per bulk photo: ~$0.0005 on Flash-Lite).
* Reviewer decisions become the agent's training signal: wrong reviews can teach wrong lessons,
  hence admin approval + gate + evidence counts on every lesson.
* Phases are independent: A ships first; B needs a new APK; C needs A's reviewed data to be useful.
