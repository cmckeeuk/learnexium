# Progress Rewards Spec

## Purpose

Define a rewards system that reinforces lesson engagement, with rewards earned from:

- Completing flashcards
- Completing quizzes
- Completing lessons and courses

The rewards are surfaced in a new bottom-tab destination: `Progress`.

This spec is designed for the current app architecture:

- React Native + Expo
- Local-first progress with Firebase background sync
- Lesson content blocks (`flashcards`, `quiz`) rendered in `LessonScreen`

## Product Goals

- Increase completion rate of flashcards and quizzes
- Make progress feel visible and motivating
- Keep implementation simple and reliable (local-first, low-friction UX)
- Create a foundation for future features (streaks, weekly goals, social)

## Scope

### In Scope (MVP)

- Points (XP) for flashcards and quiz activity
- Badges for milestones
- Course certificate on full course completion
- New `Progress` tab in bottom navigation
- Reward fly-to-tab animation when flashcards/quiz completion grants rewards
- One flashcard set and one quiz per lesson (authoring/content rule)
- Local-first storage and Firebase sync for rewards

### Out of Scope (MVP)

- Social leaderboards
- Public profile sharing
- Paid rewards shop
- PDF certificate generation (first version can be app-rendered certificate card)

## Core Product Decisions

### Reward Types

Use a 3-layer system:

1. Points (XP) for immediate reinforcement
2. Badges for milestone moments
3. Certificates for meaningful completion (course-level)

Rationale:

- Points give instant feedback
- Badges create medium-term goals
- Certificates create long-term achievement value

### Simplified Lesson Rule

Each lesson supports:

- Exactly one flashcard deck (`flashcards` block)
- Exactly one quiz (`quiz` block + one quiz object)

This simplifies tracking, UX, analytics, and reward logic.

## Reward Rules

## Points (XP)

Recommended values for MVP:

- Flashcards completed (first completion per lesson): `+20 XP`
- Quiz completed (all questions answered, first completion per lesson): `+30 XP`
- Quiz performance bonus:
- `+10 XP` for score >= 70%
- `+20 XP` for score = 100%
- Lesson mastery bonus (flashcards + quiz complete in same lesson): `+15 XP`
- Course completion bonus (all lessons complete): `+100 XP`

Anti-farming rules:

- First completion grants full XP
- Re-attempts grant no base XP (or optional low replay XP in future)
- Performance bonus only counts once per lesson unless explicit reset logic is added

## Badges

MVP badge set:

- `First Steps`: complete first lesson
- `Card Crusher`: complete 10 flashcard decks
- `Quiz Starter`: complete 5 quizzes
- `Perfect Score`: get 100% on a quiz
- `On a Roll`: complete 3 lessons in one day
- `Course Finisher`: complete one full course

Badge behavior:

- Award once
- Show earned timestamp
- Show lock state and requirement text when not earned

## Certificates

Certificate issued when:

- User completes all lessons in a course
- Optional quality bar for MVP: average quiz score >= 70% (recommended)

Certificate data:

- Certificate ID (deterministic)
- User ID
- Course ID + course title snapshot
- Issued at timestamp
- Completion stats snapshot (lessons completed, average quiz score)

Display:

- In Progress tab `Certificates` section
- Tap to open full certificate details view

## Progress Tab UX

## Bottom Navigation

Add a third tab:

- `Home`
- `Courses`
- `Progress` (new)

Suggested icon: `award` or `trending-up` from Feather.

## Progress Tab Information Architecture

Single scroll page with sections:

1. Header Summary
- Total XP
- Level
- Current streak (if enabled later, show placeholder for now)

2. This Week
- XP gained this week
- Lessons completed this week
- Quizzes completed this week

3. Rewards
- Recently earned badges (horizontal list)
- Next badge targets (locked cards with progress meter)

4. Certificates
- Earned certificates list by course
- Empty state if none earned yet

5. Activity Timeline
- Recent reward events: "Completed Quiz", "Earned Badge", "Course Certificate Issued"

