/**
 * Mock Firebase Admin SDK — loaded before any test file imports parseGoogleDoc.
 * This prevents the real Firebase init from running during tests.
 */

jest.mock('firebase-admin', () => ({
  apps: [{ name: 'mock' }], // non-empty so initializeApp is skipped
  initializeApp: jest.fn(),
  credential: { cert: jest.fn() },
  storage: jest.fn(() => ({
    bucket: jest.fn(() => ({
      file: jest.fn(() => ({
        save: jest.fn(),
        download: jest.fn(),
        exists: jest.fn(() => [false]),
      })),
    })),
  })),
}));
