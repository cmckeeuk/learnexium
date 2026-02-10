/**
 * Tests for normalizeParagraph()
 *
 * Feeds hand-crafted Google Docs element JSON to the normalizer
 * and asserts it produces the correct NormalizedParagraph.
 *
 * Tests both:
 *   1. Native Google Docs formatting (heading styles, bold textStyle, bullet)
 *   2. Markdown syntax in plain text (# heading, **bold**, - bullet)
 */

import { normalizeParagraph } from '../src/parseGoogleDoc';

// ─── Helpers to build mock Google Docs elements ─────────────────────────────

/** Build a minimal Google Docs paragraph element */
function makeGDocsParagraph(
  text: string,
  options: {
    namedStyleType?: string;
    bold?: boolean;
    italic?: boolean;
    linkUrl?: string;
    hasBullet?: boolean;
    inlineObjectId?: string;
  } = {},
): any {
  const element: any = {
    paragraph: {
      paragraphStyle: {
        namedStyleType: options.namedStyleType || 'NORMAL_TEXT',
      },
      elements: [],
    },
  };

  // Text run
  if (text) {
    const textStyle: any = {};
    if (options.bold) textStyle.bold = true;
    if (options.italic) textStyle.italic = true;
    if (options.linkUrl) textStyle.link = { url: options.linkUrl };

    element.paragraph.elements.push({
      textRun: { content: text, textStyle },
    });
  }

  // Inline image
  if (options.inlineObjectId) {
    element.paragraph.elements.push({
      inlineObjectElement: { inlineObjectId: options.inlineObjectId },
    });
  }

  // Bullet
  if (options.hasBullet) {
    element.paragraph.bullet = { listId: 'list-1' };
  }

  return element;
}

