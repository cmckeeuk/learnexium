export interface CourseSummary {
  courseId: string;
  title: string;
  subtitle: string;
  description: string;
  author: {
    name: string;
    organization: string;
    bio: string;
    avatarUrl: string | number;
  };
  thumbnailUrl: string | number;
  thumbnailVersion?: number | string;
  thumbnailHash?: string;
  releaseDate: string;
  lastUpdated: string;
  language: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedDurationMinutes: number;
  tags: string[];
  premium: boolean;
  freePreviewLessons: string[];
  lessonCount: number;
  order: number;
}

// Block Types
export type BlockType = 'heading' | 'text' | 'image' | 'video' | 'callout' | 'list' | 'quiz' | 'flashcards';

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  level: 1 | 2 | 3;
  text: string;
}

export interface TextSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  link?: string;
  code?: boolean;
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  content: TextSpan[];
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string | number;
  version?: number | string;
  hash?: string;
  caption?: string;
  zoomable?: boolean;
}

export interface VideoBlock extends BaseBlock {
  type: 'video';
  provider: 'youtube' | 'vimeo' | 'native';
  videoId?: string; // for youtube/vimeo
  src?: string; // for native
  title?: string;
}

export interface CalloutBlock extends BaseBlock {
  type: 'callout';
  variant: 'info' | 'warning' | 'tip' | 'success' | 'exam';
  text: string;
}

export interface ListBlock extends BaseBlock {
  type: 'list';
  style: 'bullet' | 'ordered';
  items: string[];
}

export interface QuizBlock extends BaseBlock {
  type: 'quiz';
  quizId: string;
}

export interface FlashcardsBlock extends BaseBlock {
  type: 'flashcards';
  cards: Array<{
    front: string;
    back: string;
  }>;
}

export type ContentBlock = 
  | HeadingBlock 
  | TextBlock 
  | ImageBlock 
  | VideoBlock 
  | CalloutBlock 
  | ListBlock 
  | QuizBlock
  | FlashcardsBlock
  // Add others later as needed
  | BaseBlock; 

export interface Lesson {
  lessonId: string;
  title: string;
  summary: string;
  order: number;
  estimatedDurationMinutes: number;
  premium: boolean;
  learningObjectives: string[];
  blocks: ContentBlock[];
}

export interface QuizQuestion {
  questionId: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  prompt: string;
  choices?: string[];
  correctAnswer: string | boolean | string[];
  explanation: string;
}

export interface Quiz {
  quizId: string;
  lessonId: string;
  title: string;
  questions: QuizQuestion[];
}

export interface CourseDetail {
  courseId: string;
  lessons: Lesson[];
  quizzes?: Quiz[];
}

export interface CourseAPI {
  getCourseSummaries(): Promise<CourseSummary[]>;
  getCourseSummary(courseId: string): Promise<CourseSummary>;
  getCourseDetail(courseId: string): Promise<CourseDetail>;
}
