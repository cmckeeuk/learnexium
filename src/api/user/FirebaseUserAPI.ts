import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from '../../config/firebaseClient';
import {
  CourseProgress,
  LessonStatus,
  PremiumStatus,
  UserAPI,
} from './UserAPI';
import { LocalUserAPI } from './LocalUserAPI';

const PROGRESS_PREFIX = 'progress:';
const MIGRATION_PREFIX = 'progress:migrated:';

type LessonStatusMap = Record<string, LessonStatus>;
type ProgressDoc = {
  lessons?: LessonStatusMap;
  updatedAt?: string;
};

export class FirebaseUserAPI implements UserAPI {
  private localUserAPI = new LocalUserAPI();
  private anonymousSignInPromise: Promise<User | null> | null = null;
  private migrationPromises: Record<string, Promise<void>> = {};
  private courseSyncPromises: Record<string, Promise<void>> = {};
  private syncedUserPromise: Promise<User | null> | null = null;
  private localFallbackUntilMs = 0;
  private lastRemoteErrorLogAtMs = 0;
  private static readonly AUTH_TIMEOUT_MS = 3500;
  private static readonly MIGRATION_TIMEOUT_MS = 2500;
  private static readonly REMOTE_OP_TIMEOUT_MS = 1800;
  private static readonly FALLBACK_WINDOW_MS = 30000;

  constructor() {
    if (!isFirebaseConfigured || !firebaseAuth) return;
    onAuthStateChanged(firebaseAuth, (user) => {
      this.syncedUserPromise = null;
      if (!user) {
        void this.ensureAnonymousUser();
        return;
      }
      this.localFallbackUntilMs = 0;
    });
  }

  async isPremium(): Promise<boolean> {
    return this.localUserAPI.isPremium();
  }

  async getPremiumStatus(): Promise<PremiumStatus> {
    return this.localUserAPI.getPremiumStatus();
  }

  async canAccessLesson(
    courseId: string,
    lessonId: string,
    lessonIsPremium: boolean,
  ): Promise<boolean> {
    return this.localUserAPI.canAccessLesson(courseId, lessonId, lessonIsPremium);
  }

  async upgradeToPremium(): Promise<void> {
    await this.localUserAPI.upgradeToPremium();
  }

  async markLessonOpened(courseId: string, lessonId: string): Promise<void> {
    await this.localUserAPI.markLessonOpened(courseId, lessonId);
    // Local-first UX: sync Firebase asynchronously so UI never waits on network.
    void this.syncCourseInBackground(courseId);
  }

  async markLessonCompleted(courseId: string, lessonId: string): Promise<void> {
    await this.localUserAPI.markLessonCompleted(courseId, lessonId);
    // Local-first UX: sync Firebase asynchronously so UI never waits on network.
    void this.syncCourseInBackground(courseId);
  }

  async getLessonStatus(courseId: string, lessonId: string): Promise<LessonStatus | null> {
    // Serve local immediately, then refresh remote in the background.
    const local = await this.getLocalMap(courseId);
    void this.syncCourseInBackground(courseId);
    return local[lessonId] ?? null;
  }

  async getCourseProgress(courseId: string, totalLessons: number): Promise<CourseProgress> {
    // Serve local immediately, then refresh remote in the background.
    const local = await this.getLocalMap(courseId);
    void this.syncCourseInBackground(courseId);
    return this.computeCourseProgress(courseId, totalLessons, local);
  }

  async getAllCourseProgress(): Promise<CourseProgress[]> {
    if (this.isInLocalFallbackWindow()) {
      return this.localUserAPI.getAllCourseProgress();
    }
    const user = await this.getSyncedUser();
    const db = firebaseDb;
    if (!user || !db) {
      return this.localUserAPI.getAllCourseProgress();
    }

    try {
      const snapshot = await this.withRemoteTimeout(
        getDocs(collection(db, 'users', user.uid, 'progress')),
        'getAllCourseProgress',
        null,
      );
      if (!snapshot) {
        return this.localUserAPI.getAllCourseProgress();
      }
      return snapshot.docs.map((snap) => {
        const courseId = snap.id;
        const data = (snap.data() as ProgressDoc) || {};
        const map = data.lessons ?? {};
        const totalLessons = Object.keys(map).length;
        return this.computeCourseProgress(courseId, totalLessons, map);
      });
    } catch (error) {
      this.handleRemoteError('getAllCourseProgress', error);
      return this.localUserAPI.getAllCourseProgress();
    }
  }

