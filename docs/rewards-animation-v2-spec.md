# Rewards Animation V2 Spec (Duolingo-style bottom celebration)

## Goal

Replace the current “flying icon” reward animation with a richer, Duolingo-inspired bottom-of-screen celebration that feels playful, fast, and satisfying without blocking lesson flow.

This spec is designed for the current stack:

- Expo + React Native
- Existing rewards pipeline and `RewardFlyToProgressOverlay`
- Existing Progress tab destination model

---

## Research Summary (what “Duolingo-style” looks like)

From public references and community captures, Duolingo-style reward motion typically has these characteristics:

1. **Bottom-origin character/token motion**
   - Elements pop/jump from the bottom edge, briefly overshoot, then settle.
2. **Layered micro-feedback**
   - Main animation + tiny secondary effects (sparkles, pulse ring, count-up text).
3. **Very short pacing**
   - Usually ~500–1200ms total for one celebratory beat.
4. **Juicy easing**
   - Spring/bounce easing over linear movement.
5. **Sound + haptic pairing**
   - Subtle “reward” ping + light impact haptic on landing.

Notably, user discussions describe Duolingo in-lesson updates where Duo “jumps out from the bottom of the screen and then falls back down,” which matches this direction.

## What we observed in the latest screenshot (high-confidence)

From `duolingo-in-lesson-bottom-feedback-reference.jpg`:

1. **Bottom sheet, not floating toast**
   - Success feedback appears as a full-width bottom panel (success tone), occupying meaningful vertical space.
2. **Panel acts as interaction container**
   - The panel contains the success message (`Good job!`) and the primary CTA (`CONTINUE`).
3. **Character peeks from the panel edge**
   - Character art emerges from the upper edge of the bottom panel, reinforcing “rising from below” motion.
4. **Inline correctness state**
   - The selected correct answer tile is highlighted in a success state simultaneously with bottom feedback.
5. **Clean visual hierarchy**
   - Immediate success copy first, then a large high-contrast CTA. No noisy/confetti-heavy effects in this state.

Design implication for our app:
- Prefer a **reward bottom panel pattern** over a small floating chip as the primary success moment.
- Treat the panel as both **feedback + next-action surface**.
- Use **teal/brand-teal** as the primary bottom panel success color direction to align with our app UI.

---

## Feasibility in Expo

## Verdict

**Yes — fully feasible in Expo** with no native custom module required for MVP.

## Recommended tech choices

### Primary animation engine
- `react-native-reanimated` (already supported in Expo)
- Use spring/timing on UI thread for smoothness and low JS jitter.

### Optional visual enhancements
- `lottie-react-native` (supported via Expo SDK docs) for pre-authored celebratory assets.
- `@shopify/react-native-skia` only if we need advanced particle systems later (not required for V2 MVP).

### Haptics + sound
- `expo-haptics` for light success/impact cues.
- Existing audio stack or `expo-av` for short SFX.

---

## Product Requirements

## Functional

1. Trigger on first-time reward events only (XP, badge, certificate).
2. Render celebration at bottom area of current screen.
3. Keep existing fly-to-progress semantics, but shift visual emphasis to bottom celebration first.
4. Queue multiple rewards with compact staggering.
5. Respect reduced-motion accessibility settings.
6. Never block primary input beyond a very short optional lock (<=200ms around impact).

## Non-functional

1. 60fps target on modern devices; graceful degradation on low-end.
2. Total animation budget per reward: **700–1100ms**.
3. Crash-safe when measurement fails (fallback to fixed bottom anchor).

---

## UX Behavior (V2)

## Sequence (single reward)

1. **Panel Rise (0–180ms)**
   - Bottom reward panel slides up from off-screen (`translateY`), full-width.
   - Panel background uses success color family (teal/brand-teal variants), with rounded top corners.

2. **Character/Token Reveal (120–360ms)**
   - Reward character/token peeks up from the panel edge with a short spring.
   - Scale 0.9 -> 1.03 -> 1.0 (small bounce, minimal rotation).

3. **Impact + Confirmation (360–620ms)**
   - Show confirmation copy (`Good job!`, `+20 XP`) and run subtle pulse ring.
   - Fire light haptic + short SFX.
   - Keep effects restrained (no heavy confetti in core lesson flow).

4. **Actionable Hold / Resolve (620–1200ms)**
   - Keep panel visible long enough for user to read and hit `Continue`.
   - If auto-advance mode is on, fade/slide out after short dwell.
   - Optional tiny handoff animation toward Progress only after CTA or dismissal.

## Multiple rewards

