import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  UserAPI,
  PremiumStatus,
  LessonStatus,
  CourseProgress,
  BadgeProgress,
  CertificateRecord,
  LessonRewardStatus,
  RewardMutationResult,
  RewardEvent,
  RewardsSummary,
} from './UserAPI';

const PROGRESS_PREFIX = 'progress:';
const PREMIUM_KEY = 'user:premium';

const REWARDS_SUMMARY_KEY = 'rewards:summary';
const REWARDS_EVENTS_KEY = 'rewards:events';
const REWARDS_BADGES_KEY = 'rewards:badges';
const REWARDS_CERTIFICATES_KEY = 'rewards:certificates';
const REWARDS_LESSON_PREFIX = 'rewards:lesson:';
const COURSE_LESSON_COUNT_PREFIX = 'course:lessonCount:';

const XP_PER_LEVEL = 200;
const QUIZ_PASS_SCORE = 70;

type LessonStatusMap = Record<string, LessonStatus>;
type LessonRewardStatusMap = Record<string, LessonRewardStatus>;

type BadgeDefinition = {
  badgeId: string;
  title: string;
  description: string;
  target: number;
  metricKey: keyof RewardMetrics;
};

type CompletedCourseMetric = {
  courseId: string;
  lessonsCompleted: number;
  averageQuizScore?: number;
};

type RewardMetrics = {
  flashcardsCompletedCount: number;
  quizzesCompletedCount: number;
  perfectQuizCount: number;
  lessonsMasteredCount: number;
  lessonsCompletedCount: number;
  onARollCount: number;
  courseFinisherCount: number;
  completedCourses: CompletedCourseMetric[];
};

type RewardState = {
  summary: RewardsSummary;
  events: RewardEvent[];
  badges: BadgeProgress[];
  certificates: CertificateRecord[];
};

const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    badgeId: 'first-steps',
    title: 'First Steps',
    description: 'Complete your first lesson',
    target: 1,
    metricKey: 'lessonsCompletedCount',
  },
  {
    badgeId: 'card-crusher',
    title: 'Card Crusher',
    description: 'Complete 10 flashcard decks',
    target: 10,
    metricKey: 'flashcardsCompletedCount',
  },
  {
    badgeId: 'quiz-starter',
    title: 'Quiz Starter',
    description: 'Complete 5 quizzes',
    target: 5,
    metricKey: 'quizzesCompletedCount',
  },
  {
    badgeId: 'perfect-score',
    title: 'Perfect Score',
    description: 'Score 100% on a quiz',
    target: 1,
    metricKey: 'perfectQuizCount',
  },
  {
    badgeId: 'on-a-roll',
    title: 'On a Roll',
    description: 'Complete 3 lessons in one day',
    target: 1,
    metricKey: 'onARollCount',
  },
  {
    badgeId: 'course-finisher',
    title: 'Course Finisher',
    description: 'Complete a full course',
    target: 1,
    metricKey: 'courseFinisherCount',
  },
];

function buildSummary(totalXp: number, updatedAt?: string): RewardsSummary {
  const level = Math.floor(totalXp / XP_PER_LEVEL) + 1;
  const currentLevelFloor = (level - 1) * XP_PER_LEVEL;
  return {
    totalXp,
    level,
    currentLevelXp: totalXp - currentLevelFloor,
    nextLevelXp: level * XP_PER_LEVEL,
    badgesEarned: 0,
    certificatesEarned: 0,
    updatedAt,
  };
}

function maxScore(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.max(a, b);
}

function emptyRewardMutationResult(): RewardMutationResult {
  return {
    xpAwarded: 0,
    masteryAwarded: false,
    badgeIdsEarned: [],
    certificateIdsIssued: [],
  };
}

