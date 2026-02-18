/**
 * Tests for detectHeadingLevel(), isYouTubeUrl(), extractYouTubeId(),
 * marker detectors, isLessonHeading(), and buildCourseSummary/Detail.
 *
 * These are all pure functions — no Firebase or API dependencies.
 */

import {
  detectHeadingLevel,
  isYouTubeUrl,
  extractYouTubeId,
  isCalloutMarker,
  isFlashcardMarker,
  getQuizMarkerType,
  isLessonHeading,
  buildCourseSummary,
  buildCourseDetail,
  enforceInteractiveBlockConstraints,
  buildSpansFromGDocs,
  parseLessonMetadata,
  NormalizedParagraph,
} from '../src/parseGoogleDoc';

// ─── detectHeadingLevel ─────────────────────────────────────────────────────

describe('detectHeadingLevel', () => {
  it('returns 1 for HEADING_1', () => {
    expect(detectHeadingLevel('HEADING_1', 'Title')).toBe(1);
  });

  it('returns 2 for HEADING_2', () => {
    expect(detectHeadingLevel('HEADING_2', 'Section')).toBe(2);
  });

  it('returns 3 for HEADING_3', () => {
    expect(detectHeadingLevel('HEADING_3', 'Sub')).toBe(3);
  });

  it('falls back to markdown # when NORMAL_TEXT', () => {
    expect(detectHeadingLevel('NORMAL_TEXT', '# Title')).toBe(1);
    expect(detectHeadingLevel('NORMAL_TEXT', '## Section')).toBe(2);
    expect(detectHeadingLevel('NORMAL_TEXT', '### Sub')).toBe(3);
    expect(detectHeadingLevel('NORMAL_TEXT', '#### Deep')).toBe(4);
  });

  it('GDocs style wins over markdown prefix', () => {
    // GDocs says HEADING_2, but text starts with "###"
    expect(detectHeadingLevel('HEADING_2', '### Conflict')).toBe(2);
  });

  it('returns 0 for normal text', () => {
    expect(detectHeadingLevel('NORMAL_TEXT', 'Just text')).toBe(0);
  });

  it('returns 0 for # not followed by space', () => {
    // "#hashtag" should NOT be a heading
    expect(detectHeadingLevel('NORMAL_TEXT', '#hashtag')).toBe(0);
  });
});

// ─── isYouTubeUrl ───────────────────────────────────────────────────────────

describe('isYouTubeUrl', () => {
  it('matches youtube.com/watch?v=', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  it('matches youtu.be/ short links', () => {
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  it('matches without www', () => {
    expect(isYouTubeUrl('https://youtube.com/watch?v=abc123')).toBe(true);
  });

  it('matches http (not just https)', () => {
    expect(isYouTubeUrl('http://youtube.com/watch?v=abc123')).toBe(true);
  });

  it('rejects non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://vimeo.com/12345')).toBe(false);
    expect(isYouTubeUrl('https://google.com')).toBe(false);
    expect(isYouTubeUrl('not a url')).toBe(false);
  });
});

// ─── extractYouTubeId ───────────────────────────────────────────────────────

describe('extractYouTubeId', () => {
  it('extracts from youtube.com/watch?v=ID', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('extracts from youtu.be/ID', () => {
    expect(extractYouTubeId('https://youtu.be/abc123XYZ')).toBe('abc123XYZ');
  });

  it('extracts from embed URL', () => {
    expect(extractYouTubeId('https://youtube.com/embed/abc123XYZ')).toBe('abc123XYZ');
  });

  it('strips extra query params', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for non-YouTube URL', () => {
    expect(extractYouTubeId('https://vimeo.com/12345')).toBeNull();
  });
});

// ─── Marker Detectors ───────────────────────────────────────────────────────

describe('isCalloutMarker', () => {
  it('matches [CALLOUT]', () => {
    expect(isCalloutMarker('[CALLOUT]')).toBe(true);
  });

  it('rejects lowercase', () => {
    expect(isCalloutMarker('[callout]')).toBe(false);
  });

  it('rejects text with callout in it', () => {
    expect(isCalloutMarker('This is [CALLOUT] text')).toBe(false);
  });
});