- Queue with 120ms stagger.
- Max visible concurrent tokens: 2.
- If >4 rewards, collapse into summary card:
  - “+120 XP · 2 badges earned”

## While on Progress tab

- Do not target tab icon.
- Animate into header summary chip / XP meter directly.

---

## Visual Design Guidelines

1. Use **chunky, rounded tokens** and bold contrast.
2. Keep movement mostly in Y-axis (bottom pop) to match Duolingo feel.
3. Avoid long diagonal “projectile across screen” as primary motion.
4. Ensure all effects are readable on both light/dark backgrounds:
   - add soft shadow + outline
5. Keep confetti/sparkles minimal to avoid visual noise.

---

## Technical Design

## Architecture updates

Re-use existing structure:

- `RewardAnimationContext`
- `RewardFlyToProgressOverlay`
- `ProgressTabAnchor`

Add V2 layer:

- `BottomRewardCelebrate.tsx` (new)
- `useRewardCelebrate()` hook (new event entrypoint)
- Shared queue manager between fly-to-progress and bottom celebration

## State machine

`idle -> spawn -> bounce -> impact -> resolve -> done`

Each state timed by Reanimated shared values, spring + timing combos.

## Motion tokens (tunable constants)

- `SPAWN_MS = 120`
- `BOUNCE_UP_PX = 56`
- `BOUNCE_DAMPING = 14`
- `IMPACT_MS = 180`
- `RESOLVE_MS = 280`
- `TOTAL_TARGET_MS = 900`

---

## Accessibility

If reduced motion enabled:

- Replace bounce/rotation/path with:
  - fade in + scale 0.98 -> 1.0
  - static pulse
  - text update only
- Disable sparkle particles
- Keep haptic optional and low intensity

---

## Performance Plan

1. Animate with transforms/opacity only (avoid layout thrash).
2. Preload reward images/Lottie JSON.
3. Reuse particle components via pooling.
4. Cap sparkle count (e.g., 6–10 max).
5. Add perf instrumentation:
   - animation start/end timestamps
   - dropped frame estimate (debug builds)

---

## Rollout Plan

## Phase 1 (MVP V2)

- Bottom pop + bounce + impact pulse + XP text
- Reanimated only
- No Lottie dependency required

## Phase 2

- Add Lottie variant for badge/certificate hero moments
- Add per-reward audio variation

## Phase 3

- Optional mascot-specific celebration sets
- Theme/event-based animation packs

---

## Acceptance Criteria

1. Existing naff fly-icon effect replaced by bottom-led celebration.
2. Reward animation feels clearly more “juicy” (bounce + impact + text).
3. Animation runs smoothly on iOS + Android in Expo builds.
4. No regressions in reward awarding logic.
5. Reduced-motion path verified.
6. PRD test videos show visible improvement over V1.

---

## QA Checklist

1. Trigger each reward type independently (XP, badge, certificate).
2. Trigger stacked rewards (2, 3, 5+) and verify queue behavior.
3. Verify behavior on Lesson screen and while already on Progress tab.
4. Verify low-power/perf-constrained device behavior.
5. Verify reduced-motion on both platforms.
6. Verify no input deadlock if animation interrupted/navigation changes.

---

## Risks & Mitigations

1. **Risk:** Overly busy animation hurts usability.
   - **Mitigation:** Hard cap on duration and particle count.

2. **Risk:** Low-end Android frame drops.
   - **Mitigation:** Reanimated-only path + optional “lite mode”.

3. **Risk:** Style mismatch with app brand.
   - **Mitigation:** Keep motion language inspired by Duolingo, not cloned assets.

---

## Reference Image (for implementation)

- Saved local reference screenshot/image:
  - `docs/assets/references/duolingo-lesson-complete-reference.jpg`
  - Resolution: `1080x2400`
- Additional in-lesson bottom feedback reference:
  - `docs/assets/references/duolingo-in-lesson-bottom-feedback-reference.jpg`
  - Resolution: `921x2048`
  - Shows a good pattern for bottom confirmation panel: rising success panel, character pop-up from lower edge, immediate positive copy + primary CTA.

Use these only as motion/layout inspiration (not for shipping assets).

## Source Notes

- Duolingo animation references surfaced via public search results and community discussions:
  - DuckDuckGo result snippets referencing “lesson complete” and bottom jump behavior (r/duolingo discussions).
  - Public video compilations of lesson-complete animations.
- Expo/Reanimated feasibility references:
  - Expo docs for Reanimated support
  - Reanimated official docs (UI-thread animations)
  - Expo/Lottie support docs

(If needed, we can do a second pass with frame-by-frame benchmarking against selected public Duolingo clips.)
