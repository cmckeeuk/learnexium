import { CourseAPI, CourseDetail, CourseSummary, ContentBlock, ImageBlock } from './CourseAPI';
import coursesIndexJson from '../../content/local/courses/index.json';
import testCourseSummaryJson from '../../content/local/courses/test-course/course-summary.json';
import testCourseDetailJson from '../../content/local/courses/test-course/course-detail.json';
import { resolveLocalImageToken } from '../../content/local/localImageRegistry';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resolveSummaryImages(summary: CourseSummary): CourseSummary {
  return {
    ...summary,
    thumbnailUrl: resolveLocalImageToken(summary.thumbnailUrl) ?? summary.thumbnailUrl,
    author: {
      ...summary.author,
      avatarUrl: resolveLocalImageToken(summary.author.avatarUrl) ?? summary.author.avatarUrl,
    },
  };
}

function resolveDetailImages(detail: CourseDetail): CourseDetail {
  const lessons = detail.lessons.map((lesson) => {
    const blocks = lesson.blocks.map((block) => {
      if (block.type !== 'image') return block;
      const imageBlock = block as ImageBlock;
      const resolvedSrc = resolveLocalImageToken(imageBlock.src) ?? imageBlock.src;
      return {
        ...imageBlock,
        src: resolvedSrc,
      } as ContentBlock;
    });

    return {
      ...lesson,
      blocks,
    };
  });

  return {
    ...detail,
    lessons,
  };
}

const SUMMARY_BY_ID: Record<string, CourseSummary> = {
  'test-course': testCourseSummaryJson as CourseSummary,
};

const DETAIL_BY_ID: Record<string, CourseDetail> = {
  'test-course': testCourseDetailJson as CourseDetail,
};

export class LocalCourseAPI implements CourseAPI {
  async getCourseSummaries(): Promise<CourseSummary[]> {
    const ids = (coursesIndexJson as { courses?: string[] }).courses ?? [];
    const summaries = ids
      .map((courseId) => SUMMARY_BY_ID[courseId])
      .filter(Boolean)
      .map((summary) => resolveSummaryImages(clone(summary)));

    return summaries.sort((a, b) => (a.order || 999) - (b.order || 999));
  }

  async getCourseSummary(courseId: string): Promise<CourseSummary> {
    const summary = SUMMARY_BY_ID[courseId];
    if (!summary) {
      throw new Error(`Local summary not found for courseId: ${courseId}`);
    }
    return resolveSummaryImages(clone(summary));
  }

  async getCourseDetail(courseId: string): Promise<CourseDetail> {
    const detail = DETAIL_BY_ID[courseId];
    if (!detail) {
      throw new Error(`Local detail not found for courseId: ${courseId}`);
    }
    return resolveDetailImages(clone(detail));
  }
}
