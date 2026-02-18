# High-Level Architecture

## Overview

The app uses a layered architecture:

1. UI/screens layer (`src/screens/`, `src/components/`)
2. API abstraction layer (`src/api/`)
3. API provider/context layer (`src/context/APIContext.tsx`)
4. Backend/data services (Firebase Storage, Firestore, AsyncStorage)
5. Content ingestion pipeline (`functions/src/`)

## Runtime Layers

## UI Layer

- Entry point: `App.tsx`
- Navigation:
  - Bottom tabs: `Home`, `Courses`
  - `Courses` stack: list/detail/lesson
- Screens call APIs via `useAPI()`

## API Abstraction Layer

Interfaces:

- `src/api/home/HomeAPI.ts`
- `src/api/course/CourseAPI.ts`
- `src/api/user/UserAPI.ts`

Implementations currently active:

- `FirebaseHomeAPI`
- `FirebaseCourseAPI`
- `FirebaseUserAPI`

Alternate/local implementations exist for user data:

- `LocalUserAPI`
- `MockUserAPI`

## Dependency Injection

`src/context/APIContext.tsx` creates stable API client instances via `useMemo` and injects them app-wide through React context.

This keeps screen code interface-driven and allows backend swapping with minimal UI churn.

## Data Sources

## Course/Home Content

- Source: Firebase Storage public JSON files
  - `home/home.json`
  - `courses/index.json`
  - `courses/{courseId}/course-summary.json`
  - `courses/{courseId}/course-detail.json`
- Clients: `FirebaseHomeAPI`, `FirebaseCourseAPI`

## User Data

- Source of truth: Firestore (`users/{uid}/progress/{courseId}`)
- Local cache/store: AsyncStorage (`progress:{courseId}`)
- Client: `FirebaseUserAPI` (local-first + background sync)

## Caching Strategy

## JSON Cache

Implemented in `src/utils/offlineJsonCache.ts`:

- `getJsonWithOfflineCache(cacheKey, fetcher)` returns cached JSON immediately when available
- Starts background refresh (stale-while-revalidate)
- Falls back to network + store when cache is missing

Used by:

- `FirebaseHomeAPI.getHomeConfig()`
- `FirebaseCourseAPI.getCourseSummaries()`
- `FirebaseCourseAPI.getCourseSummary()`
- `FirebaseCourseAPI.getCourseDetail()`

## Image Cache Strategy

Implemented in `src/utils/imageCache.ts`:

- `buildVersionedImageUri(uri, version?, hash?)` adds `?v=...` for cache busting
- `prefetchImage/prefetchImages` warms device cache

Used across home/course/detail/lesson image surfaces.

## Content Ingestion Pipeline

Parser scripts in `functions/src/`:

- `parseGoogleDoc.ts` (course doc -> summary/detail JSON + image upload)
- `parseHomeDoc.ts` (home doc -> home JSON + background image upload)
- `parseAllDocs.ts` (folder batch parse, doc mapping, index generation)

Storage output:

- `courses/index.json`
- `courses/doc-mapping.json`
- per-course summary/detail/image assets
- `home/home.json`

## Important Current Constraint

`functions/src/index.ts` exports a placeholder HTTP function and does not call the parser workflow. Current content publishing is script-driven (`npm run parse`, `npm run parse:all`, `npm run parse:home`) rather than production HTTP function automation.