describe('isFlashcardMarker', () => {
  it('matches [FLASHCARD]', () => {
    expect(isFlashcardMarker('[FLASHCARD]')).toBe(true);
  });

  it('rejects partial match', () => {
    expect(isFlashcardMarker('[FLASHCARD] extra')).toBe(false);
  });
});

describe('getQuizMarkerType', () => {
  it('returns mcq for [QUIZ_CHOICE]', () => {
    expect(getQuizMarkerType('[QUIZ_CHOICE]')).toBe('mcq');
  });

  it('returns true_false for [QUIZ_TRUE_FALSE]', () => {
    expect(getQuizMarkerType('[QUIZ_TRUE_FALSE]')).toBe('true_false');
  });

  it('returns short_answer for [QUIZ_SHORT_ANSWER]', () => {
    expect(getQuizMarkerType('[QUIZ_SHORT_ANSWER]')).toBe('short_answer');
  });

  it('returns null for unknown markers', () => {
    expect(getQuizMarkerType('[QUIZ_ESSAY]')).toBeNull();
    expect(getQuizMarkerType('plain text')).toBeNull();
  });
});

// ─── isLessonHeading ────────────────────────────────────────────────────────

describe('isLessonHeading', () => {
  function makePara(text: string, headingLevel: number): NormalizedParagraph {
    return {
      headingLevel,
      plainText: text,
      richText: [{ text, bold: false, italic: false }],
      isBullet: false,
      hasImage: false,
    };
  }

  it('matches "Lesson - Title" at H1', () => {
    expect(isLessonHeading(makePara('Lesson - What is Biology', 1))).toBe(true);
  });

  it('matches "Lesson – Title" with en-dash at H1', () => {
    expect(isLessonHeading(makePara('Lesson – Cell Structure', 1))).toBe(true);
  });

  it('is case-insensitive for "Lesson"', () => {
    expect(isLessonHeading(makePara('lesson - intro', 1))).toBe(true);
  });

  it('rejects H2 even with Lesson prefix', () => {
    expect(isLessonHeading(makePara('Lesson - Something', 2))).toBe(false);
  });

  it('rejects H1 without Lesson prefix', () => {
    expect(isLessonHeading(makePara('Course Summary', 1))).toBe(false);
  });
});

// ─── buildSpansFromGDocs ────────────────────────────────────────────────────

describe('buildSpansFromGDocs', () => {
  it('builds spans from multiple runs', () => {
    const runs = [
      { text: 'Hello ', style: {} },
      { text: 'world', style: { bold: true } },
    ];
    const result = buildSpansFromGDocs(runs);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ text: 'Hello ', bold: false, italic: false });
    expect(result[1]).toMatchObject({ text: 'world', bold: true, italic: false });
  });

  it('handles links', () => {
    const runs = [
      { text: 'Click ', style: {} },
      { text: 'here', style: { link: { url: 'https://example.com' } } },
    ];
    const result = buildSpansFromGDocs(runs);
    expect(result[1]).toEqual(
      expect.objectContaining({ text: 'here', link: 'https://example.com' }),
    );
  });

  it('skips whitespace-only runs', () => {
    const runs = [
      { text: '  \n  ', style: {} },
      { text: 'content', style: {} },
    ];
    const result = buildSpansFromGDocs(runs);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('content');
  });
});

// ─── parseLessonMetadata ────────────────────────────────────────────────────

