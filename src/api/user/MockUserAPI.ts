import { UserAPI, PremiumStatus, LessonStatus, CourseProgress } from './UserAPI';

export class MockUserAPI implements UserAPI {
  private premium: boolean = false;

  async isPremium(): Promise<boolean> {
    return this.premium;
  }

  async getPremiumStatus(): Promise<PremiumStatus> {
    return {
      isPremium: this.premium,
      subscriptionType: this.premium ? 'monthly' : undefined,
      trialActive: false,
    };
  }

  async canAccessLesson(
    courseId: string,
    lessonId: string,
    lessonIsPremium: boolean
  ): Promise<boolean> {
    // Free lessons are always accessible
    if (!lessonIsPremium) {
      return true;
    }
    
    // Premium lessons require premium status
    return this.premium;
  }

  async upgradeToPremium(): Promise<void> {
    // Mock upgrade - just toggle the flag for testing
    console.log('[MockUserAPI] Upgrading to premium...');
    this.premium = true;
  }

  // ─── Progress (no-ops for mock) ────────────────────────────────────────────

  async markLessonOpened(_courseId: string, _lessonId: string): Promise<void> {}
  async markLessonCompleted(_courseId: string, _lessonId: string): Promise<void> {}
  async getLessonStatus(_courseId: string, _lessonId: string): Promise<LessonStatus | null> {
    return null;
  }
  async getCourseProgress(courseId: string, totalLessons: number): Promise<CourseProgress> {
    return {
      courseId,
      totalLessons,
      completedCount: 0,
      inProgressCount: 0,
      notStartedCount: totalLessons,
      completionPercentage: 0,
      completedLessonIds: [],
    };
  }
  async getAllCourseProgress(): Promise<CourseProgress[]> {
    return [];
  }
  async clearAllProgress(): Promise<void> {}
}