/**
 * LocalUserAPI — AsyncStorage-backed implementation of UserAPI.
 *
 * Storage layout:
 *   "progress:{courseId}"         → JSON Record<lessonId, LessonStatus>
 *   "user:premium"                → "true" | absent
 *   "rewards:summary"             → RewardsSummary
 *   "rewards:events"              → RewardEvent[]
 *   "rewards:badges"              → BadgeProgress[]
 *   "rewards:certificates"        → CertificateRecord[]
 *   "rewards:lesson:{courseId}"   → JSON Record<lessonId, LessonRewardStatus>
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
    const map = await this.readProgressMap(courseId);
    const now = new Date().toISOString();

    if (map[lessonId]) {
      map[lessonId].lastAccessedAt = now;
    } else {
      map[lessonId] = {
        lessonId,
        courseId,
        state: 'in-progress',
        firstOpenedAt: now,
        lastAccessedAt: now,
      };
    }

    await this.writeProgressMap(courseId, map);
  }

  async markLessonCompleted(courseId: string, lessonId: string): Promise<void> {
    const map = await this.readProgressMap(courseId);
    const now = new Date().toISOString();

    const existing = map[lessonId];
    if (existing) {
      if (existing.state === 'completed') return;
      existing.state = 'completed';
      existing.completedAt = now;
      existing.lastAccessedAt = now;
    } else {
      map[lessonId] = {
        lessonId,
        courseId,
        state: 'completed',
        firstOpenedAt: now,
        lastAccessedAt: now,
        completedAt: now,
      };
    }

    await this.writeProgressMap(courseId, map);
  }

  async getLessonStatus(
    courseId: string,
    lessonId: string,
  ): Promise<LessonStatus | null> {
    const map = await this.readProgressMap(courseId);
    return map[lessonId] ?? null;
  }

  async getCourseProgress(
    courseId: string,
    totalLessons: number,
  ): Promise<CourseProgress> {
    await this.recordCourseLessonCount(courseId, totalLessons);
    const map = await this.readProgressMap(courseId);
    const statuses = Object.values(map);

    let completedCount = 0;
    let inProgressCount = 0;
    let latestAccess: string | undefined;
    let currentLessonId: string | undefined;
    const completedLessonIds: string[] = [];

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
      const map = await this.readProgressMap(courseId);
      const statuses = Object.values(map);
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
    const rewardLessonKeys = keys.filter((k) => k.startsWith(REWARDS_LESSON_PREFIX));
    const courseLessonCountKeys = keys.filter((k) =>
      k.startsWith(COURSE_LESSON_COUNT_PREFIX),
    );
    const rewardKeys = [
      REWARDS_SUMMARY_KEY,
      REWARDS_EVENTS_KEY,
      REWARDS_BADGES_KEY,
      REWARDS_CERTIFICATES_KEY,
    ];
    const keysToRemove = [
      ...progressKeys,
      ...rewardLessonKeys,
      ...courseLessonCountKeys,
      ...rewardKeys,
    ];
    if (keysToRemove.length === 0) return;
    await AsyncStorage.multiRemove(keysToRemove);
    console.log(`[LocalUserAPI] Cleared progress/rewards keys (${keysToRemove.length})`);
  }

  // ─── Rewards Tracking ──────────────────────────────────────────────────────

  async markFlashcardsCompleted(
    courseId: string,
    lessonId: string,
  ): Promise<RewardMutationResult> {
    const now = new Date().toISOString();
    const state = await this.loadRewardState();
    const existingEventIds = new Set(state.events.map((event) => event.eventId));
    const lessonMap = await this.getLessonRewardStatusMap(courseId);
    const lesson = lessonMap[lessonId] ?? this.buildLessonRewardStatus(courseId, lessonId, now);

    let xpDelta = 0;
    let masteryDelta = 0;

    if (!lesson.flashcardsCompletedAt) {
      lesson.flashcardsCompletedAt = now;
      xpDelta += 20;
    }

    if (
      lesson.flashcardsCompletedAt &&
      lesson.quizCompletedAt &&
      (lesson.quizScore ?? 0) >= QUIZ_PASS_SCORE &&
      !lesson.masteryAwardedAt
    ) {
      lesson.masteryAwardedAt = now;
      masteryDelta = 15;
      xpDelta += masteryDelta;
    }

    lesson.xpAwarded += xpDelta;
    lesson.updatedAt = now;
    lessonMap[lessonId] = lesson;

    await this.setLessonRewardStatusMap(courseId, lessonMap);

    if (xpDelta > 0) {
      const flashcardsBase = masteryDelta > 0 ? xpDelta - masteryDelta : xpDelta;
      if (flashcardsBase > 0) {
        this.pushEventIfNew(state.events, {
          eventId: `xp:${courseId}:${lessonId}:flashcards`,
          type: 'xp_awarded',
          occurredAt: now,
          courseId,
          lessonId,
          xpDelta: flashcardsBase,
          metadata: { source: 'flashcards' },
        });
      }
      if (masteryDelta > 0) {
        this.pushEventIfNew(state.events, {
          eventId: `xp:${courseId}:${lessonId}:mastery`,
          type: 'xp_awarded',
          occurredAt: now,
          courseId,
          lessonId,
          xpDelta: masteryDelta,
          metadata: { source: 'lesson-mastery' },
        });
      }
      this.applyXpDelta(state.summary, xpDelta, now);
    }

    await this.reconcileBadgesAndCertificates(state, now);
    await this.saveRewardState(state);
    const newEvents = state.events.filter((event) => !existingEventIds.has(event.eventId));

    return this.buildRewardMutationResult({
      xpAwarded: xpDelta,
      masteryAwarded: masteryDelta > 0,
      newEvents,
    });
  }

  async markQuizCompleted(
    courseId: string,
    lessonId: string,
    score: number,
    totalQuestions: number,
  ): Promise<RewardMutationResult> {
    const now = new Date().toISOString();
    const state = await this.loadRewardState();
    const existingEventIds = new Set(state.events.map((event) => event.eventId));
    const quizRewardEventId = `xp:${courseId}:${lessonId}:quiz`;
    const quizXpAlreadyAwarded = existingEventIds.has(quizRewardEventId);
    const lessonMap = await this.getLessonRewardStatusMap(courseId);
    const lesson = lessonMap[lessonId] ?? this.buildLessonRewardStatus(courseId, lessonId, now);

    const firstQuizCompletion = !lesson.quizCompletedAt;
    let xpDelta = 0;
    let masteryDelta = 0;

    lesson.quizScore = maxScore(lesson.quizScore, score);

    if (firstQuizCompletion) {
      lesson.quizCompletedAt = now;
    }

    const highestScore = lesson.quizScore ?? 0;
    const passedQuiz = highestScore >= QUIZ_PASS_SCORE;
    if (passedQuiz && !quizXpAlreadyAwarded) {
      xpDelta += 30;
      if (highestScore === 100) {
        xpDelta += 20;
      } else {
        xpDelta += 10;
      }
    }

    if (
      lesson.flashcardsCompletedAt &&
      lesson.quizCompletedAt &&
      passedQuiz &&
      !lesson.masteryAwardedAt
    ) {
      lesson.masteryAwardedAt = now;
      masteryDelta = 15;
      xpDelta += masteryDelta;
    }

    lesson.xpAwarded += xpDelta;
    lesson.updatedAt = now;
    lessonMap[lessonId] = lesson;
    await this.setLessonRewardStatusMap(courseId, lessonMap);

    if (xpDelta > 0) {
      const quizDelta = masteryDelta > 0 ? xpDelta - masteryDelta : xpDelta;
      if (quizDelta > 0) {
        this.pushEventIfNew(state.events, {
          eventId: quizRewardEventId,
          type: 'xp_awarded',
          occurredAt: now,
          courseId,
          lessonId,
          xpDelta: quizDelta,
          metadata: {
            source: 'quiz',
            score,
            totalQuestions,
          },
        });
      }
      if (masteryDelta > 0) {
        this.pushEventIfNew(state.events, {
          eventId: `xp:${courseId}:${lessonId}:mastery`,
          type: 'xp_awarded',
          occurredAt: now,
          courseId,
          lessonId,
          xpDelta: masteryDelta,
          metadata: { source: 'lesson-mastery' },
        });
      }
      this.applyXpDelta(state.summary, xpDelta, now);
    }

    await this.reconcileBadgesAndCertificates(state, now);
    await this.saveRewardState(state);
    const newEvents = state.events.filter((event) => !existingEventIds.has(event.eventId));

    return this.buildRewardMutationResult({
      xpAwarded: xpDelta,
      masteryAwarded: masteryDelta > 0,
      newEvents,
    });
  }

  async getRewardsSummary(): Promise<RewardsSummary> {
    const state = await this.loadRewardState();
    await this.reconcileBadgesAndCertificates(state, new Date().toISOString());
    await this.saveRewardState(state);
    const summary = { ...state.summary };
    summary.badgesEarned = state.badges.filter((b) => b.earned).length;
    summary.certificatesEarned = state.certificates.length;
    return summary;
  }

  async getRecentRewardEvents(limit: number = 20): Promise<RewardEvent[]> {
    const state = await this.loadRewardState();
    const sorted = [...state.events].sort((a, b) =>
      b.occurredAt.localeCompare(a.occurredAt),
    );
    return sorted.slice(0, Math.max(0, limit));
  }

  async getBadges(): Promise<BadgeProgress[]> {
    const state = await this.loadRewardState();
    await this.reconcileBadgesAndCertificates(state, new Date().toISOString());
    await this.saveRewardState(state);
    return state.badges;
  }

  async getCertificates(): Promise<CertificateRecord[]> {
    const state = await this.loadRewardState();
    await this.reconcileBadgesAndCertificates(state, new Date().toISOString());
    await this.saveRewardState(state);
    return state.certificates;
  }

  // ─── Reward Snapshot Helpers (used by FirebaseUserAPI) ────────────────────

  async getRewardSnapshot(): Promise<RewardState> {
    return this.loadRewardState();
  }

  async setRewardSnapshot(state: Partial<RewardState>): Promise<void> {
    const current = await this.loadRewardState();
    const next: RewardState = {
      summary: state.summary ?? current.summary,
      events: state.events ?? current.events,
      badges: state.badges ?? current.badges,
      certificates: state.certificates ?? current.certificates,
    };
    await this.saveRewardState(next);
  }

  async getLessonRewardStatusMap(courseId: string): Promise<LessonRewardStatusMap> {
    return this.readLessonRewardMap(courseId);
  }

  async setLessonRewardStatusMap(
    courseId: string,
    map: LessonRewardStatusMap,
  ): Promise<void> {
    await this.writeLessonRewardMap(courseId, map);
  }

  // ─── Private helpers: Reward writes ───────────────────────────────────────

  private async loadRewardState(): Promise<RewardState> {
    const [summary, events, badges, certificates] = await Promise.all([
      this.readJson<RewardsSummary>(REWARDS_SUMMARY_KEY, buildSummary(0)),
      this.readJson<RewardEvent[]>(REWARDS_EVENTS_KEY, []),
      this.readJson<BadgeProgress[]>(REWARDS_BADGES_KEY, []),
      this.readJson<CertificateRecord[]>(REWARDS_CERTIFICATES_KEY, []),
    ]);
    return { summary, events, badges, certificates };
  }

  private async saveRewardState(state: RewardState): Promise<void> {
    state.events.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    state.badges.sort((a, b) => a.badgeId.localeCompare(b.badgeId));
    state.certificates.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));

    state.summary.badgesEarned = state.badges.filter((b) => b.earned).length;
    state.summary.certificatesEarned = state.certificates.length;

    await Promise.all([
      this.writeJson(REWARDS_SUMMARY_KEY, state.summary),
      this.writeJson(REWARDS_EVENTS_KEY, state.events),
      this.writeJson(REWARDS_BADGES_KEY, state.badges),
      this.writeJson(REWARDS_CERTIFICATES_KEY, state.certificates),
    ]);
  }

  private async reconcileBadgesAndCertificates(
    state: RewardState,
    now: string,
  ): Promise<void> {
    const lessonMapsByCourse = await this.readAllLessonRewardMaps();
    const metrics = await this.computeRewardMetrics(lessonMapsByCourse);
    const badgeMap = new Map(state.badges.map((b) => [b.badgeId, b]));

    const nextBadges: BadgeProgress[] = BADGE_DEFINITIONS.map((definition) => {
      const rawProgress = Number(metrics[definition.metricKey] ?? 0);
      const existing = badgeMap.get(definition.badgeId);
      const earned = existing?.earned || rawProgress >= definition.target;
      const earnedAt = existing?.earnedAt ?? (earned ? now : undefined);

      if (earned && !existing?.earned) {
        this.pushEventIfNew(state.events, {
          eventId: `badge:${definition.badgeId}`,
          type: 'badge_earned',
          occurredAt: now,
          badgeId: definition.badgeId,
        });
      }

      return {
        badgeId: definition.badgeId,
        title: definition.title,
        description: definition.description,
        target: definition.target,
        progress: rawProgress,
        earned,
        earnedAt,
      };
    });

    const certificateMap = new Map(
      state.certificates.map((c) => [c.certificateId, c]),
    );
    for (const completedCourse of metrics.completedCourses) {
      const certificateId = `cert:${completedCourse.courseId}`;
      if (certificateMap.has(certificateId)) continue;
      const cert: CertificateRecord = {
        certificateId,
        courseId: completedCourse.courseId,
        courseTitle: completedCourse.courseId,
        issuedAt: now,
        lessonsCompleted: completedCourse.lessonsCompleted,
        averageQuizScore: completedCourse.averageQuizScore,
      };
      certificateMap.set(certificateId, cert);
      this.pushEventIfNew(state.events, {
        eventId: `event:${certificateId}`,
        type: 'certificate_issued',
        occurredAt: now,
        certificateId,
        courseId: completedCourse.courseId,
      });
    }

    state.badges = nextBadges;
    state.certificates = Array.from(certificateMap.values());
    state.summary.badgesEarned = state.badges.filter((b) => b.earned).length;
    state.summary.certificatesEarned = state.certificates.length;
    state.summary.updatedAt = now;
  }

  private pushEventIfNew(events: RewardEvent[], event: RewardEvent): boolean {
    if (events.some((e) => e.eventId === event.eventId)) {
      return false;
    }
    events.push(event);
    return true;
  }

  private buildRewardMutationResult({
    xpAwarded,
    masteryAwarded,
    newEvents,
  }: {
    xpAwarded: number;
    masteryAwarded: boolean;
    newEvents: RewardEvent[];
  }): RewardMutationResult {
    if (newEvents.length === 0 && xpAwarded <= 0) {
      return emptyRewardMutationResult();
    }

    const badgeIdsEarned = Array.from(
      new Set(
        newEvents
          .filter((event) => event.type === 'badge_earned')
          .map((event) => event.badgeId)
          .filter((badgeId): badgeId is string => typeof badgeId === 'string'),
      ),
    );

    const certificateIdsIssued = Array.from(
      new Set(
        newEvents
          .filter((event) => event.type === 'certificate_issued')
          .map((event) => event.certificateId)
          .filter(
            (certificateId): certificateId is string =>
              typeof certificateId === 'string',
          ),
      ),
    );

    return {
      xpAwarded: Math.max(0, xpAwarded),
      masteryAwarded,
      badgeIdsEarned,
      certificateIdsIssued,
    };
  }

  private applyXpDelta(summary: RewardsSummary, xpDelta: number, now: string): void {
    const totalXp = Math.max(0, (summary.totalXp ?? 0) + xpDelta);
    const leveled = buildSummary(totalXp, now);
    summary.totalXp = leveled.totalXp;
    summary.level = leveled.level;
    summary.currentLevelXp = leveled.currentLevelXp;
    summary.nextLevelXp = leveled.nextLevelXp;
    summary.updatedAt = now;
  }

  private buildLessonRewardStatus(
    courseId: string,
    lessonId: string,
    now: string,
  ): LessonRewardStatus {
    return {
      lessonId,
      courseId,
      xpAwarded: 0,
      updatedAt: now,
    };
  }

  private async computeRewardMetrics(
    lessonMapsByCourse: Record<string, LessonRewardStatusMap>,
  ): Promise<RewardMetrics> {
    let flashcardsCompletedCount = 0;
    let quizzesCompletedCount = 0;
    let perfectQuizCount = 0;
    let lessonsMasteredCount = 0;

    for (const map of Object.values(lessonMapsByCourse)) {
      for (const status of Object.values(map)) {
        if (status.flashcardsCompletedAt) flashcardsCompletedCount++;
        if (status.quizCompletedAt) quizzesCompletedCount++;
        if ((status.quizScore ?? 0) >= 100) perfectQuizCount++;
        if (status.masteryAwardedAt) lessonsMasteredCount++;
      }
    }

    const progressKeys = await AsyncStorage.getAllKeys();
    const courseProgressKeys = progressKeys.filter((k) => k.startsWith(PROGRESS_PREFIX));
    let lessonsCompletedCount = 0;
    let courseFinisherCount = 0;
    const completionCountsByDay: Record<string, number> = {};
    const completedCourses: CompletedCourseMetric[] = [];

    for (const key of courseProgressKeys) {
      const courseId = key.slice(PROGRESS_PREFIX.length);
      const courseMap = await this.readProgressMap(courseId);
      const statuses = Object.values(courseMap);
      if (statuses.length === 0) continue;
      const expectedLessonCount = await this.readCourseLessonCount(courseId);

      let completedInCourse = 0;
      for (const status of statuses) {
        if (status.state !== 'completed') continue;
        lessonsCompletedCount++;
        completedInCourse++;
        if (status.completedAt) {
          const day = status.completedAt.slice(0, 10);
          completionCountsByDay[day] = (completionCountsByDay[day] ?? 0) + 1;
        }
      }

      const totalLessonsForCourse = expectedLessonCount ?? 0;
      const allCompleted =
        totalLessonsForCourse > 0 && completedInCourse >= totalLessonsForCourse;
      if (allCompleted) {
        courseFinisherCount++;
        const lessonMap = lessonMapsByCourse[courseId] ?? {};
        const quizScores = Object.values(lessonMap)
          .map((s) => s.quizScore)
          .filter((score): score is number => typeof score === 'number');
        const averageQuizScore = quizScores.length
          ? Math.round(
              quizScores.reduce((sum, score) => sum + score, 0) / quizScores.length,
            )
          : undefined;

        completedCourses.push({
          courseId,
          lessonsCompleted: totalLessonsForCourse,
          averageQuizScore,
        });
      }
    }

    const onARollCount = Object.values(completionCountsByDay).some((count) => count >= 3)
      ? 1
      : 0;

    return {
      flashcardsCompletedCount,
      quizzesCompletedCount,
      perfectQuizCount,
      lessonsMasteredCount,
      lessonsCompletedCount,
      onARollCount,
      courseFinisherCount,
      completedCourses,
    };
  }

  private async readAllLessonRewardMaps(): Promise<Record<string, LessonRewardStatusMap>> {
    const keys = await AsyncStorage.getAllKeys();
    const lessonKeys = keys.filter((k) => k.startsWith(REWARDS_LESSON_PREFIX));
    const maps: Record<string, LessonRewardStatusMap> = {};
    for (const key of lessonKeys) {
      const courseId = key.slice(REWARDS_LESSON_PREFIX.length);
      maps[courseId] = await this.readLessonRewardMap(courseId);
    }
    return maps;
  }

  // ─── Private helpers: Progress storage ────────────────────────────────────

  private async readProgressMap(courseId: string): Promise<LessonStatusMap> {
    const raw = await AsyncStorage.getItem(`${PROGRESS_PREFIX}${courseId}`);
    if (!raw) return {};
    try {
      return JSON.parse(raw) as LessonStatusMap;
    } catch {
      return {};
    }
  }

  private async writeProgressMap(courseId: string, map: LessonStatusMap): Promise<void> {
    await AsyncStorage.setItem(
      `${PROGRESS_PREFIX}${courseId}`,
      JSON.stringify(map),
    );
  }

  async recordCourseLessonCount(courseId: string, totalLessons: number): Promise<void> {
    if (!Number.isFinite(totalLessons) || totalLessons <= 0) return;
    const key = `${COURSE_LESSON_COUNT_PREFIX}${courseId}`;
    await AsyncStorage.setItem(key, String(Math.floor(totalLessons)));
  }

  // ─── Private helpers: Reward storage ──────────────────────────────────────

  private async readLessonRewardMap(courseId: string): Promise<LessonRewardStatusMap> {
    return this.readJson<LessonRewardStatusMap>(`${REWARDS_LESSON_PREFIX}${courseId}`, {});
  }

  private async readCourseLessonCount(courseId: string): Promise<number | undefined> {
    const raw = await AsyncStorage.getItem(`${COURSE_LESSON_COUNT_PREFIX}${courseId}`);
    if (!raw) return undefined;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return Math.floor(parsed);
  }

  private async writeLessonRewardMap(
    courseId: string,
    map: LessonRewardStatusMap,
  ): Promise<void> {
    await this.writeJson(`${REWARDS_LESSON_PREFIX}${courseId}`, map);
  }

  private async readJson<T>(key: string, fallback: T): Promise<T> {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }
}