/** Build a GDocs paragraph with multiple text runs (mixed formatting) */
function makeMultiRunParagraph(
  runs: Array<{ text: string; bold?: boolean; italic?: boolean; linkUrl?: string }>,
  namedStyleType = 'NORMAL_TEXT',
): any {
  return {
    paragraph: {
      paragraphStyle: { namedStyleType },
      elements: runs.map(run => ({
        textRun: {
          content: run.text,
          textStyle: {
            ...(run.bold ? { bold: true } : {}),
            ...(run.italic ? { italic: true } : {}),
            ...(run.linkUrl ? { link: { url: run.linkUrl } } : {}),
          },
        },
      })),
    },
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('normalizeParagraph', () => {
  // ─── Non-paragraph / empty ─────────────────────────────────────────

  it('returns null for non-paragraph elements', () => {
    expect(normalizeParagraph({ sectionBreak: {} })).toBeNull();
    expect(normalizeParagraph({ tableOfContents: {} })).toBeNull();
    expect(normalizeParagraph({})).toBeNull();
  });

  it('returns null for empty paragraphs', () => {
    const el = makeGDocsParagraph('');
    expect(normalizeParagraph(el)).toBeNull();
  });

  it('returns null for whitespace-only paragraphs', () => {
    const el = makeGDocsParagraph('   \n  ');
    expect(normalizeParagraph(el)).toBeNull();
  });

  // ─── GDocs Headings ───────────────────────────────────────────────

  it('detects HEADING_1 as headingLevel 1', () => {
    const el = makeGDocsParagraph('My Title', { namedStyleType: 'HEADING_1' });
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(1);
    expect(result.plainText).toBe('My Title');
  });

  it('detects HEADING_2 as headingLevel 2', () => {
    const el = makeGDocsParagraph('Section', { namedStyleType: 'HEADING_2' });
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(2);
    expect(result.plainText).toBe('Section');
  });

  it('detects HEADING_3 as headingLevel 3', () => {
    const el = makeGDocsParagraph('Subsection', { namedStyleType: 'HEADING_3' });
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(3);
  });

  // ─── Markdown Headings ────────────────────────────────────────────

  it('detects # heading from markdown', () => {
    const el = makeGDocsParagraph('# My Title');
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(1);
    expect(result.plainText).toBe('My Title');
  });

  it('detects ## heading from markdown', () => {
    const el = makeGDocsParagraph('## Section');
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(2);
    expect(result.plainText).toBe('Section');
  });

  it('detects ### heading from markdown', () => {
    const el = makeGDocsParagraph('### Subsection');
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(3);
    expect(result.plainText).toBe('Subsection');
  });

  it('GDocs heading takes priority over markdown hash', () => {
    // Edge case: GDocs marks it HEADING_2 AND the text starts with "#"
    const el = makeGDocsParagraph('# Something', { namedStyleType: 'HEADING_2' });
    const result = normalizeParagraph(el)!;
    // GDocs style wins → level 2, but text still has the # (GDocs style detected, so no stripping)
    expect(result.headingLevel).toBe(2);
  });

  // ─── GDocs Bullets ────────────────────────────────────────────────

  it('detects GDocs native bullet', () => {
    const el = makeGDocsParagraph('List item', { hasBullet: true });
    const result = normalizeParagraph(el)!;
    expect(result.isBullet).toBe(true);
    expect(result.plainText).toBe('List item');
  });

  // ─── Markdown Bullets ─────────────────────────────────────────────

  it('detects "- " markdown bullet', () => {
    const el = makeGDocsParagraph('- List item');
    const result = normalizeParagraph(el)!;
    expect(result.isBullet).toBe(true);
    expect(result.plainText).toBe('List item');
  });

  it('detects "* " markdown bullet', () => {
    const el = makeGDocsParagraph('* Another item');
    const result = normalizeParagraph(el)!;
    expect(result.isBullet).toBe(true);
    expect(result.plainText).toBe('Another item');
  });

  it('detects "+ " markdown bullet', () => {
    const el = makeGDocsParagraph('+ Plus item');
    const result = normalizeParagraph(el)!;
    expect(result.isBullet).toBe(true);
    expect(result.plainText).toBe('Plus item');
  });

  it('does NOT treat heading line as a bullet', () => {
    // "## - Something" — the ## makes it a heading, not a bullet
    const el = makeGDocsParagraph('## - Something');
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(2);
    expect(result.isBullet).toBe(false);
  });

  // ─── GDocs Bold/Italic (native formatting) ───────────────────────

  it('preserves GDocs native bold formatting', () => {
    const el = makeMultiRunParagraph([
      { text: 'This is ' },
      { text: 'bold', bold: true },
      { text: ' text' },
    ]);
    const result = normalizeParagraph(el)!;
    expect(result.richText).toHaveLength(3);
    expect(result.richText[0]).toMatchObject({ bold: false, italic: false });
    expect(result.richText[1]).toMatchObject({ text: 'bold', bold: true, italic: false });
    expect(result.richText[2]).toMatchObject({ bold: false, italic: false });
  });

  it('preserves GDocs native italic formatting', () => {
    const el = makeMultiRunParagraph([
      { text: 'This is ' },
      { text: 'italic', italic: true },
    ]);
    const result = normalizeParagraph(el)!;
    expect(result.richText).toHaveLength(2);
    expect(result.richText[0]).toMatchObject({ bold: false, italic: false });
    expect(result.richText[1]).toMatchObject({ text: 'italic', bold: false, italic: true });
  });

  it('preserves GDocs native link', () => {
    const el = makeMultiRunParagraph([
      { text: 'Click ' },
      { text: 'here', linkUrl: 'https://example.com' },
    ]);
    const result = normalizeParagraph(el)!;
    expect(result.richText[1]).toEqual(
      expect.objectContaining({ text: 'here', link: 'https://example.com' }),
    );
  });

  // ─── Markdown Inline Formatting (plain text → parsed) ────────────

  it('parses **bold** from markdown when no GDocs formatting', () => {
    const el = makeGDocsParagraph('This is **bold** text');
    const result = normalizeParagraph(el)!;
    expect(result.richText).toEqual([
      { text: 'This is ', bold: false, italic: false },
      { text: 'bold', bold: true, italic: false },
      { text: ' text', bold: false, italic: false },
    ]);
  });

  it('parses *italic* from markdown when no GDocs formatting', () => {
    const el = makeGDocsParagraph('This is *italic* text');
    const result = normalizeParagraph(el)!;
    expect(result.richText).toEqual([
      { text: 'This is ', bold: false, italic: false },
      { text: 'italic', bold: false, italic: true },
      { text: ' text', bold: false, italic: false },
    ]);
  });

  it('parses [link](url) from markdown when no GDocs formatting', () => {
    const el = makeGDocsParagraph('See [docs](https://docs.com)');
    const result = normalizeParagraph(el)!;
    expect(result.richText).toEqual([
      { text: 'See ', bold: false, italic: false },
      { text: 'docs', bold: false, italic: false, link: 'https://docs.com' },
    ]);
  });

  // ─── Images ───────────────────────────────────────────────────────

  it('detects inline image', () => {
    const el = makeGDocsParagraph('', { inlineObjectId: 'img123' });
    // The paragraph has an image but no text - text is empty, but image exists
    // Our normalizer returns null for empty text without images, but this HAS an image
    const result = normalizeParagraph(el);
    expect(result).not.toBeNull();
    expect(result!.hasImage).toBe(true);
    expect(result!.imageObjectId).toBe('img123');
  });

  it('detects image in paragraph with text', () => {
    const el = makeGDocsParagraph('Caption text', { inlineObjectId: 'img456' });
    const result = normalizeParagraph(el)!;
    expect(result.hasImage).toBe(true);
    expect(result.imageObjectId).toBe('img456');
    expect(result.plainText).toBe('Caption text');
  });

  // ─── Normal Text (no special formatting) ──────────────────────────

  it('returns plain paragraph as headingLevel 0, not bullet', () => {
    const el = makeGDocsParagraph('Just a regular paragraph.');
    const result = normalizeParagraph(el)!;
    expect(result.headingLevel).toBe(0);
    expect(result.isBullet).toBe(false);
    expect(result.plainText).toBe('Just a regular paragraph.');
    expect(result.richText).toEqual([
      { text: 'Just a regular paragraph.', bold: false, italic: false },
    ]);
  });
});
