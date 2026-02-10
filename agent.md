# Agent Guide

Use this file as the operational guide for code changes in this repository.

## Canonical Documentation

Start here before making structural changes:

- `docs/functional-summary.md`
- `docs/high-level-architecture.md`
- `docs/progress-system.md`
- `docs/content-management.md`
- `docs/security.md`

## Non-Negotiable Contracts

1. Lesson IDs are slug-based and parser-generated.  
   Do not change ID generation semantics without a migration plan.

2. Progress is local-first with background Firebase sync.  
   UI should remain responsive even if Firestore is slow/offline.

3. Course/home content is delivered from Firebase Storage JSON.  
   Keep schema compatibility with `CourseAPI` and parser outputs.

4. Image cache busting relies on version/hash fields.  
   Preserve `buildVersionedImageUri()` behavior when changing media flow.

## Implementation Priorities

When making changes, prioritize in this order:

1. Data correctness
2. User experience latency/resilience
3. Backward compatibility
4. Visual polish

## Required Checks After Changes

1. Run app and validate:
   - Home loads without blocking
   - Course list/detail/lesson navigation works
   - Progress updates and persists across app reload

2. If touching Firebase progress:
   - Run `npm run test:firebase:progress`

3. If touching parser/content pipeline:
   - Validate `functions/src/parseGoogleDoc.ts` and `functions/src/parseHomeDoc.ts` outputs against current app types.

## Documentation Discipline

If you modify:

- progress behavior -> update `docs/progress-system.md`
- content schema or parser flow -> update `docs/content-management.md`
- auth/rules/enforcement -> update `docs/security.md`
- runtime module boundaries -> update `docs/high-level-architecture.md`