  async clearAllProgress(): Promise<void> {
    await this.localUserAPI.clearAllProgress();

    if (this.isInLocalFallbackWindow()) return;
    const user = await this.getSyncedUser();
    const db = firebaseDb;
    if (!user || !db) return;

    try {
      const snapshot = await this.withRemoteTimeout(
        getDocs(collection(db, 'users', user.uid, 'progress')),
        'clearAllProgress:getDocs',
        null,
      );
      if (!snapshot) return;
      if (snapshot.empty) return;

      const batch = writeBatch(db);
      snapshot.docs.forEach((snap) => {
        batch.delete(doc(db, 'users', user.uid, 'progress', snap.id));
      });
      await this.withRemoteTimeout(batch.commit(), 'clearAllProgress:commit', undefined);
    } catch (error) {
      this.handleRemoteError('clearAllProgress', error);
    }
  }

  private async getSyncedUser(): Promise<User | null> {
    if (this.isInLocalFallbackWindow()) {
      return null;
    }

    if (this.syncedUserPromise) {
      return this.syncedUserPromise;
    }

    this.syncedUserPromise = (async () => {
      const user = await this.withTimeout<User | null>(
        this.ensureAnonymousUser(),
        FirebaseUserAPI.AUTH_TIMEOUT_MS,
        null,
      );
      if (!user) {
        this.localFallbackUntilMs = Date.now() + FirebaseUserAPI.FALLBACK_WINDOW_MS;
        return null;
      }
      this.localFallbackUntilMs = 0;

      await this.withTimeout<void>(
        this.migrateLocalProgressIfNeeded(user.uid),
        FirebaseUserAPI.MIGRATION_TIMEOUT_MS,
        undefined,
      );
      return user;
    })().finally(() => {
      this.syncedUserPromise = null;
    });

    return this.syncedUserPromise;
  }

