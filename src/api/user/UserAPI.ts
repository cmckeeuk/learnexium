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
}
