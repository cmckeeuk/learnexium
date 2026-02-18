# Security

## Current Security Posture

## Client/Auth

- Firebase Auth is initialized in `src/config/firebaseClient.ts`
- On native, auth state persistence uses AsyncStorage
- User identity currently relies on anonymous auth (`signInAnonymously`)

## User Data

- Progress stored in Firestore under `users/{uid}/progress/{courseId}`
- App code assumes authenticated user scoping and merge behavior in `FirebaseUserAPI`

## Content Access

- Course/home JSON and images are fetched from public `storage.googleapis.com` URLs
- Premium lesson access is enforced in client UI logic (`canAccessLesson`)
- This is UX gating, not strong backend entitlement enforcement

## Sensitive Files/Secrets

- `service-account.json` is required for parser scripts and is gitignored
- Expo `EXPO_PUBLIC_FIREBASE_*` vars are public client config (not secrets)

## Important Gaps

1. Storage rules are not versioned in this repo yet (`storage.rules` not present).
2. Storage content appears public by URL design; premium assets are not hard-protected server-side.
3. App Check is not integrated in runtime code.
4. Cloud Function endpoint in `functions/src/index.ts` is a placeholder, so no secured publish API path is in place yet.

## Risk Interpretation

- Low risk for basic progress syncing and public learning content.
- Medium/high risk if premium media/content must be strongly protected from direct URL access.

## Recommended Hardening Roadmap

1. Add and version-control Firebase rules:
   - Firestore: strict per-user read/write on `users/{uid}/...`
   - Storage: separate public/free vs protected/premium paths
2. Move premium content delivery behind a signed-access pattern:
   - callable HTTPS function verifies entitlement
   - function returns short-lived signed URL
3. Add App Check for abuse reduction on Firestore/Functions.
4. Keep entitlement validation server-side for any paid flows.
5. Rotate service account keys periodically and keep service account least-privileged.

## Practical Minimum for Next Milestone

If timeline is tight, implement this minimum set first:

1. Firestore rules
2. Storage path split (`public/` vs `premium/`)
3. Server-verified premium URL issuance for premium assets

This closes the biggest product risk (premium leakage) without requiring a full auth-provider rollout first.
