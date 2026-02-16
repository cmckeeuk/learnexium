import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import {
  collection,
  DocumentData,
  DocumentSnapshot,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { firebaseAuth, firebaseDb, isFirebaseConfigured } from '../../config/firebaseClient';
import {
  BadgeProgress,
  CertificateRecord,
  CourseProgress,
  LessonRewardStatus,
  LessonStatus,
  PremiumStatus,
  RewardEvent,
  RewardMutationResult,
  RewardsSummary,
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
type LessonRewardStatusMap = Record<string, LessonRewardStatus>;

type RewardCollectionDoc<T> = {
  data?: T;
  updatedAt?: string;
};
type RewardSnapshot = {
  summary: RewardsSummary;
  events: RewardEvent[];
  badges: BadgeProgress[];
  certificates: CertificateRecord[];
};

const REWARDS_COLLECTION = 'rewards';
const REWARDS_SUMMARY_DOC = 'summary';
const REWARDS_EVENTS_DOC = 'events';
const REWARDS_BADGES_DOC = 'badges';
const REWARDS_CERTIFICATES_DOC = 'certificates';
const REWARDS_LESSON_DOC_PREFIX = 'lesson:';
const XP_PER_LEVEL = 200;

export class FirebaseUserAPI implements UserAPI {
  private localUserAPI = new LocalUserAPI();
  private anonymousSignInPromise: Promise<User | null> | null = null;
  private migrationPromises: Partial<Record<string, Promise<void>>> = {};
  private courseSyncPromises: Partial<Record<string, Promise<void>>> = {};
  private rewardsSyncPromise: Promise<void> | null = null;
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

  async markFlashcardsCompleted(
    courseId: string,
    lessonId: string,
  ): Promise<RewardMutationResult> {
    const result = await this.localUserAPI.markFlashcardsCompleted(courseId, lessonId);
    void this.syncRewardsInBackground(courseId);
    return result;
  }

  async markQuizCompleted(
    courseId: string,
    lessonId: string,
    score: number,
    totalQuestions: number,
  ): Promise<RewardMutationResult> {
    const result = await this.localUserAPI.markQuizCompleted(
      courseId,
      lessonId,
      score,
      totalQuestions,
    );
    void this.syncRewardsInBackground(courseId);
    return result;
  }

  async getLessonStatus(courseId: string, lessonId: string): Promise<LessonStatus | null> {
    // Serve local immediately, then refresh remote in the background.
    const local = await this.getLocalMap(courseId);
    void this.syncCourseInBackground(courseId);
    return local[lessonId] ?? null;
  }

  async getCourseProgress(courseId: string, totalLessons: number): Promise<CourseProgress> {
    await this.localUserAPI.recordCourseLessonCount(courseId, totalLessons);
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

  async getRewardsSummary(): Promise<RewardsSummary> {
    const local = await this.localUserAPI.getRewardsSummary();
    void this.syncRewardsInBackground();
    return local;
  }

  async getRecentRewardEvents(limit: number = 20): Promise<RewardEvent[]> {
    const local = await this.localUserAPI.getRecentRewardEvents(limit);
    void this.syncRewardsInBackground();
    return local;
  }

  async getBadges(): Promise<BadgeProgress[]> {
    const local = await this.localUserAPI.getBadges();
    void this.syncRewardsInBackground();
    return local;
  }

  async getCertificates(): Promise<CertificateRecord[]> {
    const local = await this.localUserAPI.getCertificates();
    void this.syncRewardsInBackground();
    return local;
  }

  async clearAllProgress(): Promise<void> {
    await this.localUserAPI.clearAllProgress();

    if (this.isInLocalFallbackWindow()) return;
    const user = await this.getSyncedUser();
    const db = firebaseDb;
    if (!user || !db) return;

    try {
      const [progressSnapshot, rewardSnapshot] = await Promise.all([
        this.withRemoteTimeout(
          getDocs(collection(db, 'users', user.uid, 'progress')),
          'clearAllProgress:getDocs',
          null,
        ),
        this.withRemoteTimeout(
          getDocs(collection(db, 'users', user.uid, REWARDS_COLLECTION)),
          'clearAllProgress:getRewardsDocs',
          null,
        ),
      ]);

      const batch = writeBatch(db);
      let deleteCount = 0;

      if (progressSnapshot) {
        progressSnapshot.docs.forEach((snap) => {
          batch.delete(doc(db, 'users', user.uid, 'progress', snap.id));
          deleteCount += 1;
        });
      }

      if (rewardSnapshot) {
        rewardSnapshot.docs.forEach((snap) => {
          batch.delete(doc(db, 'users', user.uid, REWARDS_COLLECTION, snap.id));
          deleteCount += 1;
        });
      }

      if (deleteCount > 0) {
        await this.withRemoteTimeout(batch.commit(), 'clearAllProgress:commit', undefined);
      }
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

  private async syncRewardsInBackground(courseId?: string): Promise<void> {
    if (this.isInLocalFallbackWindow()) return;
    if (this.rewardsSyncPromise) return this.rewardsSyncPromise;

    this.rewardsSyncPromise = (async () => {
      const db = firebaseDb;
      const user = await this.getSyncedUser();
      if (!db || !user || this.isInLocalFallbackWindow()) return;

      const localSnapshot = await this.localUserAPI.getRewardSnapshot();
      const remoteSnapshot = await this.getRemoteRewardSnapshot(user.uid);
      const mergedSnapshot = this.mergeRewardSnapshots(localSnapshot, remoteSnapshot);

      if (!this.areRewardSnapshotsEqual(localSnapshot, mergedSnapshot)) {
        await this.localUserAPI.setRewardSnapshot(mergedSnapshot);
      }
      if (!this.areRewardSnapshotsEqual(remoteSnapshot, mergedSnapshot)) {
        await this.writeRemoteRewardSnapshot(user.uid, mergedSnapshot);
      }

      if (!courseId) return;

      const localLessonMap = await this.localUserAPI.getLessonRewardStatusMap(courseId);
      const remoteLessonMap = await this.getRemoteLessonRewardMap(user.uid, courseId);
      const mergedLessonMap = this.mergeLessonRewardMaps(localLessonMap, remoteLessonMap);

      if (!this.areLessonRewardMapsEqual(localLessonMap, mergedLessonMap)) {
        await this.localUserAPI.setLessonRewardStatusMap(courseId, mergedLessonMap);
      }
      if (!this.areLessonRewardMapsEqual(remoteLessonMap, mergedLessonMap)) {
        await this.writeRemoteLessonRewardMap(user.uid, courseId, mergedLessonMap);
      }
    })()
      .catch((error) => {
        this.handleRemoteError('syncRewardsInBackground', error);
      })
      .finally(() => {
        this.rewardsSyncPromise = null;
      });

    return this.rewardsSyncPromise;
  }

  private async getRemoteRewardSnapshot(uid: string): Promise<RewardSnapshot> {
    const db = firebaseDb;
    const empty: RewardSnapshot = {
      summary: this.buildDefaultRewardsSummary(),
      events: [],
      badges: [],
      certificates: [],
    };
    if (!db || this.isInLocalFallbackWindow()) return empty;

    try {
      const [summarySnap, eventsSnap, badgesSnap, certificatesSnap] = await Promise.all([
        this.withRemoteTimeout(
          getDoc(doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_SUMMARY_DOC)),
          'getRemoteRewardSnapshot:summary',
          null,
        ),
        this.withRemoteTimeout(
          getDoc(doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_EVENTS_DOC)),
          'getRemoteRewardSnapshot:events',
          null,
        ),
        this.withRemoteTimeout(
          getDoc(doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_BADGES_DOC)),
          'getRemoteRewardSnapshot:badges',
          null,
        ),
        this.withRemoteTimeout(
          getDoc(doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_CERTIFICATES_DOC)),
          'getRemoteRewardSnapshot:certificates',
          null,
        ),
      ]);

      const summaryDoc = this.getRewardDocData<RewardsSummary>(summarySnap);
      const eventsDoc = this.getRewardDocData<RewardEvent[]>(eventsSnap);
      const badgesDoc = this.getRewardDocData<BadgeProgress[]>(badgesSnap);
      const certificatesDoc = this.getRewardDocData<CertificateRecord[]>(certificatesSnap);

      return {
        summary: this.normalizeSummary(summaryDoc?.data ?? empty.summary, summaryDoc?.updatedAt),
        events: this.normalizeEvents(eventsDoc?.data ?? []),
        badges: this.normalizeBadges(badgesDoc?.data ?? []),
        certificates: this.normalizeCertificates(certificatesDoc?.data ?? []),
      };
    } catch (error) {
      this.handleRemoteError('getRemoteRewardSnapshot', error);
      return empty;
    }
  }

  private async writeRemoteRewardSnapshot(uid: string, snapshot: RewardSnapshot): Promise<void> {
    const db = firebaseDb;
    if (!db || this.isInLocalFallbackWindow()) return;

    const now = new Date().toISOString();
    const normalizedSummary = this.normalizeSummary(snapshot.summary, snapshot.summary.updatedAt ?? now);
    const normalizedEvents = this.normalizeEvents(snapshot.events);
    const normalizedBadges = this.normalizeBadges(snapshot.badges);
    const normalizedCertificates = this.normalizeCertificates(snapshot.certificates);

    await Promise.all([
      this.withRemoteTimeout(
        setDoc(
          doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_SUMMARY_DOC),
          { data: normalizedSummary, updatedAt: normalizedSummary.updatedAt ?? now },
          { merge: true },
        ),
        'writeRemoteRewardSnapshot:summary',
        undefined,
      ),
      this.withRemoteTimeout(
        setDoc(
          doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_EVENTS_DOC),
          { data: normalizedEvents, updatedAt: now },
          { merge: true },
        ),
        'writeRemoteRewardSnapshot:events',
        undefined,
      ),
      this.withRemoteTimeout(
        setDoc(
          doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_BADGES_DOC),
          { data: normalizedBadges, updatedAt: now },
          { merge: true },
        ),
        'writeRemoteRewardSnapshot:badges',
        undefined,
      ),
      this.withRemoteTimeout(
        setDoc(
          doc(db, 'users', uid, REWARDS_COLLECTION, REWARDS_CERTIFICATES_DOC),
          { data: normalizedCertificates, updatedAt: now },
          { merge: true },
        ),
        'writeRemoteRewardSnapshot:certificates',
        undefined,
      ),
    ]);
  }

  private async getRemoteLessonRewardMap(
    uid: string,
    courseId: string,
  ): Promise<LessonRewardStatusMap> {
    const db = firebaseDb;
    if (!db || this.isInLocalFallbackWindow()) return {};
    try {
      const snap = await this.withRemoteTimeout(
        getDoc(
          doc(
            db,
            'users',
            uid,
            REWARDS_COLLECTION,
            `${REWARDS_LESSON_DOC_PREFIX}${courseId}`,
          ),
        ),
        `getRemoteLessonRewardMap:${courseId}`,
        null,
      );
      const payload = this.getRewardDocData<LessonRewardStatusMap>(snap);
      return this.normalizeLessonRewardMap(payload?.data ?? {}, courseId);
    } catch (error) {
      this.handleRemoteError(`getRemoteLessonRewardMap:${courseId}`, error);
      return {};
    }
  }

  private async writeRemoteLessonRewardMap(
    uid: string,
    courseId: string,
    map: LessonRewardStatusMap,
  ): Promise<void> {
    const db = firebaseDb;
    if (!db || this.isInLocalFallbackWindow()) return;
    const normalizedMap = this.normalizeLessonRewardMap(map, courseId);
    await this.withRemoteTimeout(
      setDoc(
        doc(db, 'users', uid, REWARDS_COLLECTION, `${REWARDS_LESSON_DOC_PREFIX}${courseId}`),
        { data: normalizedMap, updatedAt: new Date().toISOString() },
        { merge: true },
      ),
      `writeRemoteLessonRewardMap:${courseId}`,
      undefined,
    );
  }

  private mergeRewardSnapshots(a: RewardSnapshot, b: RewardSnapshot): RewardSnapshot {
    const summaryA = this.normalizeSummary(a.summary, a.summary.updatedAt);
    const summaryB = this.normalizeSummary(b.summary, b.summary.updatedAt);
    const summary =
      this.compareIso(summaryA.updatedAt, summaryB.updatedAt) >= 0
        ? summaryA
        : summaryB;

    const eventById = new Map<string, RewardEvent>();
    for (const event of [...a.events, ...b.events]) {
      const existing = eventById.get(event.eventId);
      if (!existing || this.compareIso(event.occurredAt, existing.occurredAt) >= 0) {
        eventById.set(event.eventId, event);
      }
    }

    const badgeById = new Map<string, BadgeProgress>();
    for (const badge of [...a.badges, ...b.badges]) {
      const existing = badgeById.get(badge.badgeId);
      if (!existing) {
        badgeById.set(badge.badgeId, badge);
        continue;
      }
      badgeById.set(badge.badgeId, {
        ...existing,
        title: badge.title || existing.title,
        description: badge.description || existing.description,
        target: Math.max(existing.target ?? 0, badge.target ?? 0),
        progress: Math.max(existing.progress ?? 0, badge.progress ?? 0),
        earned: existing.earned || badge.earned,
        earnedAt: this.pickEarlierIso(existing.earnedAt, badge.earnedAt),
      });
    }

    const certById = new Map<string, CertificateRecord>();
    for (const cert of [...a.certificates, ...b.certificates]) {
      const existing = certById.get(cert.certificateId);
      if (!existing || this.compareIso(existing.issuedAt, cert.issuedAt) < 0) {
        certById.set(cert.certificateId, cert);
      }
    }

    const merged: RewardSnapshot = {
      summary,
      events: this.normalizeEvents(Array.from(eventById.values())),
      badges: this.normalizeBadges(Array.from(badgeById.values())),
      certificates: this.normalizeCertificates(Array.from(certById.values())),
    };
    merged.summary.badgesEarned = merged.badges.filter((b) => b.earned).length;
    merged.summary.certificatesEarned = merged.certificates.length;
    merged.summary = this.normalizeSummary(merged.summary, merged.summary.updatedAt);
    return merged;
  }

  private mergeLessonRewardMaps(
    a: LessonRewardStatusMap,
    b: LessonRewardStatusMap,
  ): LessonRewardStatusMap {
    const merged: LessonRewardStatusMap = { ...a };
    for (const [lessonId, status] of Object.entries(b)) {
      const existing = merged[lessonId];
      if (!existing) {
        merged[lessonId] = status;
        continue;
      }
      if (this.compareIso(status.updatedAt, existing.updatedAt) >= 0) {
        merged[lessonId] = status;
      }
    }
    return merged;
  }

  private areRewardSnapshotsEqual(a: RewardSnapshot, b: RewardSnapshot): boolean {
    return JSON.stringify({
      summary: this.normalizeSummary(a.summary, a.summary.updatedAt),
      events: this.normalizeEvents(a.events),
      badges: this.normalizeBadges(a.badges),
      certificates: this.normalizeCertificates(a.certificates),
    }) === JSON.stringify({
      summary: this.normalizeSummary(b.summary, b.summary.updatedAt),
      events: this.normalizeEvents(b.events),
      badges: this.normalizeBadges(b.badges),
      certificates: this.normalizeCertificates(b.certificates),
    });
  }

  private areLessonRewardMapsEqual(
    a: LessonRewardStatusMap,
    b: LessonRewardStatusMap,
  ): boolean {
    return JSON.stringify(this.normalizeLessonRewardMap(a)) === JSON.stringify(this.normalizeLessonRewardMap(b));
  }

  private normalizeSummary(summary: RewardsSummary, updatedAt?: string): RewardsSummary {
    const totalXp = Math.max(0, summary.totalXp ?? 0);
    const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
    const currentLevelFloor = (level - 1) * XP_PER_LEVEL;
    return {
      totalXp,
      level,
      currentLevelXp: totalXp - currentLevelFloor,
      nextLevelXp: level * XP_PER_LEVEL,
      badgesEarned: summary.badgesEarned ?? 0,
      certificatesEarned: summary.certificatesEarned ?? 0,
      updatedAt: summary.updatedAt ?? updatedAt ?? new Date(0).toISOString(),
    };
  }

  private normalizeEvents(events: RewardEvent[]): RewardEvent[] {
    return [...events]
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((event) => {
        const normalized: RewardEvent = {
          eventId: event.eventId,
          type: event.type,
          occurredAt: event.occurredAt,
        };
        if (event.courseId !== undefined) normalized.courseId = event.courseId;
        if (event.lessonId !== undefined) normalized.lessonId = event.lessonId;
        if (event.badgeId !== undefined) normalized.badgeId = event.badgeId;
        if (event.certificateId !== undefined) normalized.certificateId = event.certificateId;
        if (event.xpDelta !== undefined) normalized.xpDelta = event.xpDelta;
        if (event.metadata && typeof event.metadata === 'object') {
          const metadata = Object.fromEntries(
            Object.entries(event.metadata).filter(([, value]) => value !== undefined),
          ) as Record<string, string | number | boolean | null>;
          if (Object.keys(metadata).length > 0) {
            normalized.metadata = metadata;
          }
        }
        return normalized;
      });
  }

  private normalizeBadges(badges: BadgeProgress[]): BadgeProgress[] {
    return [...badges]
      .sort((a, b) => a.badgeId.localeCompare(b.badgeId))
      .map((badge) => {
        const normalized: BadgeProgress = {
          badgeId: badge.badgeId,
          title: badge.title,
          description: badge.description,
          target: Math.max(0, badge.target ?? 0),
          progress: Math.max(0, badge.progress ?? 0),
          earned: Boolean(badge.earned),
        };
        if (badge.earnedAt !== undefined) {
          normalized.earnedAt = badge.earnedAt;
        }
        return normalized;
      });
  }

  private normalizeCertificates(certificates: CertificateRecord[]): CertificateRecord[] {
    return [...certificates]
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))
      .map((cert) => {
        const normalized: CertificateRecord = {
          certificateId: cert.certificateId,
          courseId: cert.courseId,
          courseTitle: cert.courseTitle,
          issuedAt: cert.issuedAt,
        };
        if (cert.lessonsCompleted !== undefined) {
          normalized.lessonsCompleted = cert.lessonsCompleted;
        }
        if (cert.averageQuizScore !== undefined) {
          normalized.averageQuizScore = cert.averageQuizScore;
        }
        return normalized;
      });
  }

  private normalizeLessonRewardMap(
    map: LessonRewardStatusMap,
    fallbackCourseId?: string,
  ): LessonRewardStatusMap {
    const normalized: LessonRewardStatusMap = {};
    for (const [lessonId, status] of Object.entries(map ?? {})) {
      if (!status || typeof status !== 'object') continue;
      const next: LessonRewardStatus = {
        lessonId: status.lessonId ?? lessonId,
        courseId: status.courseId ?? fallbackCourseId ?? '',
        xpAwarded: Math.max(0, status.xpAwarded ?? 0),
        updatedAt: status.updatedAt ?? new Date(0).toISOString(),
      };
      if (status.flashcardsCompletedAt !== undefined) {
        next.flashcardsCompletedAt = status.flashcardsCompletedAt;
      }
      if (status.quizCompletedAt !== undefined) {
        next.quizCompletedAt = status.quizCompletedAt;
      }
      if (status.quizScore !== undefined) {
        next.quizScore = status.quizScore;
      }
      if (status.masteryAwardedAt !== undefined) {
        next.masteryAwardedAt = status.masteryAwardedAt;
      }
      normalized[lessonId] = next;
    }
    return normalized;
  }

  private getRewardDocData<T>(
    snap: DocumentSnapshot<DocumentData> | null,
  ): RewardCollectionDoc<T> | null {
    if (!snap || !snap.exists()) return null;
    const data = snap.data() as RewardCollectionDoc<T>;
    if (!data || typeof data !== 'object') return null;
    return data;
  }

  private compareIso(a?: string, b?: string): number {
    const aa = a ?? '';
    const bb = b ?? '';
    if (aa === bb) return 0;
    return aa > bb ? 1 : -1;
  }

  private pickEarlierIso(a?: string, b?: string): string | undefined {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }

  private buildDefaultRewardsSummary(): RewardsSummary {
    return {
      totalXp: 0,
      level: 1,
      currentLevelXp: 0,
      nextLevelXp: XP_PER_LEVEL,
      badgesEarned: 0,
      certificatesEarned: 0,
      updatedAt: new Date(0).toISOString(),
    };
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
