# Progress Screen UX Spec (Image-First v1)

## Purpose

Redesign the `Progress` tab around visual reward images instead of text-first cards.

Initial design direction:

- Use reward images as the primary visual language.
- For now, reuse a single image asset (`xp-token`) for XP, badges, and certificates.
- Keep layout simple, premium, and easy to scan.

## Scope (This Spec)

In scope:

- Top XP hero with image and total XP overlay.
- Badges section showing earned badges.
- Certificates section showing course-linked certificate cards with image.
- Empty/loading/error states for each section.

Out of scope (later iteration):

- Dedicated badge image set.
- Dedicated certificate image frames.
- Advanced filtering/sorting controls.
- Sharing/export of certificates.

## Assets (Current Constraint)

Available now:

- `assets/rewards/icons/xp-token.png` (single shared reward image)

Rule for v1:

- XP, badge, and certificate visuals all use this image.
- Variant meaning is communicated with overlay labels and metadata text.

## Information Architecture

Screen order (top to bottom):

1. XP Hero
2. Badges Earned
3. Certificates

Removed from this v1 visual pass:

- Weekly stats
- Timeline feed
- "Coming soon" placeholder section

These can return in v2 if needed.

## Section Specs

## 1) XP Hero

Goal:

- Immediately communicate overall progression.

Layout:

- Large centered reward image.
- Circular/dark overlay badge centered on image with total XP (example: `1240 XP`).
- Secondary line under image:
  - `Level {level}`
  - `Next level in {nextLevelXp - totalXp} XP`

Data source:

- `userAPI.getRewardsSummary()`
- Fields:
  - `totalXp`
  - `level`
  - `nextLevelXp`

States:

- Loading: image placeholder + skeleton/`...`
- Empty/new user: show `0 XP`
- Error: inline retry button

## 2) Badges Earned

Goal:

- Show concrete achievements already unlocked.

Layout:

- Section title: `Badges`
- Vertical list or compact grid (2-column acceptable)
- Each earned badge card contains:
  - Shared reward image (smaller than hero)
  - Overlay label: badge short code or icon marker (for now text label is fine)
  - Badge title
  - Earned date

Display rule:

- Only show badges where `earned === true`.
- Default sort: newest earned first (`earnedAt` desc).

Data source:

- `userAPI.getBadges()`
- Fields:
  - `badgeId`
  - `title`
  - `earned`
  - `earnedAt`

Empty state:

- `No badges earned yet. Complete lessons to unlock your first badge.`

## 3) Certificates

Goal:

- Show course completion achievements with explicit course context.

Layout:

- Section title: `Certificates`
- Certificate card per earned certificate:
  - Certificate visual area with image
    - Preferred image: course thumbnail for that certificate's course
    - Fallback: shared reward image
  - Course title
  - Issued date
  - Optional stats row (`lessonsCompleted`, `averageQuizScore`)

Data source:

- `userAPI.getCertificates()`
- Fields:
  - `certificateId`
  - `courseId`
  - `courseTitle`
  - `issuedAt`
  - `lessonsCompleted?`
  - `averageQuizScore?`

Course image mapping:

- Primary: resolve thumbnail from course summaries by `courseId`.
  - `courseAPI.getCourseSummaries()` -> match `courseId` -> `thumbnailUrl`.
- Fallback path:
  - if no course image found, use `xp-token` image.

Empty state:

- `No certificates yet. Complete a full course to earn one.`

## Visual Style Guidance

- White background, generous spacing.
- Cards with soft border, minimal shadow.
- Typography hierarchy:
  - Hero number > section titles > card titles > metadata.
- Overlay text should remain legible over image:
  - use dark semi-opaque chip (`rgba(15,23,42,0.75)`).

## Interaction Model

- Pull-to-refresh reloads summary, badges, certificates.
- Retry CTA in error state.
- Optional (v1.1): tap badge/certificate opens details drawer/screen.

## Data and Refresh Behavior

On screen focus:

- Fetch in parallel:
  - `getRewardsSummary()`
  - `getBadges()`
  - `getCertificates()`
  - `getCourseSummaries()` (only for certificate course images)

Caching:

- Use existing API local-first behavior; render local immediately, then sync update.

## Accessibility

- Overlay chips must meet contrast against image.
- All image cards need accessible labels:
  - XP hero: `Total XP {value}`
  - Badge card: `{badge title}, earned {date}`
  - Certificate card: `Certificate for {course title}, issued {date}`

## Implementation Notes

Target file:

- `src/screens/ProgressScreen.tsx`

Suggested component split:

- `ProgressXpHero`
- `ProgressBadgesSection`
- `ProgressCertificatesSection`
- `ProgressStateCard` (loading/error/empty helper)

## Acceptance Criteria

- Top hero uses image with total XP overlaid.
- Badges section shows earned badges only.
- Certificates section clearly shows which course each cert belongs to.
- Certificate card uses course image when available, otherwise shared reward image.
- Screen supports loading, empty, and error states with retry.
- Pull-to-refresh works and updates all three sections.

## Open Decisions To Refine

1. Badge list layout: horizontal carousel vs 2-column grid?
2. Certificate card style: image-left row vs full-width image card?
3. Overlay wording:
   - XP hero chip format (`1240 XP` vs `+1240`)
   - Badge overlay (`BDG` vs no overlay)
4. Should locked badges appear in this image-first v1, or earned-only?
