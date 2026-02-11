/**
 * Parse Google Doc and generate course JSON files
 *
 * Supports BOTH:
 *   1. Google Docs native formatting (H1/H2 styles, bold, italic, bullets)
 *   2. Markdown syntax within plain text (# headings, **bold**, *italic*, - bullets)
 *
 * This lets content creators use either Google Docs toolbar formatting
 * OR type markdown directly — whichever is easier. Both produce the same JSON output.
 *
 * HOW IT WORKS:
 *   Raw Google Docs elements
 *       ↓
 *   normalizeParagraph()    ← detects GDocs styles OR markdown, outputs uniform format
 *       ↓
 *   NormalizedParagraph[]   ← clean array: headingLevel, richText, isBullet, etc.
 *       ↓
 *   parseCourseMetadata()   ← reads Course Summary key:value pairs
 *   parseLessons()          ← main loop: walks paragraphs, builds blocks
 *       ↓
 *   JSON output → Firebase Storage
 *
 * Usage:
 *   npm run parse -- <doc-id>
 */

import { google } from 'googleapis';
import * as https from 'https';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { ensureFirebaseAdminInitialized, getGoogleServiceAccount } from './runtimeConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

/** A single run of text with formatting info */
export interface TextSpan {
  text: string;
  bold: boolean;
  italic: boolean;
  link?: string;
}

/** Normalized representation of one paragraph from Google Docs */
export interface NormalizedParagraph {
  /** Heading level: 0 = not a heading, 1 = H1, 2 = H2, 3 = H3, etc. */
  headingLevel: number;
  /** Plain text content (all runs joined, trimmed, markdown prefixes stripped) */
  plainText: string;
  /** Rich text spans with bold/italic/link info */
  richText: TextSpan[];
  /** Whether this is a bullet / list item */
  isBullet: boolean;
  /** Whether this paragraph contains an inline image */
  hasImage: boolean;
  /** Google Docs inline object ID for the image (if any) */
  imageObjectId?: string;
}

export type QuizType = 'mcq' | 'true_false' | 'short_answer';

// ─── Slugify ─────────────────────────────────────────────────────────────────

/** Convert a title string to a URL-safe slug for stable lesson IDs */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                          // decompose accents (é → e + combining)
    .replace(/[\u0300-\u036f]/g, '')           // strip combining diacriticals
    .replace(/[^a-z0-9\s-]/g, '')              // remove non-alphanumeric
    .replace(/\s+/g, '-')                      // spaces → hyphens
    .replace(/-+/g, '-')                       // collapse multiple hyphens
    .replace(/^-|-$/g, '');                     // trim leading/trailing hyphens
}

// ─── Google Docs API Client ──────────────────────────────────────────────────

async function initializeDocsClient() {
  const serviceAccount = getGoogleServiceAccount();

  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [
      'https://www.googleapis.com/auth/documents.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ],
  });

  return google.docs({ version: 'v1', auth });
}

// ─── Firebase Storage Helpers ────────────────────────────────────────────────

/** Upload an image from a URL to Firebase Storage, returns public URL */
interface UploadedImageInfo {
  publicUrl: string;
  sha256: string;
  version: string;
}

