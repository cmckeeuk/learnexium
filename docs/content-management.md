# Content Management

## Authoring Source

Primary source of truth is Google Docs, not local markdown files.

- Parser reads Google Docs via service account

## Parser Entry Points

Located in `functions/src/`:

- `parseGoogleDoc.ts` -> parse one course document
- `parseHomeDoc.ts` -> parse home screen document
- `parseAllDocs.ts` -> parse all docs in a folder, maintain index/mapping
- `listDocs.ts` -> connectivity/listing helper

CLI commands (`functions/package.json`):

- `npm run parse -- <doc-id>`
- `npm run parse:home -- <doc-id>`
- `npm run parse:all -- [--force] [<folder-id>]`

## Required Setup

## Service Account

- Preferred: set `GOOGLE_SERVICE_ACCOUNT_PATH` in `functions/.env`
- Fallback: parser will look for `service-account.json` at project root (`/service-account.json`)
- Service account JSON is gitignored in root `.gitignore`

## Environment

Parser-side:

- Create `functions/.env` from `functions/.env.example`
- Parser loads env from `functions/.env` (and falls back to root `.env` when present)
- `GOOGLE_DRIVE_FOLDER_ID` (required unless passed as CLI arg to `parse:all`)
- `FIREBASE_STORAGE_BUCKET` (required for parser uploads)
- `GOOGLE_SERVICE_ACCOUNT_PATH` (optional; if omitted parser falls back to `/service-account.json`)

App-side:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`

## Course Document Format

Expected structure (enforced by parser logic):

1. Top metadata block with `Course ID:`, `Title:`, `Subtitle:`, etc.
2. Lessons as H1 headings matching `Lesson - <Title>`
3. Optional lesson metadata lines under each lesson heading:
   - `Summary:`
   - `Duration (minutes):`
   - `Premium: yes|no`
4. Content blocks parsed from markers/format:
   - headings (H2+ or markdown heading)
   - text
   - lists/bullets
   - inline images
   - YouTube URLs
   - `[CALLOUT]`
   - `[FLASHCARD]` with `Front:` / `Back:`
   - `[QUIZ_CHOICE]`, `[QUIZ_TRUE_FALSE]`, `[QUIZ_SHORT_ANSWER]`

## Home Document Format

Parsed by `parseHomeDoc.ts`:

- first H1 -> `title`
- paragraph text -> `text`
- first image -> `backgroundImage`
- optional metadata lines:
  - `Bulk pricing url:`
  - `Bulk pricing message:`

## Publish Outputs

Parser uploads to Firebase Storage:

- `home/home.json`
- `home/background.jpg`
- `courses/index.json`
- `courses/doc-mapping.json`
- `courses/{courseId}/course-summary.json`
- `courses/{courseId}/course-detail.json`
- thumbnails and lesson images under `courses/{courseId}/...`

## Image Versioning and Cache Invalidation

## Course/Lesson Images

`parseGoogleDoc.ts` computes image SHA-256 and stores:

- `thumbnailHash`, `thumbnailVersion`
- per-image block `hash`, `version`

Client app appends `?v=<version-or-hash>` via `buildVersionedImageUri()`.

## Home Hero Image

`parseHomeDoc.ts` compares previous and current `backgroundImageHash`:

- if hash changed and previous hash existed -> increments `backgroundImageVersion`
- if no previous hash -> starts/keeps current baseline version

This avoids forcing a global reparse and gives deterministic cache busting only when image bytes change.

## Incremental Parsing Behavior

`parseAllDocs.ts` compares document `modifiedTime` vs stored JSON `lastUpdated`.

- unchanged doc -> skipped
- changed/new doc -> parsed and uploaded
- deleted doc in Drive -> orphaned course files removed from storage and mapping

Index is regenerated from successful course IDs at end of batch run.