describe('parseLessonMetadata', () => {
  function makePara(text: string): NormalizedParagraph {
    return {
      headingLevel: 0,
      plainText: text,
      richText: [{ text, bold: false, italic: false }],
      isBullet: false,
      hasImage: false,
    };
  }

  it('parses Summary, Duration, and Premium', () => {
    const lesson: any = {};
    const paragraphs = [
      makePara('Summary: Learn the basics'),
      makePara('Duration (minutes): 15'),
      makePara('Premium: yes'),
    ];

    const consumed = parseLessonMetadata(lesson, paragraphs, 0);
    expect(consumed).toBe(3);
    expect(lesson.summary).toBe('Learn the basics');
    expect(lesson.estimatedDurationMinutes).toBe(15);
    expect(lesson.premium).toBe(true);
  });

  it('parses Premium: no correctly', () => {
    const lesson: any = {};
    const paragraphs = [makePara('Premium: no')];

    parseLessonMetadata(lesson, paragraphs, 0);
    expect(lesson.premium).toBe(false);
  });

  it('stops at non-metadata content', () => {
    const lesson: any = {};
    const paragraphs = [
      makePara('Summary: Intro'),
      makePara('This is regular text, not a key:value'),
    ];

    const consumed = parseLessonMetadata(lesson, paragraphs, 0);
    expect(consumed).toBe(1);
    expect(lesson.summary).toBe('Intro');
  });

  it('stops at headings', () => {
    const lesson: any = {};
    const heading: NormalizedParagraph = {
      headingLevel: 2,
      plainText: 'Welcome',
      richText: [{ text: 'Welcome', bold: false, italic: false }],
      isBullet: false,
      hasImage: false,
    };
    const paragraphs = [makePara('Summary: Intro'), heading];

    const consumed = parseLessonMetadata(lesson, paragraphs, 0);
    expect(consumed).toBe(1);
  });

  it('handles startIndex offset', () => {
    const lesson: any = {};
    const paragraphs = [
      makePara('Ignore this'),
      makePara('Summary: From offset'),
      makePara('Duration (minutes): 20'),
    ];

    const consumed = parseLessonMetadata(lesson, paragraphs, 1);
    expect(consumed).toBe(2);
    expect(lesson.summary).toBe('From offset');
    expect(lesson.estimatedDurationMinutes).toBe(20);
  });
});

// ─── buildCourseSummary ─────────────────────────────────────────────────────

describe('buildCourseSummary', () => {
  const metadata = {
    courseId: 'bio-101',
    title: 'Biology 101',
    subtitle: 'Learn the basics',
    description: 'A beginner course.',
    authorName: 'Dr. Patel',
    authorOrganization: 'Lab',
    authorBio: 'Expert',
    authorAvatarUrl: 'https://example.com/avatar.png',
    thumbnailUrl: 'https://example.com/thumb.png',
    releaseDate: '2026-01-01',
    language: 'en',
    difficulty: 'beginner',
    estimatedDurationMinutes: 90,
    tags: ['biology', 'science'],
    premium: true,
  };

  const lessons = [
    { lessonId: 'lesson-01', title: 'Intro', premium: false, estimatedDurationMinutes: 10 },
    { lessonId: 'lesson-02', title: 'Cells', premium: true, estimatedDurationMinutes: 15 },
  ];

  it('maps metadata fields correctly', () => {
    const summary = buildCourseSummary(metadata, lessons);
    expect(summary.courseId).toBe('bio-101');
    expect(summary.title).toBe('Biology 101');
    expect(summary.author.name).toBe('Dr. Patel');
    expect(summary.language).toBe('en');
    expect(summary.difficulty).toBe('beginner');
    expect(summary.tags).toEqual(['biology', 'science']);
    expect(summary.premium).toBe(true);
  });

  it('counts lessons', () => {
    const summary = buildCourseSummary(metadata, lessons);
    expect(summary.lessonCount).toBe(2);
  });

  it('identifies free preview lessons (non-premium)', () => {
    const summary = buildCourseSummary(metadata, lessons);
    expect(summary.freePreviewLessons).toEqual(['lesson-01']);
  });

  it('formats release date with time suffix', () => {
    const summary = buildCourseSummary(metadata, lessons);
    expect(summary.releaseDate).toBe('2026-01-01T00:00:00Z');
  });

  it('sets lastUpdated to current time', () => {
    const summary = buildCourseSummary(metadata, lessons);
    expect(summary.lastUpdated).toBeDefined();
    // Should be a valid ISO date string
    expect(() => new Date(summary.lastUpdated)).not.toThrow();
  });
});

// ─── buildCourseDetail ──────────────────────────────────────────────────────