/** Upload an image from a URL to Firebase Storage, returns public URL + hash/version */
async function uploadImageToStorage(url: string, storagePath: string): Promise<UploadedImageInfo> {
  return new Promise((resolve, reject) => {
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);

    https.get(url, (response) => {
      const chunks: Buffer[] = [];

      response.on('data', (chunk) => chunks.push(chunk));

      response.on('end', async () => {
        try {
          const buffer = Buffer.concat(chunks);
          const contentType = response.headers['content-type'] || 'image/jpeg';
          const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
          const version = sha256.slice(0, 12);

          await file.save(buffer, {
            metadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
            public: true,
          });

          resolve({
            publicUrl: `https://storage.googleapis.com/${bucket.name}/${storagePath}`,
            sha256,
            version,
          });
        } catch (err) {
          reject(err);
        }
      });

      response.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

/** Upload a JSON object to Firebase Storage, returns public URL */
async function uploadJsonToStorage(data: any, storagePath: string): Promise<string> {
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  await file.save(JSON.stringify(data, null, 2), {
    metadata: { contentType: 'application/json', cacheControl: 'public, max-age=3600' },
    public: true,
  });

  return `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
}

// ─── Normalization Layer ─────────────────────────────────────────────────────
//
// This is the KEY architectural idea. Every raw Google Docs element gets
// converted into a NormalizedParagraph. The normalization handles BOTH native
// Google Docs formatting AND markdown syntax, so all downstream code only
// looks at the clean normalized fields (headingLevel, isBullet, richText).
//
// Detection priority:
//   1. Google Docs native style (HEADING_1, bold textStyle, bullet property)
//   2. Markdown syntax fallback (# heading, **bold**, - bullet)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convert one raw Google Docs body element into a NormalizedParagraph.
 * Returns null for non-paragraph elements and empty paragraphs.
 */
export function normalizeParagraph(element: any): NormalizedParagraph | null {
  if (!element.paragraph) return null;

  const para = element.paragraph;
  const gdocsStyle = para.paragraphStyle?.namedStyleType || 'NORMAL_TEXT';

  // ── Step 1: Extract raw text runs and detect images ──

  const rawRuns: Array<{ text: string; style: any }> = [];
  let imageObjectId: string | undefined;

  for (const el of para.elements || []) {
    if (el.inlineObjectElement) {
      imageObjectId = el.inlineObjectElement.inlineObjectId;
    }
    if (el.textRun) {
      rawRuns.push({ text: el.textRun.content || '', style: el.textRun.textStyle || {} });
    }
  }

  const joinedText = rawRuns.map(r => r.text).join('').trim();

  // Skip completely empty paragraphs (unless they contain an image)
  if (joinedText === '' && !imageObjectId) return null;

  // ── Step 2: Detect heading level (GDocs style first, then markdown) ──

  const headingLevel = detectHeadingLevel(gdocsStyle, joinedText);

  // ── Step 3: Detect bullet (GDocs bullet property first, then markdown) ──

  const isGDocsBullet = !!para.bullet;
  const isMarkdownBullet = !isGDocsBullet && headingLevel === 0 && /^[-*+]\s+/.test(joinedText);
  const isBullet = isGDocsBullet || isMarkdownBullet;

  // ── Step 4: Clean the text (strip markdown prefixes we already detected) ──

  let cleanText = joinedText;

  if (headingLevel > 0 && !gdocsStyle.startsWith('HEADING_')) {
    // Heading came from markdown — strip the leading #'s
    cleanText = joinedText.replace(/^#{1,6}\s+/, '');
  }
  if (isMarkdownBullet) {
    // Bullet came from markdown — strip the leading "- " / "* " / "+ "
    cleanText = joinedText.replace(/^[-*+]\s+/, '');
  }

  // ── Step 5: Build rich text spans ──

  const hasGDocsFormatting = rawRuns.some(r => r.style.bold || r.style.italic || r.style.link?.url);
  let richText: TextSpan[];

  if (hasGDocsFormatting) {
    // Trust Google Docs formatting (bold/italic/links from textStyle)
    richText = buildSpansFromGDocs(rawRuns);
  } else {
    // No GDocs formatting → parse markdown inline: **bold**, *italic*, [link](url)
    richText = parseMarkdownInline(cleanText);
  }

  return { headingLevel, plainText: cleanText, richText, isBullet, hasImage: !!imageObjectId, imageObjectId };
}

/**
 * Detect heading level from Google Docs style or markdown prefix.
 * GDocs headings take priority over markdown.
 * Returns 0 if not a heading.
 */
export function detectHeadingLevel(gdocsStyle: string, plainText: string): number {
  // Priority 1: Google Docs native heading
  const gdocsMatch = gdocsStyle.match(/^HEADING_(\d)$/);
  if (gdocsMatch) return parseInt(gdocsMatch[1], 10);

  // Priority 2: Markdown heading (# to ######)
  const mdMatch = plainText.match(/^(#{1,6})\s+/);
  if (mdMatch) return mdMatch[1].length;

  return 0;
}

/**
 * Build TextSpan[] from Google Docs native textRun styles.
 * Used when Google Docs already provides bold/italic/link info.
 */
export function buildSpansFromGDocs(runs: Array<{ text: string; style: any }>): TextSpan[] {
  const spans: TextSpan[] = [];

  for (const run of runs) {
    const text = run.text.replace(/\n/g, '');
    if (!text.trim()) continue;

    spans.push({
      text,
      bold: run.style.bold || false,
      italic: run.style.italic || false,
      link: run.style.link?.url || undefined,
    });
  }

  return spans;
}

/**
 * Parse markdown inline formatting from plain text.
 *
 * Handles:
 *   ***bold italic***  →  { bold: true, italic: true }
 *   **bold text**      →  { bold: true }
 *   *italic text*      →  { italic: true }
 *   [text](url)        →  { link: url }
 *   plain text         →  { bold: false, italic: false }
 */
export function parseMarkdownInline(text: string): TextSpan[] {
  if (!text) return [];

  const spans: TextSpan[] = [];

  // Match: ***bold+italic***, **bold**, *italic*, [link](url), or plain text between them
  const tokenRegex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]+)\]\(([^)]+)\))/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > lastIndex) {
      spans.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false });
    }

    if (match[2]) {
      spans.push({ text: match[2], bold: true, italic: true });       // ***bold italic***
    } else if (match[3]) {
      spans.push({ text: match[3], bold: true, italic: false });      // **bold**
    } else if (match[4]) {
      spans.push({ text: match[4], bold: false, italic: true });      // *italic*
    } else if (match[5] && match[6]) {
      spans.push({ text: match[5], bold: false, italic: false, link: match[6] }); // [text](url)
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text after the last match
  if (lastIndex < text.length) {
    spans.push({ text: text.slice(lastIndex), bold: false, italic: false });
  }

  // If nothing was parsed, return the whole string as one plain span
  if (spans.length === 0) {
    spans.push({ text, bold: false, italic: false });
  }

  return spans;
}

// ─── YouTube Helpers ─────────────────────────────────────────────────────────

export function isYouTubeUrl(text: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/.test(text);
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/,
    /youtube\.com\/embed\/([^&\s]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ─── Special Marker Detection ────────────────────────────────────────────────

export function isCalloutMarker(text: string): boolean { return text === '[CALLOUT]'; }
export function isFlashcardMarker(text: string): boolean { return text === '[FLASHCARD]'; }

export function getQuizMarkerType(text: string): QuizType | null {
  if (text.startsWith('[QUIZ_CHOICE]')) return 'mcq';
  if (text.startsWith('[QUIZ_TRUE_FALSE]')) return 'true_false';
  if (text.startsWith('[QUIZ_SHORT_ANSWER]')) return 'short_answer';
  return null;
}

export function isLessonHeading(para: NormalizedParagraph): boolean {
  return para.headingLevel === 1 && /^Lesson\s*[-–]\s*/i.test(para.plainText);
}

function isContentBoundary(para: NormalizedParagraph): boolean {
  return isLessonHeading(para) ||
    isCalloutMarker(para.plainText) ||
    isFlashcardMarker(para.plainText) ||
    getQuizMarkerType(para.plainText) !== null;
}

// ─── Image Helper ────────────────────────────────────────────────────────────

/** Get image content URL from a Google Docs inline object */
function getImageUrl(doc: any, objectId: string): string | null {
  return doc.inlineObjects?.[objectId]
    ?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri || null;
}

// ─── Course Metadata Parsing ─────────────────────────────────────────────────

/** Mapping of human-readable field names → JSON keys */
const METADATA_KEY_MAP: Record<string, string> = {
  'Course ID': 'courseId',
  'Title': 'title',
  'Subtitle': 'subtitle',
  'Description': 'description',
  'Author Name': 'authorName',
  'Author Organization': 'authorOrganization',
  'Author Bio': 'authorBio',
  'Author Avatar URL': 'authorAvatarUrl',
  'Release Date': 'releaseDate',
  'Language': 'language',
  'Difficulty': 'difficulty',
  'Estimated Duration (minutes)': 'estimatedDurationMinutes',
  'Tags': 'tags',
  'Premium': 'premium',
  'Order': 'order',
};

/**
 * Parse "Course Summary" section at the top of the document.
 * Reads key:value pairs until we hit the first "Lesson -" heading.
 * Also detects and uploads the course thumbnail image.
 */
async function parseCourseMetadata(
  paragraphs: NormalizedParagraph[],
  doc: any,
  courseId: string,
): Promise<Record<string, any>> {
  const metadata: Record<string, any> = {};

  console.log(`  Scanning ${paragraphs.length} paragraphs for metadata...`);

  for (const para of paragraphs) {
    // Stop at first lesson heading
    if (isLessonHeading(para)) {
      console.log(`  Stopped at lesson heading: ${para.plainText}`);
      break;
    }

    // Upload thumbnail image if found
    if (para.hasImage && para.imageObjectId && courseId) {
      const imageUrl = getImageUrl(doc, para.imageObjectId);
      if (imageUrl) {
        const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
        try {
          const uploaded = await uploadImageToStorage(imageUrl, `courses/${courseId}/thumbnail.${ext}`);
          metadata.thumbnailUrl = uploaded.publicUrl;
          metadata.thumbnailVersion = uploaded.version;
          metadata.thumbnailHash = uploaded.sha256;
          console.log(`  ✅ Uploaded thumbnail: ${uploaded.publicUrl}`);
        } catch (err) {
          console.warn(`  ⚠️  Failed to upload thumbnail:`, err);
        }
      }
    }

    // Match "Key: Value" format
    const kvMatch = para.plainText.match(/^(.+?):\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1].trim();
    const rawValue = kvMatch[2].trim();
    const jsonKey = METADATA_KEY_MAP[key];
    if (!jsonKey) continue;

    // Strip helper text in parentheses, e.g. "beginner (beginner/intermediate/advanced)"
    const value = rawValue.replace(/\s*\([^)]+\)\s*$/, '').trim();
    console.log(`  Found: ${key} = ${value}`);

    // Type-specific parsing
    switch (key) {
      case 'Tags':
        metadata[jsonKey] = value.split(',').map((t: string) => t.trim());
        break;
      case 'Estimated Duration (minutes)':
        metadata[jsonKey] = parseInt(value) || 0;
        break;
      case 'Order':
        metadata[jsonKey] = parseInt(value) || 0;
        break;
      case 'Premium':
        metadata[jsonKey] = value.toLowerCase() === 'yes';
        break;
      case 'Difficulty':
        metadata[jsonKey] = value.toLowerCase();
        break;
      default:
        metadata[jsonKey] = value;
    }
  }

  console.log(`  Metadata parsed: ${Object.keys(metadata).length} fields\n`);
  return metadata;
}

// ─── Lesson Metadata Parsing ─────────────────────────────────────────────────

/**
 * Parse lesson metadata (Summary, Duration, Premium) that immediately
 * follows a lesson heading. Returns the number of paragraphs consumed.
 */
export function parseLessonMetadata(lesson: any, paragraphs: NormalizedParagraph[], startIndex: number): number {
  let consumed = 0;

  for (let i = startIndex; i < paragraphs.length; i++) {
    const para = paragraphs[i];

    // Stop at headings or content markers
    if (para.headingLevel > 0 || isContentBoundary(para)) break;

    const kvMatch = para.plainText.match(/^(.+?):\s*(.*)$/);
    if (!kvMatch) break;

    const key = kvMatch[1].trim();
    const value = kvMatch[2].trim();

    if (key === 'Summary') lesson.summary = value;
    else if (key === 'Duration (minutes)') lesson.estimatedDurationMinutes = parseInt(value) || 0;
    else if (key === 'Premium') lesson.premium = value.toLowerCase() === 'yes';
    else break; // Unknown key — content has started

    consumed++;
  }

  return consumed;
}

// ─── Block Parsers ───────────────────────────────────────────────────────────
//
// Each function parses one type of content block. They receive the paragraphs
// array + current index and return { block, consumed } so the main loop can
// advance cleanly.
// ─────────────────────────────────────────────────────────────────────────────

/** Parse [CALLOUT] marker + the next paragraph as callout content */
function parseCallout(paragraphs: NormalizedParagraph[], index: number): { block: any; consumed: number } {
  for (let i = index + 1; i < paragraphs.length; i++) {
    if (paragraphs[i].plainText.length > 0) {
      return {
        block: { type: 'callout', variant: 'tip', text: paragraphs[i].plainText },
        consumed: i - index + 1,
      };
    }
  }
  return { block: null, consumed: 1 };
}

/** Parse [FLASHCARD] marker + Front:/Back: fields. Returns a single card. */
function parseFlashcard(paragraphs: NormalizedParagraph[], index: number): { block: any; consumed: number } {
  const card: { front?: string; back?: string } = {};
  let i = index + 1;

  while (i < paragraphs.length) {
    const para = paragraphs[i];
    if (isContentBoundary(para)) break;

    if (para.plainText.startsWith('Front:')) {
      card.front = para.plainText.replace('Front:', '').trim();
    } else if (para.plainText.startsWith('Back:')) {
      card.back = para.plainText.replace('Back:', '').trim();
    }

    if (card.front && card.back) {
      return { block: card, consumed: i - index + 1 };
    }
    i++;
  }

  if (card.front && card.back) {
    return { block: card, consumed: i - index };
  }
  return { block: null, consumed: i - index || 1 };
}

/** Parse [QUIZ_*] marker + question fields (Prompt, choices, Answer, Explanation) */
function parseQuizQuestion(
  type: QuizType,
  paragraphs: NormalizedParagraph[],
  index: number,
): { question: any; consumed: number } {
  const question: any = {
    questionId: `q${Math.random().toString(36).substr(2, 9)}`,
    type,
  };

  let i = index + 1;

  while (i < paragraphs.length) {
    const para = paragraphs[i];
    if (isContentBoundary(para)) break;

    const text = para.plainText;

    if (text.startsWith('Prompt:')) {
      question.prompt = text.replace('Prompt:', '').trim();
    } else if (text.startsWith('Explanation:')) {
      question.explanation = text.replace('Explanation:', '').trim();
    } else if (type === 'mcq' && text.match(/^[A-D]\)/)) {
      if (!question.choices) question.choices = [];
      const choiceText = text.replace(/^[A-D]\)\s*/, '');
      const isCorrect = choiceText.includes('[CORRECT]');
      const cleanChoice = choiceText.replace(/\s*\[CORRECT\]\s*/g, '').trim();
      question.choices.push(cleanChoice);
      if (isCorrect) question.correctAnswer = cleanChoice;
    } else if (type === 'true_false' && text.startsWith('Answer:')) {
      question.correctAnswer = text.replace('Answer:', '').trim().toUpperCase() === 'TRUE';
    } else if (type === 'short_answer' && text.startsWith('Accepted Answers:')) {
      question.correctAnswer = text.replace('Accepted Answers:', '').trim()
        .split('|').map((a: string) => a.trim());
    }

    i++;
  }

  return { question, consumed: i - index };
}

// ─── Main Lesson Parsing Loop ────────────────────────────────────────────────
//
// Walks through all normalized paragraphs and builds lessons with blocks.
//
// Flow:
//   1. "Lesson -" H1 heading → start new lesson, parse its metadata
//   2. H2/H3 headings → heading blocks
//   3. [CALLOUT] → callout block
//   4. [FLASHCARD] → flashcard deck (single deck per lesson; extras merged)
//   5. [QUIZ_*] → quiz questions (single quiz block per lesson; questions merged)
//   6. YouTube URLs → video blocks
//   7. Bullet items → list blocks (consecutive bullets grouped)
//   8. Images → image blocks (uploaded to Storage)
//   9. Everything else → text blocks with rich formatting
// ─────────────────────────────────────────────────────────────────────────────

export function enforceInteractiveBlockConstraints(
  lessonId: string,
  lessonTitle: string,
  blocks: any[],
): any[] {
  const normalized: any[] = [];
  const normalizedQuizId = `quiz-${lessonId}`;

  let mergedFlashcardsDecks = 0;
  let mergedQuizBlocks = 0;
  let firstFlashcardsBlock: any | null = null;
  let firstQuizBlock: any | null = null;

  for (const block of blocks) {
    if (block?.type === 'flashcards') {
      if (!firstFlashcardsBlock) {
        firstFlashcardsBlock = {
          ...block,
          cards: Array.isArray(block.cards) ? [...block.cards] : [],
        };
        normalized.push(firstFlashcardsBlock);
      } else {
        mergedFlashcardsDecks++;
        const extraCards = Array.isArray(block.cards) ? block.cards : [];
        firstFlashcardsBlock.cards.push(...extraCards);
      }
      continue;
    }

    if (block?.type === 'quiz') {
      if (!firstQuizBlock) {
        firstQuizBlock = { ...block, quizId: normalizedQuizId };
        normalized.push(firstQuizBlock);
      } else {
        mergedQuizBlocks++;
      }
      continue;
    }

    normalized.push(block);
  }

  if (mergedFlashcardsDecks > 0) {
    console.warn(
      `[parseGoogleDoc] Lesson "${lessonTitle}" (${lessonId}) contains multiple flashcards blocks; merged into one deck.`,
    );
  }
  if (mergedQuizBlocks > 0) {
    console.warn(
      `[parseGoogleDoc] Lesson "${lessonTitle}" (${lessonId}) contains multiple quiz blocks; merged into one quiz block.`,
    );
  }

  return normalized;
}

async function parseLessons(
  paragraphs: NormalizedParagraph[],
  doc: any,
  courseId: string,
): Promise<any[]> {
  const lessons: any[] = [];
  let currentLesson: any = null;
  let blocks: any[] = [];
  let blockId = 1;
  let imageCount = 0;
  let warnedSplitQuizSection = false;

  console.log(`  Scanning ${paragraphs.length} paragraphs for lessons...`);

  let i = 0;
  while (i < paragraphs.length) {
    const para = paragraphs[i];

    // ────────────────────────────────────────────
    // NEW LESSON (H1 with "Lesson -" prefix)
    // ────────────────────────────────────────────
    if (isLessonHeading(para)) {
      // Save previous lesson
      if (currentLesson) {
        const constrainedBlocks = enforceInteractiveBlockConstraints(
          currentLesson.lessonId,
          currentLesson.title,
          blocks,
        );
        currentLesson.blocks = constrainedBlocks;
        lessons.push(currentLesson);
        console.log(`    Saved "${currentLesson.title}" — ${constrainedBlocks.length} blocks`);
      }

      // Initialize new lesson
      const title = para.plainText.replace(/^Lesson\s*[-–]\s*/i, '').trim();
      currentLesson = {
        lessonId: `${courseId}-${slugify(title)}`,
        title,
        summary: '',
        order: lessons.length + 1,
        estimatedDurationMinutes: 0,
        premium: false,
        learningObjectives: [],
        blocks: [],
      };
      blocks = [];
      blockId = 1;
      imageCount = 0;
      warnedSplitQuizSection = false;

      // Parse lesson metadata lines (Summary, Duration, Premium)
      const metaConsumed = parseLessonMetadata(currentLesson, paragraphs, i + 1);
      i += 1 + metaConsumed;
      console.log(`  Found lesson: "${title}" (${metaConsumed} metadata fields)`);
      continue;
    }

    // Skip paragraphs before the first lesson
    if (!currentLesson) { i++; continue; }

    // ────────────────────────────────────────────
    // IMAGE (inline in any paragraph)
    // ────────────────────────────────────────────
    if (para.hasImage && para.imageObjectId) {
      const imageUrl = getImageUrl(doc, para.imageObjectId);
      if (imageUrl) {
        imageCount++;
        const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
        const storagePath = `courses/${courseId}/lessons/${currentLesson.lessonId}/image-${imageCount}.${ext}`;
        try {
          const uploaded = await uploadImageToStorage(imageUrl, storagePath);
          blocks.push({
            id: `b${blockId++}`,
            type: 'image',
            src: uploaded.publicUrl,
            version: uploaded.version,
            hash: uploaded.sha256,
            caption: '',
            zoomable: true,
          });
          console.log(`      ✅ Uploaded image ${imageCount}`);
        } catch (err) {
          console.warn(`      ⚠️  Failed to upload image:`, err);
        }
      }
    }

    // ────────────────────────────────────────────
    // SECTION HEADING (H2, H3, etc.)
    // ────────────────────────────────────────────
    if (para.headingLevel >= 2) {
      blocks.push({ id: `b${blockId++}`, type: 'heading', level: para.headingLevel, text: para.plainText });
      i++; continue;
    }

    // ────────────────────────────────────────────
    // CALLOUT
    // ────────────────────────────────────────────
    if (isCalloutMarker(para.plainText)) {
      const result = parseCallout(paragraphs, i);
      if (result.block) blocks.push({ id: `b${blockId++}`, ...result.block });
      i += result.consumed; continue;
    }

    // ────────────────────────────────────────────
    // FLASHCARD (consecutive cards grouped into one deck)
    // ────────────────────────────────────────────
    if (isFlashcardMarker(para.plainText)) {
      const result = parseFlashcard(paragraphs, i);
      if (result.block) {
        const lastBlock = blocks[blocks.length - 1];
        if (lastBlock?.type === 'flashcards') {
          lastBlock.cards.push(result.block);
        } else {
          blocks.push({ id: `b${blockId++}`, type: 'flashcards', cards: [result.block] });
        }
      }
      i += result.consumed; continue;
    }

    // ────────────────────────────────────────────
    // QUIZ QUESTION
    // ────────────────────────────────────────────
    const quizType = getQuizMarkerType(para.plainText);
    if (quizType) {
      const result = parseQuizQuestion(quizType, paragraphs, i);
      if (result.question) {
        const lastBlock = blocks[blocks.length - 1];
        if (!warnedSplitQuizSection && blocks.some((b: any) => b.type === 'quiz') && lastBlock?.type !== 'quiz') {
          console.warn(
            `[parseGoogleDoc] Lesson "${currentLesson.title}" (${currentLesson.lessonId}) has quiz questions in multiple sections; merged into one quiz.`,
          );
          warnedSplitQuizSection = true;
        }

        // Add quiz block reference (once per lesson)
        const quizId = `quiz-${currentLesson.lessonId}`;
        if (!blocks.find((b: any) => b.type === 'quiz' && b.quizId === quizId)) {
          blocks.push({ id: `b${blockId++}`, type: 'quiz', quizId });
        }
        // Store question on lesson for later assembly
        if (!currentLesson._quizQuestions) currentLesson._quizQuestions = [];
        currentLesson._quizQuestions.push(result.question);
      }
      i += result.consumed; continue;
    }

    // ────────────────────────────────────────────
    // YOUTUBE VIDEO
    // ────────────────────────────────────────────
    if (isYouTubeUrl(para.plainText)) {
      const videoId = extractYouTubeId(para.plainText);
      if (videoId) {
        blocks.push({ id: `b${blockId++}`, type: 'video', provider: 'youtube', videoId, title: '' });
      }
      i++; continue;
    }

    // ────────────────────────────────────────────
    // BULLET / LIST ITEM (consecutive bullets grouped)
    // ────────────────────────────────────────────
    if (para.isBullet && para.plainText.length > 0) {
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock?.type === 'list') {
        lastBlock.items.push(para.richText);
      } else {
        blocks.push({ id: `b${blockId++}`, type: 'list', style: 'bullet', items: [para.richText] });
      }
      i++; continue;
    }

    // ────────────────────────────────────────────
    // REGULAR TEXT PARAGRAPH
    // ────────────────────────────────────────────
    if (para.plainText.length > 0 && para.richText.length > 0) {
      blocks.push({ id: `b${blockId++}`, type: 'text', content: para.richText });
      i++; continue;
    }

    // Skip anything else (empty, separators, etc.)
    i++;
  }

  // Save last lesson
  if (currentLesson) {
    const constrainedBlocks = enforceInteractiveBlockConstraints(
      currentLesson.lessonId,
      currentLesson.title,
      blocks,
    );
    currentLesson.blocks = constrainedBlocks;
    lessons.push(currentLesson);
    console.log(`    Saved "${currentLesson.title}" — ${constrainedBlocks.length} blocks`);
  }

  return lessons;
}

// ─── JSON Assembly ───────────────────────────────────────────────────────────

export function buildCourseSummary(metadata: Record<string, any>, lessons: any[]): any {
  return {
    courseId: metadata.courseId,
    title: metadata.title,
    subtitle: metadata.subtitle,
    description: metadata.description,
    author: {
      name: metadata.authorName || '',
      organization: metadata.authorOrganization || '',
      bio: metadata.authorBio || '',
      avatarUrl: metadata.authorAvatarUrl || '',
    },
    thumbnailUrl: metadata.thumbnailUrl || 'local',
    thumbnailVersion: metadata.thumbnailVersion,
    thumbnailHash: metadata.thumbnailHash,
    releaseDate: metadata.releaseDate ? `${metadata.releaseDate}T00:00:00Z` : new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    language: metadata.language || 'en',
    difficulty: metadata.difficulty || 'beginner',
    estimatedDurationMinutes:
      metadata.estimatedDurationMinutes ||
      lessons.reduce((sum: number, l: any) => sum + l.estimatedDurationMinutes, 0),
    tags: metadata.tags || [],
    premium: metadata.premium || false,
    freePreviewLessons: lessons.filter((l: any) => !l.premium).map((l: any) => l.lessonId),
    lessonCount: lessons.length,
    order: metadata.order || 0,
  };
}

export function buildCourseDetail(metadata: Record<string, any>, lessons: any[]): any {
  // Extract quiz questions stored on lessons into top-level quizzes array
  const quizzes = lessons
    .filter((l: any) => l._quizQuestions?.length > 0)
    .map((l: any) => ({
      quizId: `quiz-${l.lessonId}`,
      lessonId: l.lessonId,
      title: `${l.title} Checkpoint`,
      questions: l._quizQuestions,
    }));

  // Remove temp _quizQuestions from lesson objects
  const cleanLessons = lessons.map((l: any) => {
    const { _quizQuestions, ...clean } = l;
    return clean;
  });

  return { courseId: metadata.courseId, lessons: cleanLessons, quizzes };
}

// ─── Main Entry Point ────────────────────────────────────────────────────────

async function parseGoogleDoc(docId: string) {
  console.log(`\n📄 Parsing Google Doc: ${docId}\n`);

  try {
    ensureFirebaseAdminInitialized();
    const docs = await initializeDocsClient();

    // 1. Fetch the document
    console.log('Fetching document...');
    const response = await docs.documents.get({ documentId: docId });
    const doc = response.data;
    const rawContent = doc.body?.content || [];
    console.log(`✅ Document fetched (${rawContent.length} elements)\n`);

    // 2. Normalize all paragraphs (handles GDocs formatting + markdown)
    console.log('🔄 Normalizing paragraphs (GDocs styles + markdown)...');
    const paragraphs: NormalizedParagraph[] = [];
    for (const element of rawContent) {
      const normalized = normalizeParagraph(element);
      if (normalized) paragraphs.push(normalized);
    }
    console.log(`✅ Normalized ${paragraphs.length} paragraphs\n`);

    // 3. Parse course metadata from top of document
    console.log('📋 Parsing course metadata...');
    const metadata = await parseCourseMetadata(paragraphs, doc, '');

    if (!metadata.courseId) {
      throw new Error('Course ID not found. Make sure "Course ID:" is in the Course Summary section.');
    }
    // Normalize courseId: strip "course-" prefix if present so storage paths
    // match the index (e.g. "course-farming-101" → "farming-101")
    const courseId = metadata.courseId.replace(/^course-/, '');
    metadata.courseId = courseId;
    console.log(`✅ Course ID: ${courseId}\n`);

    // Re-parse with courseId (needed for thumbnail upload path)
    const metadataWithId = await parseCourseMetadata(paragraphs, doc, courseId);
    Object.assign(metadata, metadataWithId);
    // Re-apply courseId normalization (re-parse overwrites it with raw value)
    metadata.courseId = courseId;

    // 4. Parse lessons and content blocks
    console.log('📚 Parsing lessons...');
    const lessons = await parseLessons(paragraphs, doc, courseId);
    console.log(`✅ Found ${lessons.length} lesson(s)\n`);

    // 5. Build JSON output
    const summary = buildCourseSummary(metadata, lessons);
    const detail = buildCourseDetail(metadata, lessons);

    // 6. Upload to Firebase Storage
    console.log('📤 Uploading to Firebase Storage...\n');

    const summaryUrl = await uploadJsonToStorage(summary, `courses/${courseId}/course-summary.json`);
    console.log(`   ✅ Summary: ${summaryUrl}`);

    const detailUrl = await uploadJsonToStorage(detail, `courses/${courseId}/course-detail.json`);
    console.log(`   ✅ Detail: ${detailUrl}\n`);

    return { summary, detail };
  } catch (error: any) {
    console.error('\n❌ Error during parsing:', error.message);
    throw error;
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const docId = process.argv[2];

  if (!docId) {
    console.error('❌ Usage: npm run parse -- <google-doc-id>\n');
    console.log('Example:');
    console.log('  npm run parse -- 1a2b3c4d5e6f7g8h9i0j\n');
    process.exit(1);
  }

  try {
    await parseGoogleDoc(docId);
    console.log('✅ Parse complete!\n');
  } catch (error: any) {
    console.error('❌ Parse failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { parseGoogleDoc };
