/**
 * Tests for parseMarkdownInline()
 *
 * Pure string → TextSpan[] conversion — no dependencies on Google Docs or Firebase.
 * This is the highest-value unit test because markdown parsing has many edge cases.
 */

import { parseMarkdownInline } from '../src/parseGoogleDoc';

describe('parseMarkdownInline', () => {
  // ─── Plain Text ──────────────────────────────────────────────────────

  it('returns plain text as a single span', () => {
    const result = parseMarkdownInline('Hello world');
    expect(result).toEqual([
      { text: 'Hello world', bold: false, italic: false },
    ]);
  });

  it('returns empty array for empty string', () => {
    expect(parseMarkdownInline('')).toEqual([]);
  });

  // ─── Bold ────────────────────────────────────────────────────────────

  it('parses **bold** text', () => {
    const result = parseMarkdownInline('This is **bold** text');
    expect(result).toEqual([
      { text: 'This is ', bold: false, italic: false },
      { text: 'bold', bold: true, italic: false },
      { text: ' text', bold: false, italic: false },
    ]);
  });

  it('parses multiple **bold** segments', () => {
    const result = parseMarkdownInline('**one** and **two**');
    expect(result).toEqual([
      { text: 'one', bold: true, italic: false },
      { text: ' and ', bold: false, italic: false },
      { text: 'two', bold: true, italic: false },
    ]);
  });

  it('parses **bold** at start of string', () => {
    const result = parseMarkdownInline('**bold** start');
    expect(result).toEqual([
      { text: 'bold', bold: true, italic: false },
      { text: ' start', bold: false, italic: false },
    ]);
  });

  it('parses **bold** at end of string', () => {
    const result = parseMarkdownInline('end is **bold**');
    expect(result).toEqual([
      { text: 'end is ', bold: false, italic: false },
      { text: 'bold', bold: true, italic: false },
    ]);
  });

  // ─── Italic ──────────────────────────────────────────────────────────

  it('parses *italic* text', () => {
    const result = parseMarkdownInline('This is *italic* text');
    expect(result).toEqual([
      { text: 'This is ', bold: false, italic: false },
      { text: 'italic', bold: false, italic: true },
      { text: ' text', bold: false, italic: false },
    ]);
  });

  it('parses multiple *italic* segments', () => {
    const result = parseMarkdownInline('*one* and *two*');
    expect(result).toEqual([
      { text: 'one', bold: false, italic: true },
      { text: ' and ', bold: false, italic: false },
      { text: 'two', bold: false, italic: true },
    ]);
  });

  // ─── Bold + Italic ──────────────────────────────────────────────────

  it('parses ***bold italic*** text', () => {
    const result = parseMarkdownInline('This is ***bold italic*** text');
    expect(result).toEqual([
      { text: 'This is ', bold: false, italic: false },
      { text: 'bold italic', bold: true, italic: true },
      { text: ' text', bold: false, italic: false },
    ]);
  });

  // ─── Links ───────────────────────────────────────────────────────────

  it('parses [link text](url)', () => {
    const result = parseMarkdownInline('Visit [Google](https://google.com) now');
    expect(result).toEqual([
      { text: 'Visit ', bold: false, italic: false },
      { text: 'Google', bold: false, italic: false, link: 'https://google.com' },
      { text: ' now', bold: false, italic: false },
    ]);
  });

  it('parses link at start of string', () => {
    const result = parseMarkdownInline('[Click here](https://example.com) for details');
    expect(result).toEqual([
      { text: 'Click here', bold: false, italic: false, link: 'https://example.com' },
      { text: ' for details', bold: false, italic: false },
    ]);
  });

  it('parses link at end of string', () => {
    const result = parseMarkdownInline('See [docs](https://docs.com)');
    expect(result).toEqual([
      { text: 'See ', bold: false, italic: false },
      { text: 'docs', bold: false, italic: false, link: 'https://docs.com' },
    ]);
  });

  // ─── Mixed Formatting ───────────────────────────────────────────────

  it('parses mixed bold, italic, and links in one string', () => {
    const result = parseMarkdownInline('**Bold** then *italic* then [link](http://url.com)');
    expect(result).toEqual([
      { text: 'Bold', bold: true, italic: false },
      { text: ' then ', bold: false, italic: false },
      { text: 'italic', bold: false, italic: true },
      { text: ' then ', bold: false, italic: false },
      { text: 'link', bold: false, italic: false, link: 'http://url.com' },
    ]);
  });

  it('handles complex sentence from course content', () => {
    const result = parseMarkdownInline(
      'Biology is the study of **living organisms** and how they interact with their *environment*.'
    );
    expect(result).toEqual([
      { text: 'Biology is the study of ', bold: false, italic: false },
      { text: 'living organisms', bold: true, italic: false },
      { text: ' and how they interact with their ', bold: false, italic: false },
      { text: 'environment', bold: false, italic: true },
      { text: '.', bold: false, italic: false },
    ]);
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────

  it('treats unmatched asterisks as plain text', () => {
    const result = parseMarkdownInline('5 * 3 = 15');
    // Single * surrounded by spaces — shouldn't match as italic markers
    // The regex needs text between *...*
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('5');
    expect(result[0].bold).toBe(false);
    expect(result[0].italic).toBe(false);
  });

  it('handles string with only bold', () => {
    const result = parseMarkdownInline('**everything bold**');
    expect(result).toEqual([
      { text: 'everything bold', bold: true, italic: false },
    ]);
  });

  it('handles string with only italic', () => {
    const result = parseMarkdownInline('*everything italic*');
    expect(result).toEqual([
      { text: 'everything italic', bold: false, italic: true },
    ]);
  });

  it('handles string with only a link', () => {
    const result = parseMarkdownInline('[only a link](https://example.com)');
    expect(result).toEqual([
      { text: 'only a link', bold: false, italic: false, link: 'https://example.com' },
    ]);
  });

  it('handles adjacent formatted segments', () => {
    const result = parseMarkdownInline('**bold***italic*');
    expect(result).toEqual([
      { text: 'bold', bold: true, italic: false },
      { text: 'italic', bold: false, italic: true },
    ]);
  });
});
