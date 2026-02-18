/**
 * Tests for parseHomeContent() — pure parsing of home document structure.
 * No Firebase or Google API dependencies.
 */

import { parseHomeContent } from '../src/parseHomeDoc';

// ─── Helpers to build mock Google Docs elements ─────────────────────────────

function makeH1(text: string) {
  return {
    paragraph: {
      paragraphStyle: { namedStyleType: 'HEADING_1' },
      elements: [{ textRun: { content: text } }],
    },
  };
}

function makeParagraph(text: string) {
  return {
    paragraph: {
      elements: [{ textRun: { content: text } }],
    },
  };
}

function makeInlineImage(objectId: string) {
  return {
    paragraph: {
      elements: [
        { inlineObjectElement: { inlineObjectId: objectId } },
      ],
    },
  };
}

function makePositionedImage(objectId: string) {
  return {
    paragraph: {
      positionedObjectIds: [objectId],
      elements: [{ textRun: { content: '' } }],
    },
  };
}

// ─── Basic parsing ──────────────────────────────────────────────────────────

describe('parseHomeContent', () => {
  it('extracts title from first H1', () => {
    const content = [
      makeH1('Ballet No Frills'),
      makeParagraph('Some description text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.title).toBe('Ballet No Frills');
  });

  it('only uses first H1 as title', () => {
    const content = [
      makeH1('First Title'),
      makeH1('Second Title'),
      makeParagraph('Body text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.title).toBe('First Title');
  });

  it('extracts body text from paragraphs', () => {
    const content = [
      makeH1('My App'),
      makeParagraph('First paragraph.'),
      makeParagraph('Second paragraph.'),
    ];
    const result = parseHomeContent(content);
    expect(result.text).toBe('First paragraph. Second paragraph.');
  });

  it('skips empty paragraphs', () => {
    const content = [
      makeH1('Title'),
      makeParagraph(''),
      makeParagraph('Real text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.text).toBe('Real text.');
  });

  it('returns empty title if no H1', () => {
    const content = [makeParagraph('Just text.')];
    const result = parseHomeContent(content);
    expect(result.title).toBe('');
  });

  it('returns empty text if only H1 and metadata', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Bulk pricing url: www.example.com'),
    ];
    const result = parseHomeContent(content);
    expect(result.text).toBe('');
  });
});

// ─── Metadata fields ────────────────────────────────────────────────────────

describe('parseHomeContent — metadata', () => {
  it('extracts bulk pricing URL', () => {
    const content = [
      makeH1('My App'),
      makeParagraph('Bulk pricing url: www.google.com'),
      makeParagraph('Description here.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata.bulkPricingUrl).toBe('www.google.com');
    // Should NOT appear in body text
    expect(result.text).toBe('Description here.');
  });

  it('extracts bulk pricing message', () => {
    const content = [
      makeH1('My App'),
      makeParagraph('Bulk pricing message: Love it? Bring it to your studio.'),
      makeParagraph('Description.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata.bulkPricingMessage).toBe('Love it? Bring it to your studio.');
    expect(result.text).toBe('Description.');
  });

  it('extracts both metadata fields', () => {
    const content = [
      makeH1('Ballet No Frills'),
      makeParagraph('Bulk pricing url: www.google.com'),
      makeParagraph('Bulk pricing message: Love Ballet No Frills? Bring to your studio.'),
      makeParagraph('This is the main description.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata.bulkPricingUrl).toBe('www.google.com');
    expect(result.metadata.bulkPricingMessage).toBe('Love Ballet No Frills? Bring to your studio.');
    expect(result.text).toBe('This is the main description.');
  });

  it('works with no metadata fields at all', () => {
    const content = [
      makeH1('Simple App'),
      makeParagraph('Just a description with no special tags.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata).toEqual({});
    expect(result.text).toBe('Just a description with no special tags.');
  });

  it('metadata keys are case-insensitive', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('BULK PRICING URL: www.test.com'),
      makeParagraph('Body.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata.bulkPricingUrl).toBe('www.test.com');
  });

  it('ignores metadata key with empty value', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Bulk pricing url:'),
      makeParagraph('Body text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata.bulkPricingUrl).toBeUndefined();
    // The "Bulk pricing url:" line falls through as regular text
    expect(result.text).toContain('Bulk pricing url:');
  });

  it('does not treat random colons as metadata', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Important note: this should stay in body text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.metadata).toEqual({});
    expect(result.text).toBe('Important note: this should stay in body text.');
  });
});

// ─── Image detection ────────────────────────────────────────────────────────

describe('parseHomeContent — images', () => {
  it('detects inline image object IDs', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Text.'),
      makeInlineImage('img-001'),
    ];
    const result = parseHomeContent(content);
    expect(result.inlineImageIds).toEqual(['img-001']);
  });

  it('detects positioned image object IDs', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Text.'),
      makePositionedImage('pos-001'),
    ];
    const result = parseHomeContent(content);
    expect(result.positionedImageIds).toEqual(['pos-001']);
  });

  it('returns empty arrays when no images', () => {
    const content = [
      makeH1('Title'),
      makeParagraph('Text.'),
    ];
    const result = parseHomeContent(content);
    expect(result.inlineImageIds).toEqual([]);
    expect(result.positionedImageIds).toEqual([]);
  });
});

// ─── Full document simulation ───────────────────────────────────────────────

describe('parseHomeContent — full document', () => {
  it('parses a complete home document with all fields', () => {
    const content = [
      makeH1('Ballet No Frills'),
      makeParagraph('Bulk pricing url: www.google.com'),
      makeParagraph('Bulk pricing message: Love Ballet No Frills? Bring to your studio.'),
      makeParagraph('Unleash your potential with Ballet No Frills.'),
      makeParagraph('This comprehensive suite of courses is your dedicated pathway.'),
      makeInlineImage('bg-image-id'),
    ];
    const result = parseHomeContent(content);

    expect(result.title).toBe('Ballet No Frills');
    expect(result.text).toBe(
      'Unleash your potential with Ballet No Frills. This comprehensive suite of courses is your dedicated pathway.'
    );
    expect(result.metadata.bulkPricingUrl).toBe('www.google.com');
    expect(result.metadata.bulkPricingMessage).toBe('Love Ballet No Frills? Bring to your studio.');
    expect(result.inlineImageIds).toEqual(['bg-image-id']);
  });

  it('parses a minimal home document (no metadata)', () => {
    const content = [
      makeH1('My Learning App'),
      makeParagraph('Welcome to the app.'),
      makeInlineImage('hero-img'),
    ];
    const result = parseHomeContent(content);

    expect(result.title).toBe('My Learning App');
    expect(result.text).toBe('Welcome to the app.');
    expect(result.metadata).toEqual({});
    expect(result.inlineImageIds).toEqual(['hero-img']);
  });
});
