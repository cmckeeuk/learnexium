# Local Editable Test Course (JSON + Images)

## Goal
- Add one small test course that exercises all lesson block features.
- Keep course JSON and all content images inside this repo so they can be edited directly.
- Run app content from local files (no Firebase dependency for course/home content).

## Sample Content Scope
- Home hero with title, body text, optional bulk-pricing fields, and local background image.
- One course with 3 lessons:
- Lesson 1 (free): `heading`, `text`, `list`, `callout`, `image`, `video`.
- Lesson 2 (free): `flashcards` and `quiz` (include `mcq`, `true_false`, `short_answer`).
- Lesson 3 (premium): at least one block + `premium: true` to test lock/upgrade flow.

## Files To Add

### `src/content/local/home/home.json`
- Local home config using existing shape from `HomeConfig`.
- Keep `backgroundImage` as a local image token (example: `local://home/hero`).

### `src/content/local/courses/index.json`
- Add `courses` array with one id (example: `["test-course"]`).

### `src/content/local/courses/test-course/course-summary.json`
- Include full `CourseSummary` fields.
- Use local image tokens for `thumbnailUrl` (and avatar if desired).
- Set `freePreviewLessons` to match free lessons.

### `src/content/local/courses/test-course/course-detail.json`
- Include `lessons` + `quizzes` in existing `CourseDetail` structure.
- Add one lesson containing each block type across the course.
- Use local image tokens for lesson image blocks (`type: "image"`).
- Keep quiz block ids aligned (`quizId` on block must match item in top-level `quizzes`).

### `src/content/local/localImageRegistry.ts`
- Map local image tokens to static `require(...)` image modules.
- Expose a resolver function so APIs can replace token strings with local image modules.

### `src/api/home/LocalHomeAPI.ts`
- Implement `HomeAPI` using imported local JSON.
- Resolve `backgroundImage` token to local module before returning config.

### `src/api/course/LocalCourseAPI.ts`
- Implement `CourseAPI` using imported local JSON files.
- Resolve `thumbnailUrl`, lesson image `src`, and optional avatar token before returning.
- Return data already sorted by `order` to mirror current Firebase behavior.

## Existing Files To Change

### `src/context/APIContext.tsx`
- Add content source switch (example env var: `EXPO_PUBLIC_CONTENT_SOURCE=local|firebase`).
- Use `LocalHomeAPI` + `LocalCourseAPI` when local mode is selected.
- Keep `userAPI` as current `FirebaseUserAPI` (it already falls back local for progress if Firebase is not configured).

### `src/api/course/CourseAPI.ts`
- Update types for local images:
- `ImageBlock.src` should support `string | number`.
- `author.avatarUrl` should support `string | number` if avatar is local.

### `src/screens/LessonScreen.tsx`
- Update image rendering logic to handle both remote URL strings and local image module numbers.
- Only call `buildVersionedImageUri` for string URLs.
- Update `LessonImage` prop type from `{ uri: string }` to `ImageSourcePropType`.

### `src/screens/CourseDetailScreen.tsx`
- Update author avatar rendering to support `string | number` source.

## Local Images To Add

### `assets/content/home/hero.jpg`
- Home hero background.

### `assets/content/courses/test-course/thumbnail.jpg`
- Course card/detail thumbnail.

### `assets/content/courses/test-course/lesson-1-image.jpg`
- Lesson image block sample.

### `assets/content/courses/test-course/author.jpg` (optional)
- Local author avatar if you do not want external URLs.

## Optional (If You Want Faster Rewards Testing)

### `src/api/user/LocalUserAPI.ts`
- Add a small test-mode override for badge targets so all badges can be earned in one short course.
- Keep default badge targets unchanged for normal mode.

## Validation Checklist
- Home tab loads local hero content and image.
- Courses tab shows test course thumbnail and metadata from local JSON.
- Course detail opens and displays lesson list + premium marker.
- Lesson blocks render for all block types (`heading`, `text`, `list`, `callout`, `image`, `video`, `flashcards`, `quiz`).
- Premium lesson lock screen appears before upgrade and opens after upgrade.
- Progress tab updates XP/badges/certificate after completing lessons/quizzes.