  private async ensureAnonymousUser(): Promise<User | null> {
    if (!isFirebaseConfigured || !firebaseAuth) return null;
    if (firebaseAuth.currentUser) return firebaseAuth.currentUser;

    if (!this.anonymousSignInPromise) {
      this.anonymousSignInPromise = signInAnonymously(firebaseAuth)
        .then((credential) => credential.user)
        .catch((error) => {
          console.warn('[FirebaseUserAPI] Anonymous sign-in failed. Using local progress only.', error);
          this.localFallbackUntilMs = Date.now() + FirebaseUserAPI.FALLBACK_WINDOW_MS;
          return null;
        })
        .finally(() => {
          this.anonymousSignInPromise = null;
        });
    }

    return this.anonymousSignInPromise;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), ms);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async migrateLocalProgressIfNeeded(uid: string): Promise<void> {
    const markerKey = `${MIGRATION_PREFIX}${uid}`;
    const alreadyMigrated = await AsyncStorage.getItem(markerKey);
    if (alreadyMigrated === 'true') return;

    if (!this.migrationPromises[uid]) {
      this.migrationPromises[uid] = (async () => {
        const keys = await AsyncStorage.getAllKeys();
        const progressKeys = keys.filter((k) => k.startsWith(PROGRESS_PREFIX));

        for (const key of progressKeys) {
          const courseId = key.slice(PROGRESS_PREFIX.length);
          const localMap = await this.getLocalMap(courseId);
          const remoteMap = await this.getRemoteMap(uid, courseId);
          const mergedMap = this.mergeMaps(localMap, remoteMap);
          if (Object.keys(mergedMap).length > 0) {
            await this.writeRemoteMap(uid, courseId, mergedMap);
          }
        }

        await AsyncStorage.setItem(markerKey, 'true');
      })().finally(() => {
        delete this.migrationPromises[uid];
      });
    }

    await this.migrationPromises[uid];
  }

  private async getRemoteMap(uid: string, courseId: string): Promise<LessonStatusMap> {
    const db = firebaseDb;
    if (!db || this.isInLocalFallbackWindow()) return {};
    try {
      const snap = await this.withRemoteTimeout(
        getDoc(doc(db, 'users', uid, 'progress', courseId)),
        `getRemoteMap:${courseId}`,
        null,
      );
      if (!snap) return {};
      if (!snap.exists()) return {};
      const data = (snap.data() as ProgressDoc) || {};
      return data.lessons ?? {};
    } catch (error) {
      this.handleRemoteError(`getRemoteMap:${courseId}`, error);
      return {};
    }
  }

  private async writeRemoteMap(uid: string, courseId: string, map: LessonStatusMap): Promise<void> {
    const db = firebaseDb;
    if (!db || this.isInLocalFallbackWindow()) return;
    try {
      await this.withRemoteTimeout(
        setDoc(
          doc(db, 'users', uid, 'progress', courseId),
          { lessons: map, updatedAt: new Date().toISOString() },
          { merge: true },
        ),
        `writeRemoteMap:${courseId}`,
        undefined,
      );
    } catch (error) {
      this.handleRemoteError(`writeRemoteMap:${courseId}`, error);
    }
  }

  private async getLocalMap(courseId: string): Promise<LessonStatusMap> {
    const raw = await AsyncStorage.getItem(`${PROGRESS_PREFIX}${courseId}`);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as LessonStatusMap;
    } catch {
      return {};
    }
  }

  private async writeLocalMap(courseId: string, map: LessonStatusMap): Promise<void> {
    await AsyncStorage.setItem(`${PROGRESS_PREFIX}${courseId}`, JSON.stringify(map));
  }

  private async syncCourseInBackground(courseId: string): Promise<void> {
    if (this.isInLocalFallbackWindow()) return;
    if (this.courseSyncPromises[courseId]) return this.courseSyncPromises[courseId];

    this.courseSyncPromises[courseId] = (async () => {
      const db = firebaseDb;
      const user = await this.getSyncedUser();
      if (!db || !user || this.isInLocalFallbackWindow()) return;

      const local = await this.getLocalMap(courseId);
      const remote = await this.getRemoteMap(user.uid, courseId);
      if (this.isInLocalFallbackWindow()) return;

      const merged = this.mergeMaps(local, remote);
      const needsLocalWrite = !this.areMapsEqual(local, merged);
      const needsRemoteWrite = !this.areMapsEqual(remote, merged);

      if (needsLocalWrite) {
        await this.writeLocalMap(courseId, merged);
      }
      if (needsRemoteWrite) {
        await this.writeRemoteMap(user.uid, courseId, merged);
      }
    })()
      .catch((error) => {
        this.handleRemoteError(`syncCourseInBackground:${courseId}`, error);
      })
      .finally(() => {
        delete this.courseSyncPromises[courseId];
      });

    return this.courseSyncPromises[courseId];
  }

  private areMapsEqual(a: LessonStatusMap, b: LessonStatusMap): boolean {
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      const aa = a[key];
      const bb = b[key];
      if (!bb) return false;
      if (aa.lessonId !== bb.lessonId) return false;
      if (aa.courseId !== bb.courseId) return false;
      if (aa.state !== bb.state) return false;
      if (aa.firstOpenedAt !== bb.firstOpenedAt) return false;
      if (aa.lastAccessedAt !== bb.lastAccessedAt) return false;
      if ((aa.completedAt ?? '') !== (bb.completedAt ?? '')) return false;
    }

    return true;
  }

  private mergeMaps(a: LessonStatusMap, b: LessonStatusMap): LessonStatusMap {
    const merged: LessonStatusMap = { ...a };
    for (const [lessonId, status] of Object.entries(b)) {
      const existing = merged[lessonId];
      if (!existing) {
        merged[lessonId] = status;
        continue;
      }
      if ((status.lastAccessedAt ?? '') >= (existing.lastAccessedAt ?? '')) {
        merged[lessonId] = status;
      }
    }
    return merged;
  }

  private computeCourseProgress(
    courseId: string,
    totalLessons: number,
    map: LessonStatusMap,
  ): CourseProgress {
    const statuses = Object.values(map);
    let completedCount = 0;
    let inProgressCount = 0;
    let latestAccess: string | undefined;
    let latestInProgressAt: string | undefined;
    let currentLessonId: string | undefined;
    const completedLessonIds: string[] = [];

    for (const status of statuses) {
      if (status.state === 'completed') {
        completedCount++;
        completedLessonIds.push(status.lessonId);
      } else if (status.state === 'in-progress') {
        inProgressCount++;
        if (!latestInProgressAt || status.lastAccessedAt > latestInProgressAt) {
          latestInProgressAt = status.lastAccessedAt;
          currentLessonId = status.lessonId;
        }
      }

      if (!latestAccess || status.lastAccessedAt > latestAccess) {
        latestAccess = status.lastAccessedAt;
      }
    }

    const notStartedCount = totalLessons - completedCount - inProgressCount;
    return {
      courseId,
      totalLessons,
      completedCount,
      inProgressCount,
      notStartedCount: Math.max(0, notStartedCount),
      completionPercentage: totalLessons > 0
        ? Math.round((completedCount / totalLessons) * 100)
        : 0,
      lastAccessedAt: latestAccess,
      currentLessonId,
      completedLessonIds,
    };
  }

  private isInLocalFallbackWindow(): boolean {
    return Date.now() < this.localFallbackUntilMs;
  }

  private async withRemoteTimeout<T>(
    promise: Promise<T>,
    op: string,
    fallback: T,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race<T>([
        promise,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => {
            this.handleRemoteError(`${op}:timeout`, new Error('remote operation timed out'));
            resolve(fallback);
          }, FirebaseUserAPI.REMOTE_OP_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private handleRemoteError(op: string, error: unknown): void {
    const now = Date.now();
    const wasInFallback = this.isInLocalFallbackWindow();
    this.localFallbackUntilMs = now + FirebaseUserAPI.FALLBACK_WINDOW_MS;

    const shouldLog = !wasInFallback || now - this.lastRemoteErrorLogAtMs > 5000;
    if (shouldLog) {
      this.lastRemoteErrorLogAtMs = now;
      console.warn(`[FirebaseUserAPI] ${op} failed, using local fallback for 30s.`, error);
    }
  }
}
