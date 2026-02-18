import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore, Firestore, initializeFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FirebaseWebConfig = {
  apiKey?: string;
  authDomain?: string;
  projectId?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
};

const rawConfig: FirebaseWebConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

const requiredKeys: Array<keyof FirebaseWebConfig> = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
];

const missingKeys = requiredKeys.filter((key) => !rawConfig[key]);

export const isFirebaseConfigured = missingKeys.length === 0;

if (!isFirebaseConfigured) {
  // Keep app usable in local-only mode until env vars are configured.
  console.warn(
    `[Firebase] Missing config keys: ${missingKeys.join(', ')}. Falling back to local progress storage.`,
  );
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  const config = rawConfig as Required<FirebaseWebConfig>;
  app = getApps().length ? getApp() : initializeApp(config);
  if (Platform.OS === 'web') {
    auth = getAuth(app);
  } else {
    try {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    } catch {
      // Auth may already be initialized in fast refresh/reload cycles.
      auth = getAuth(app);
    }
  }
  // Firestore needs long-polling transport in many React Native/Expo environments.
  if (Platform.OS === 'web') {
    db = getFirestore(app);
  } else {
    try {
      db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      });
    } catch (error) {
      db = getFirestore(app);
      console.warn(
        '[Firebase] initializeFirestore(long-polling) failed, using existing Firestore instance.',
        error,
      );
    }
  }
}

export { app as firebaseApp, auth as firebaseAuth, db as firebaseDb };
