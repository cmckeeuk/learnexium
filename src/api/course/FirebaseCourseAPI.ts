import { CourseAPI, CourseSummary, CourseDetail } from './CourseAPI';
import {
  getJsonWithOfflineCache,
  readJsonCache,
  writeJsonCache,
} from '../../utils/offlineJsonCache';

const STORAGE_BASE = 'https://storage.googleapis.com/smiling-memory-427311-h3.firebasestorage.app';
const COURSE_SUMMARIES_CACHE_KEY = 'courses:summaries';
const courseSummaryCacheKey = (courseId: string) => `courses:summary:${courseId}`;
const courseDetailCacheKey = (courseId: string) => `courses:detail:${courseId}`;

export class FirebaseCourseAPI implements CourseAPI {
  private async fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${STORAGE_BASE}/${path}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${path}: ${response.status}`);
    }
    return await response.json();
  }

  private async fetchCourseSummariesFromNetwork(): Promise<CourseSummary[]> {
    const index = await this.fetchJson<{ courses?: string[] }>('courses/index.json');
    const courseIds = index.courses || [];
    if (courseIds.length === 0) return [];

    const summaries = await Promise.all(
      courseIds.map(async (courseId) => {
        const key = courseSummaryCacheKey(courseId);
        try {
          const summary = await this.fetchJson<CourseSummary>(`courses/${courseId}/course-summary.json`);
          await writeJsonCache(key, summary);
          return summary;
        } catch (error) {
          const cached = await readJsonCache<CourseSummary>(key);
          if (cached) return cached;
          console.warn(`Failed to fetch summary for ${courseId}:`, error);
          return null;
        }
      }),
    );

    const filtered = summaries.filter(Boolean) as CourseSummary[];
    return filtered.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  async getCourseSummaries(): Promise<CourseSummary[]> {
    try {
      return await getJsonWithOfflineCache(
        COURSE_SUMMARIES_CACHE_KEY,
        () => this.fetchCourseSummariesFromNetwork(),
      );
    } catch (error) {
      console.error('Error loading Firebase course summaries:', error);
      throw error;
    }
  }

  async getCourseSummary(courseId: string): Promise<CourseSummary> {
    try {
      return await getJsonWithOfflineCache(
        courseSummaryCacheKey(courseId),
        () => this.fetchJson<CourseSummary>(`courses/${courseId}/course-summary.json`),
      );
    } catch (error) {
      console.error(`Error loading course summary ${courseId}:`, error);
      throw error;
    }
  }

  async getCourseDetail(courseId: string): Promise<CourseDetail> {
    try {
      return await getJsonWithOfflineCache(
        courseDetailCacheKey(courseId),
        () => this.fetchJson<CourseDetail>(`courses/${courseId}/course-detail.json`),
      );
    } catch (error) {
      console.error(`Error loading course detail ${courseId}:`, error);
      throw error;
    }
  }
}
