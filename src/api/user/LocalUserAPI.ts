import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserAPI,
  PremiumStatus,
  LessonState,
  LessonStatus,
  CourseProgress,
} from './UserAPI';

const PROGRESS_PREFIX = 'progress:';
const PREMIUM_KEY = 'user:premium';

/**
 * LocalUserAPI — AsyncStorage-backed implementation of UserAPI.
 *
 * Storage layout:
 *   "progress:{courseId}" → JSON  Record<lessonId, LessonStatus>
 *   "user:premium"        → "true" | absent
 */
export class LocalUserAPI implements UserAPI {
  // ─── Premium ───────────────────────────────────────────────────────────────

  async isPremium(): Promise<boolean> {
    const val = await AsyncStorage.getItem(PREMIUM_KEY);
    return val === 'true';
  }

  async getPremiumStatus(): Promise<PremiumStatus> {
    const premium = await this.isPremium();
    return {
      isPremium: premium,
      subscriptionType: premium ? 'monthly' : undefined,
      trialActive: false,
    };
  }

  async canAccessLesson(
    _courseId: string,
    _lessonId: string,
    lessonIsPremium: boolean,
  ): Promise<boolean> {
    if (!lessonIsPremium) return true;
    return this.isPremium();
  }

  async upgradeToPremium(): Promise<void> {
    await AsyncStorage.setItem(PREMIUM_KEY, 'true');
    console.log('[LocalUserAPI] Premium flag set');
  }

  // ─── Progress Tracking ─────────────────────────────────────────────────────

  async markLessonOpened(courseId: string, lessonId: string): Promise<void> {
    const map = await this.readMap(courseId);
    const now = new Date().toISOString();

    if (map[lessonId]) {
      // Already tracked — just bump lastAccessedAt
      map[lessonId].lastAccessedAt = now;
    } else {
      // First time opening this lesson
      map[lessonId] = {
        lessonId,
        courseId,
        state: 'in-progress',
        firstOpenedAt: now,
        lastAccessedAt: now,
      };
    }

    await this.writeMap(courseId, map);
  }

  async markLessonCompleted(courseId: string, lessonId: string): Promise<void> {
    const map = await this.readMap(courseId);
    const now = new Date().toISOString();

    const existing = map[lessonId];
    if (existing) {
      if (existing.state === 'completed') return; // already done, no-op
      existing.state = 'completed';
      existing.completedAt = now;
      existing.lastAccessedAt = now;
    } else {
      // Edge case: completed without a prior open call
      map[lessonId] = {
        lessonId,
        courseId,
        state: 'completed',
        firstOpenedAt: now,
        lastAccessedAt: now,
        completedAt: now,
      };
    }

    await this.writeMap(courseId, map);
  }

  async getLessonStatus(
    courseId: string,
    lessonId: string,
  ): Promise<LessonStatus | null> {
    const map = await this.readMap(courseId);
    return map[lessonId] ?? null;
  }

  async getCourseProgress(
    courseId: string,
    totalLessons: number,
  ): Promise<CourseProgress> {
    const map = await this.readMap(courseId);
    const statuses = Object.values(map);

    let completedCount = 0;
    let inProgressCount = 0;
    let latestAccess: string | undefined;
    let currentLessonId: string | undefined;
    const completedLessonIds: string[] = [];

    // Track most recently accessed in-progress lesson for resume
    let latestInProgress: string | undefined;
    let latestInProgressAt: string | undefined;

    for (const s of statuses) {
      if (s.state === 'completed') {
        completedCount++;
        completedLessonIds.push(s.lessonId);
      }
      if (s.state === 'in-progress') {
        inProgressCount++;
        if (!latestInProgressAt || s.lastAccessedAt > latestInProgressAt) {
          latestInProgressAt = s.lastAccessedAt;
          latestInProgress = s.lessonId;
        }
      }

      if (!latestAccess || s.lastAccessedAt > latestAccess) {
        latestAccess = s.lastAccessedAt;
      }
    }

    // Prefer in-progress lesson for resume; undefined if all complete
    currentLessonId = latestInProgress;

    const notStartedCount = totalLessons - completedCount - inProgressCount;

    return {
      courseId,
      totalLessons,
      completedCount,
      inProgressCount,
      notStartedCount: Math.max(0, notStartedCount),
      completionPercentage:
        totalLessons > 0
          ? Math.round((completedCount / totalLessons) * 100)
          : 0,
      lastAccessedAt: latestAccess,
      currentLessonId,
      completedLessonIds,
    };
  }

  async getAllCourseProgress(): Promise<CourseProgress[]> {
    const keys = await AsyncStorage.getAllKeys();
    const progressKeys = keys.filter((k) => k.startsWith(PROGRESS_PREFIX));

    const results: CourseProgress[] = [];

    for (const key of progressKeys) {
      const courseId = key.slice(PROGRESS_PREFIX.length);
      const map = await this.readMap(courseId);
      const statuses = Object.values(map);

      // We don't know totalLessons here — use tracked count as approximation.
      // The caller should use getCourseProgress() with the real total when
      // it has the course detail available.
      const total = statuses.length;
      let completedCount = 0;
      let inProgressCount = 0;
      let latestAccess: string | undefined;
      let currentLessonId: string | undefined;
      const completedLessonIds: string[] = [];

      for (const s of statuses) {
        if (s.state === 'completed') {
          completedCount++;
          completedLessonIds.push(s.lessonId);
        }
        if (s.state === 'in-progress') inProgressCount++;
        if (!latestAccess || s.lastAccessedAt > latestAccess) {
          latestAccess = s.lastAccessedAt;
          currentLessonId = s.lessonId;
        }
      }

      results.push({
        courseId,
        totalLessons: total,
        completedCount,
        inProgressCount,
        notStartedCount: Math.max(0, total - completedCount - inProgressCount),
        completionPercentage:
          total > 0 ? Math.round((completedCount / total) * 100) : 0,
        lastAccessedAt: latestAccess,
        currentLessonId,
        completedLessonIds,
      });
    }

    return results;
  }

  async clearAllProgress(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const progressKeys = keys.filter((k) => k.startsWith(PROGRESS_PREFIX));
    if (progressKeys.length === 0) return;
    await AsyncStorage.multiRemove(progressKeys);
    console.log(`[LocalUserAPI] Cleared progress for ${progressKeys.length} course(s)`);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async readMap(
    courseId: string,
  ): Promise<Record<string, LessonStatus>> {
    const raw = await AsyncStorage.getItem(`${PROGRESS_PREFIX}${courseId}`);
    if (!raw) return {};
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  private async writeMap(
    courseId: string,
    map: Record<string, LessonStatus>,
  ): Promise<void> {
    await AsyncStorage.setItem(
      `${PROGRESS_PREFIX}${courseId}`,
      JSON.stringify(map),
    );
  }
}