6. Future Slot (Placeholder)
- Reserved area for future goals/challenges to satisfy "other stuff in progress tab"

## Lesson UX Changes

### Flashcards

Completion event fires when:

- User reaches final card, and
- Final card is flipped at least once

UI behavior:

- Existing completion callout remains
- Add reward toast/snackbar on first completion: `+20 XP`

### Quiz

MVP quiz completion requires:

- Every question has an answer

Add a final state:

- `Finish Quiz` CTA on last question
- Results summary card:
- Score (%)
- Correct answers count
- XP earned

Reward feedback:

- Instant XP toast
- Badge toast if milestone crossed

### Lesson Mastery

When both flashcards and quiz are complete for a lesson:

- Mark lesson mastery state
- Award mastery bonus once
- Show small "Mastered" badge on lesson header

### Reward Fly-To-Progress Animation

When a reward is granted (XP, badge, certificate), show a celebratory animation:

- A reward token launches from the completion UI area
- The token arcs toward the `Progress` bottom-tab icon
- The `Progress` icon pulses/glows on impact
- A compact XP toast appears at source or near top

Trigger rules:

- Trigger on first-time completion rewards only
- If multiple rewards are granted at once, queue animations
- If user is already on `Progress` tab, animate to the header summary chip instead of tab icon

Visual style:

- Token styles: XP orb, badge chip, certificate shard
- Motion: curved path + scale up/down + slight rotation
- Impact: pulse ring + short sparkle burst
- Total duration target: `650-900ms` per token

Temporary asset strategy (current implementation):

- Use one shared reward token image for all reward types (`xp`, `badge`, `certificate`)
- Overlay text in dark circular badge (`+XP`, `BDG`, `CERT`) until dedicated art is supplied
- Swap to type-specific images later without changing animation architecture

Accessibility and fallback:

- Respect reduced motion settings
- Reduced motion mode uses fade/scale only (no long travel path)
- Never block navigation or input while animation plays

## User Flows

## Flow A: Flashcards Reward

1. User opens lesson
2. User reviews flashcards to final card and flips it
3. System records flashcards completion event
4. XP awarded and reward event logged
5. Progress tab reflects updated XP and activity

## Flow B: Quiz Reward

1. User answers all quiz questions
2. User taps `Finish Quiz`
3. System computes score and completion
4. XP + bonus awarded
5. Badge checks run and unlock if thresholds met

## Flow C: Course Certificate

1. User completes final remaining lesson in a course
2. System validates certificate rules
3. Certificate record generated
4. Certificate appears in Progress tab and activity feed

## Technical Implementation

## Data Model

Extend user progress domain with reward entities.

### New Types (`src/api/user/UserAPI.ts`)

- `RewardEvent`
- `BadgeProgress`
- `CertificateRecord`
- `LessonRewardStatus`
- `RewardsSummary`

Recommended shapes:

- `LessonRewardStatus`
- `lessonId`, `courseId`
- `flashcardsCompletedAt?`
- `quizCompletedAt?`
- `quizScore?`
- `xpAwarded` (total for lesson)
- `masteryAwardedAt?`

- `RewardEvent`
- `eventId`
- `type` (`xp_awarded`, `badge_earned`, `certificate_issued`)
- `occurredAt`
- `courseId?`, `lessonId?`, `badgeId?`, `certificateId?`
- `xpDelta?`
- `metadata?`

- `RewardsSummary`
- `totalXp`
- `level`
- `currentLevelXp`
- `nextLevelXp`
- `badgesEarned`
- `certificatesEarned`

### Storage Keys (local-first)

Add AsyncStorage keys:

- `rewards:summary`
- `rewards:events`
- `rewards:badges`
- `rewards:certificates`
- `rewards:lesson:{courseId}` (map of lesson reward statuses)

### Firebase Mirror

Suggested Firestore path under user:

