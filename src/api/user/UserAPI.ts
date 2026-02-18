export interface PremiumStatus {
  isPremium: boolean;
  subscriptionType?: 'monthly' | 'yearly';
  expiresAt?: string;
  trialActive?: boolean;
}

// ─── Progress Types ──────────────────────────────────────────────────────────

export type LessonState = 'not-started' | 'in-progress' | 'completed';

export interface LessonStatus {
  lessonId: string;
  courseId: string;
  state: LessonState;
  firstOpenedAt: string;
  lastAccessedAt: string;
  completedAt?: string;
}

export interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  completionPercentage: number;
  lastAccessedAt?: string;
  currentLessonId?: string;
  completedLessonIds: string[];
}

// ─── Rewards Types ───────────────────────────────────────────────────────────

export type RewardEventType = 'xp_awarded' | 'badge_earned' | 'certificate_issued';

export interface RewardEvent {
  eventId: string;
  type: RewardEventType;
  occurredAt: string;
  courseId?: string;
  lessonId?: string;
  badgeId?: string;
  certificateId?: string;
  xpDelta?: number;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface BadgeProgress {
  badgeId: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  earned: boolean;
  earnedAt?: string;
}

export interface CertificateRecord {
  certificateId: string;
  courseId: string;
  courseTitle: string;
  issuedAt: string;
  lessonsCompleted?: number;
  averageQuizScore?: number;
}

export interface LessonRewardStatus {
  lessonId: string;
  courseId: string;
  flashcardsCompletedAt?: string;
  quizCompletedAt?: string;
  quizScore?: number;
  xpAwarded: number;
  masteryAwardedAt?: string;
  updatedAt: string;
}

export interface RewardsSummary {
  totalXp: number;
  level: number;
  currentLevelXp: number;
  nextLevelXp: number;
  badgesEarned: number;
  certificatesEarned: number;
  updatedAt?: string;
}

export interface RewardMutationResult {
  xpAwarded: number;
  masteryAwarded: boolean;
  badgeIdsEarned: string[];
  certificateIdsIssued: string[];
}

// ─── API Interface ───────────────────────────────────────────────────────────

export interface UserAPI {
  // Premium status
  isPremium(): Promise<boolean>;
  getPremiumStatus(): Promise<PremiumStatus>;
  
  // Access control
  canAccessLesson(courseId: string, lessonId: string, lessonIsPremium: boolean): Promise<boolean>;
  
  // Mock upgrade (real implementation later with Firebase Auth + IAP)
  upgradeToPremium(): Promise<void>;

  // Progress tracking
  markLessonOpened(courseId: string, lessonId: string): Promise<void>;
  markLessonCompleted(courseId: string, lessonId: string): Promise<void>;
  getLessonStatus(courseId: string, lessonId: string): Promise<LessonStatus | null>;
  getCourseProgress(courseId: string, totalLessons: number): Promise<CourseProgress>;
  getAllCourseProgress(): Promise<CourseProgress[]>;
  clearAllProgress(): Promise<void>;

  // Rewards tracking
  markFlashcardsCompleted(
    courseId: string,
    lessonId: string,
  ): Promise<RewardMutationResult>;
  markQuizCompleted(
    courseId: string,
    lessonId: string,
    score: number,
    totalQuestions: number,
  ): Promise<RewardMutationResult>;
  getRewardsSummary(): Promise<RewardsSummary>;
  getRecentRewardEvents(limit?: number): Promise<RewardEvent[]>;
  getBadges(): Promise<BadgeProgress[]>;
  getCertificates(): Promise<CertificateRecord[]>;
}