describe('buildCourseDetail', () => {
  it('extracts _quizQuestions into top-level quizzes array', () => {
    const metadata = { courseId: 'bio-101' };
    const lessons = [
      {
        lessonId: 'lesson-01',
        title: 'Intro',
        blocks: [],
        _quizQuestions: [
          { questionId: 'q1', type: 'mcq', prompt: 'What is biology?' },
        ],
      },
    ];

    const detail = buildCourseDetail(metadata, lessons);
    expect(detail.quizzes).toHaveLength(1);
    expect(detail.quizzes[0].quizId).toBe('quiz-lesson-01');
    expect(detail.quizzes[0].questions).toHaveLength(1);
    expect(detail.quizzes[0].questions[0].prompt).toBe('What is biology?');
  });

  it('removes _quizQuestions from lesson objects', () => {
    const metadata = { courseId: 'bio-101' };
    const lessons = [
      {
        lessonId: 'lesson-01',
        title: 'Intro',
        blocks: [],
        _quizQuestions: [{ questionId: 'q1' }],
      },
    ];

    const detail = buildCourseDetail(metadata, lessons);
    expect(detail.lessons[0]._quizQuestions).toBeUndefined();
  });

  it('handles lessons with no quizzes', () => {
    const metadata = { courseId: 'bio-101' };
    const lessons = [
      { lessonId: 'lesson-01', title: 'Intro', blocks: [] },
    ];

    const detail = buildCourseDetail(metadata, lessons);
    expect(detail.quizzes).toHaveLength(0);
    expect(detail.lessons).toHaveLength(1);
  });
});

// ─── enforceInteractiveBlockConstraints ─────────────────────────────────────

describe('enforceInteractiveBlockConstraints', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('merges multiple flashcards blocks into one while preserving card order', () => {
    const blocks = [
      { id: 'b1', type: 'text', content: [{ text: 'Intro' }] },
      {
        id: 'b2',
        type: 'flashcards',
        cards: [{ front: 'A', back: 'a' }],
      },
      { id: 'b3', type: 'heading', level: 2, text: 'Break' },
      {
        id: 'b4',
        type: 'flashcards',
        cards: [{ front: 'B', back: 'b' }],
      },
    ];

    const constrained = enforceInteractiveBlockConstraints(
      'course-lesson-1',
      'Lesson One',
      blocks,
    );
    const flashcards = constrained.filter((b: any) => b.type === 'flashcards');

    expect(flashcards).toHaveLength(1);
    expect(flashcards[0].cards).toEqual([
      { front: 'A', back: 'a' },
      { front: 'B', back: 'b' },
    ]);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('keeps one quiz block and normalizes quizId to lesson-based value', () => {
    const blocks = [
      { id: 'b1', type: 'text', content: [{ text: 'Intro' }] },
      { id: 'b2', type: 'quiz', quizId: 'old-quiz-id' },
      { id: 'b3', type: 'text', content: [{ text: 'Outro' }] },
      { id: 'b4', type: 'quiz', quizId: 'another-quiz-id' },
    ];

    const constrained = enforceInteractiveBlockConstraints(
      'course-lesson-2',
      'Lesson Two',
      blocks,
    );
    const quizBlocks = constrained.filter((b: any) => b.type === 'quiz');

    expect(quizBlocks).toHaveLength(1);
    expect(quizBlocks[0].quizId).toBe('quiz-course-lesson-2');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('leaves blocks unchanged when constraints are already satisfied', () => {
    const blocks = [
      { id: 'b1', type: 'heading', level: 2, text: 'Section' },
      {
        id: 'b2',
        type: 'flashcards',
        cards: [{ front: 'Only', back: 'One' }],
      },
      { id: 'b3', type: 'quiz', quizId: 'quiz-course-lesson-3' },
    ];

    const constrained = enforceInteractiveBlockConstraints(
      'course-lesson-3',
      'Lesson Three',
      blocks,
    );

    expect(constrained).toHaveLength(3);
    expect(constrained[1].type).toBe('flashcards');
    expect(constrained[2].type).toBe('quiz');
    expect(constrained[2].quizId).toBe('quiz-course-lesson-3');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