- `users/{uid}/rewards/summary` (doc)
- `users/{uid}/rewards/events/{eventId}` (subcollection)
- `users/{uid}/rewards/badges/{badgeId}` (subcollection)
- `users/{uid}/rewards/certificates/{certificateId}` (subcollection)
- `users/{uid}/rewards/lessonStatus/{courseId}` (doc map)

Use same local-first + background merge strategy as course progress.

## API Layer Changes

### Extend `UserAPI` Interface

Add methods:

- `markFlashcardsCompleted(courseId, lessonId): Promise<void>`
- `markQuizCompleted(courseId, lessonId, score: number, totalQuestions: number): Promise<void>`
- `getRewardsSummary(): Promise<RewardsSummary>`
- `getRecentRewardEvents(limit?: number): Promise<RewardEvent[]>`
- `getBadges(): Promise<BadgeProgress[]>`
- `getCertificates(): Promise<CertificateRecord[]>`

Behavior:

- Local write immediately
- Trigger background sync in `FirebaseUserAPI`
- Idempotent award operations (same completion event cannot double-award)

## UI Layer Changes

### New Screen

- Add `src/screens/ProgressScreen.tsx`
- Register tab in `src/App.tsx`

### Quiz and Flashcards Blocks

- `FlashcardsBlock` accepts `onCompleted` callback
- `QuizBlock` accepts `onCompleted(score, totalQuestions)` callback
- `LessonScreen` wires callbacks to `userAPI` reward methods

### Visual Components

- `XPToast` component for reward feedback
- `BadgeCard` and `CertificateCard` reusable UI blocks
- `RewardFlyToProgressOverlay` global animation layer
- `ProgressTabAnchor` tab icon anchor for target coordinates

### Animation Architecture

Use a global overlay mounted above navigation so any screen can launch animations to a shared target.

Core pieces:

- `RewardAnimationProvider` (context/event bus)
- `RewardFlyToProgressOverlay` (absolute positioned animated tokens)
- `useRewardAnimation()` hook for emit calls from lesson blocks
- `ProgressTabAnchor` to register destination coordinates

Coordinate strategy:

- Source: measured from reward-triggering component via `measureInWindow`
- Target: measured from Progress tab icon wrapper via `onLayout` + window offset
- Overlay uses window coordinates for consistent cross-screen animation

Queueing and robustness:

- Serialize tokens with short stagger (`80-120ms`)
- Keep max queue length (for example 8) to avoid overload
- Drop duplicate events by deterministic `eventId`
- If target coordinates unavailable, fallback to center-bottom destination

Implementation notes for current app:

- Mount provider in `src/App.tsx` above `NavigationContainer`
- Register Progress icon anchor in tab bar render for `Progress` route
- Emit animation from `LessonScreen` after successful reward write
- Use React Native `Animated` first (no new dependency required)

Analytics:

- `reward_animation_started`
- `reward_animation_completed`
- `reward_animation_fallback_used`

## Content/Parser Constraints

Update parser/content validation in `functions/src/parseGoogleDoc.ts`:

- If >1 flashcards block is detected in a lesson:
- Merge into one block in parser and emit warning log

- If >1 quiz block reference is detected:
- Keep one quiz block and append all questions to its single quiz object
- Emit warning log

Authoring rule documented in `docs/content-management.md`:

- One flashcard deck and one quiz per lesson

## Leveling Formula

Simple level progression:

- `level = floor(totalXp / 200) + 1`
- `nextLevelXp = level * 200`

This is linear and easy to tune later.

## Idempotency and Integrity

To prevent duplicate awards:

- Store per-lesson completion timestamps
- Only award base completion XP when timestamp is first set
- Use deterministic event IDs:
- `xp:{courseId}:{lessonId}:flashcards`
- `xp:{courseId}:{lessonId}:quiz`
- `xp:{courseId}:{lessonId}:mastery`
- `cert:{courseId}`

## Analytics Events

Track product analytics for tuning:

- `flashcards_completed`
- `quiz_completed`
- `reward_xp_awarded`
- `badge_earned`
- `certificate_issued`
- `progress_tab_viewed`

Properties:

- `courseId`, `lessonId`, `xpDelta`, `totalXp`, `score`, `badgeId`, `certificateId`

## Implementation Task Breakdown

## Task Group 1: Reward Domain and API

1. Add reward types to `src/api/user/UserAPI.ts`
2. Implement local reward storage in `src/api/user/LocalUserAPI.ts`
3. Implement Firebase reward sync in `src/api/user/FirebaseUserAPI.ts`
4. Add idempotent event IDs and dedupe checks
5. Add unit tests for first-award vs replay behavior

Definition of done:

- Reward APIs return consistent data locally/offline
- Duplicate completion events do not double-award XP
- Sync merges cleanly across devices

## Task Group 2: Lesson Completion Signal Wiring

1. Extend `FlashcardsBlock` with `onCompleted`
2. Extend `QuizBlock` with `onCompleted(score, totalQuestions)`
3. Wire callbacks in `LessonScreen` to reward API methods
4. Compute quiz score and mastery eligibility
5. Show XP/badge toasts after successful writes

Definition of done:

- Flashcards completion emits once per lesson completion
- Quiz completion emits once with accurate score
- Mastery bonus triggers only when both requirements are met

## Task Group 3: Progress Navigation and Screen

1. Add `Progress` tab in `src/App.tsx`
2. Create `src/screens/ProgressScreen.tsx`
3. Build sections: summary, weekly, rewards, certificates, timeline
4. Add empty/loading/error states
5. Hook data refresh on screen focus

Definition of done:

- Progress tab is visible and stable on iOS and Android
- Reward updates appear without app restart

## Task Group 4: Fly-To-Progress Animation

1. Create `RewardAnimationProvider` and overlay component
2. Capture source coordinates from flashcard/quiz completion UI
3. Register Progress tab icon anchor target coordinates
4. Animate token path + impact pulse + sparkles
5. Add queueing, dedupe, and fallback destination logic
6. Add reduced motion behavior
7. Emit animation analytics events

Definition of done:

- Reward token visibly flies to Progress target
- Multiple rewards animate in ordered sequence
- Animation does not block input or crash when target is unavailable
- Reduced motion mode uses simplified effect

## Task Group 5: Content Constraint Enforcement

1. Update parser rules in `functions/src/parseGoogleDoc.ts`
2. Ensure one flashcards block per lesson (merge extras)
3. Ensure one quiz block per lesson (merge questions)
4. Log warnings for authoring violations
5. Document rule updates in `docs/content-management.md`

Definition of done:

- Parsed output always contains max one flashcards + one quiz reference per lesson
- Existing docs still parse successfully

## Task Group 6: QA and Release Readiness

1. Add integration test checklist for flashcards/quiz reward flows
2. Verify offline reward writes and later sync reconciliation
3. Verify cross-device reward visibility
4. Validate animation performance on lower-end devices
5. Validate accessibility behavior (reduced motion)

Definition of done:

- MVP acceptance criteria pass on iOS simulator and Android emulator
- No duplicate rewards in repeated completion scenarios

## Suggested Build Order

1. Task Group 1
2. Task Group 2
3. Task Group 3
4. Task Group 4
5. Task Group 5
6. Task Group 6

## Acceptance Criteria (MVP)

- User receives XP once for first flashcards completion per lesson
- User receives XP once for first quiz completion per lesson
- Quiz score bonus applies correctly by score threshold
- Lesson mastery bonus triggers once when both activities complete
- Progress tab reflects new XP/events immediately after completion
- Rewards sync across devices using existing local-first Firebase strategy
- Course certificate appears when course completion rule is met
- Parser enforces single flashcards + single quiz model per lesson

## Open Questions

- Should replaying quiz/flashcards ever grant small XP?
- Should certificate require any minimum quiz performance or only completion?
- Should "level" be shown in MVP UI or hidden until we add streaks/goals?
