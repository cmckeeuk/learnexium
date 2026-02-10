# Functional Summary

## Product Scope

The app is a React Native + Expo learning product with two tabs:

- `Home` tab (`src/screens/HomeScreen.tsx`)
- `Courses` tab stack (`src/screens/CoursesScreen.tsx`, `src/screens/CourseDetailScreen.tsx`, `src/screens/LessonScreen.tsx`)

Navigation is configured in `App.tsx` with:

- Bottom tabs: `Home`, `Courses`
- Nested native stack under `Courses`: `CoursesList -> CourseDetail -> Lesson`

## Home Screen

`src/screens/HomeScreen.tsx` shows:

- Hero section driven by `home/home.json`
- Overlay stats (lessons done, courses started, overall progress)
- Continue lesson card (if user has current progress)
- Recommended next course card
- Optional institutions banner (`bulkPricingUrl`, `bulkPricingMessage`)
- Dev-only reset control (`__DEV__`) calling `userAPI.clearAllProgress()`

Data loaded on focus:

1. Home config from `homeAPI.getHomeConfig()`
2. Course summaries from `courseAPI.getCourseSummaries()`
3. Per-course progress from `userAPI.getCourseProgress()`

## Courses List

`src/screens/CoursesScreen.tsx` renders a card list of course summaries:

- Thumbnail
- Premium badge (if `premium: true`)
- Difficulty badge
- Progress badge (done/complete)
- Lesson count and duration

Data refreshes on screen focus.

## Course Detail

`src/screens/CourseDetailScreen.tsx` renders:

- Hero image and title metadata
- Progress ring + completion text
- Course stats (lessons, duration, difficulty)
- Author info
- Continue/start CTA to next lesson
- Lesson list with status and continue marker

## Lesson Screen

`src/screens/LessonScreen.tsx` renders lesson blocks and tracks completion.

Supported block types:

- `heading`
- `text`
- `image`
- `video` (YouTube via `react-native-youtube-iframe`)
- `callout`
- `list`
- `quiz` (renders `src/components/blocks/QuizBlock.tsx`)
- `flashcards` (renders `src/components/blocks/FlashcardsBlock.tsx`)

Premium flow:

- Access check via `userAPI.canAccessLesson()`
- Locked UI if denied: `src/components/LockedLessonScreen.tsx`
- Upgrade action calls `userAPI.upgradeToPremium()`

Lesson completion behavior:

- Marks lesson opened on load (`markLessonOpened`)
- Marks completed when user scrolls to bottom
- Also marks completed if content height <= viewport (no scroll needed)

## Mini Video Player

Lesson screen includes floating mini-player handoff:

- Inline video transitions to mini-player when user scrolls past threshold
- Mini-player resumes inline playback when scrolling back
- State managed in `LessonScreen` via refs and handoff guards

## User Progress UX

Progress is consumed in three places:

- Home summary stats + continue/recommendation
- Courses list card badges
- Course detail lesson states + continue CTA

Progress calculations are centralized in `UserAPI` implementations (`LocalUserAPI`, `FirebaseUserAPI`).
