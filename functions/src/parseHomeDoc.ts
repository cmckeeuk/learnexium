/**
 * Parse Google Doc for home screen configuration
 * 
 * Expected document structure:
 * - First H1: Title
 * - Paragraphs: Text content (concatenated)
 * - First image: Background image
 */

import { google } from 'googleapis';
import * as https from 'https';
import * as crypto from 'crypto';
import * as admin from 'firebase-admin';
import { ensureFirebaseAdminInitialized, getGoogleServiceAccount } from './runtimeConfig';

interface UploadedImageInfo {
  publicUrl: string;
  sha256: string;
}

// Upload image to Firebase Storage
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
          
          await file.save(buffer, {
            metadata: {
              contentType: contentType,
              cacheControl: 'public, max-age=31536000, immutable',
            },
            public: true,
          });
          
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
          resolve({ publicUrl, sha256 });
        } catch (err) {
          reject(err);
        }
      });
      
      response.on('error', (err) => reject(err));
    }).on('error', (err) => reject(err));
  });
}

async function readExistingHomeConfig(): Promise<Record<string, any> | null> {
  try {
    const bucket = admin.storage().bucket();
    const file = bucket.file('home/home.json');
    const [exists] = await file.exists();
    if (!exists) return null;

    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch {
    return null;
  }
}

// Initialize Google Docs API
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

// Extract text from paragraph element
function extractText(element: any): string {
  if (!element.paragraph?.elements) return '';
  
  return element.paragraph.elements
    .map((el: any) => el.textRun?.content || '')
    .join('')
    .trim();
}

// Metadata keys that are parsed as structured fields (not body text)
const METADATA_KEYS: Record<string, string> = {
  'bulk pricing url': 'bulkPricingUrl',
  'bulk pricing message': 'bulkPricingMessage',
};

/** Parsed result from home document content (no side effects) */
export interface ParsedHomeContent {
  title: string;
  text: string;
  metadata: Record<string, string>;
  /** Inline object IDs found (first one is background image) */
  inlineImageIds: string[];
  /** Positioned object IDs found */
  positionedImageIds: string[];
}

/**
 * Pure parsing function — extracts structured data from Google Docs body elements.
 * No network calls, no Firebase, fully testable.
 */
export function parseHomeContent(content: any[]): ParsedHomeContent {
  let title = '';
  const textParagraphs: string[] = [];
  const metadata: Record<string, string> = {};
  const inlineImageIds: string[] = [];
  const positionedImageIds: string[] = [];

  for (const element of content) {
    // Extract title from first H1
    if (element.paragraph?.paragraphStyle?.namedStyleType === 'HEADING_1') {
      if (!title) {
        title = extractText(element);
      }
      continue;
    }

    // Extract text from paragraphs (skip empty)
    if (element.paragraph?.elements) {
      const paraText = extractText(element);
      if (paraText && !paraText.startsWith('\n')) {
        // Check if this is a metadata field (e.g. "Bulk pricing url: www.google.com")
        const colonIndex = paraText.indexOf(':');
        if (colonIndex > 0) {
          const key = paraText.substring(0, colonIndex).trim().toLowerCase();
          const value = paraText.substring(colonIndex + 1).trim();
          if (METADATA_KEYS[key] && value) {
            metadata[METADATA_KEYS[key]] = value;
            continue; // Don't include in body text
          }
        }
        textParagraphs.push(paraText);
      }

      // Check for inline images
      for (const el of element.paragraph.elements) {
        if (el.inlineObjectElement?.inlineObjectId) {
          inlineImageIds.push(el.inlineObjectElement.inlineObjectId);
        }
      }
    }

    // Check for positioned objects
    if (element.paragraph?.positionedObjectIds) {
      positionedImageIds.push(...element.paragraph.positionedObjectIds);
    }
  }

  return {
    title,
    text: textParagraphs.join(' '),
    metadata,
    inlineImageIds,
    positionedImageIds,
  };
}

// Parse home document
export async function parseHomeDoc(docId: string): Promise<void> {
  console.log('🏠 Parsing Home Document\n');
  console.log(`Document ID: ${docId}\n`);

  try {
    ensureFirebaseAdminInitialized();
    // Initialize Google Docs API
    const docs = await initializeDocsClient();

    // Fetch document
    console.log('📥 Fetching document from Google Docs...');
    const response = await docs.documents.get({ documentId: docId });
    const doc = response.data;
    const content = doc.body?.content || [];
    console.log(`✅ Retrieved ${content.length} elements\n`);

    console.log('🔍 Parsing document structure...\n');

    // Use pure parsing function
    const parsed = parseHomeContent(content);
    const { title, text, metadata } = parsed;

    console.log(`   📌 Title: "${title}"`);
    for (const [key, value] of Object.entries(metadata)) {
      console.log(`   🏷️  Metadata: ${key} = "${value}"`);
    }

    // Upload first image found (inline or positioned)
    let backgroundImageUrl = '';
    let backgroundImageHash = '';

    for (const objectId of parsed.inlineImageIds) {
      const inlineObject = doc.inlineObjects?.[objectId];
      const imageUrl = inlineObject?.inlineObjectProperties?.embeddedObject?.imageProperties?.contentUri;
      if (imageUrl) {
        console.log(`   🖼️  Found background image`);
        console.log(`   📤 Uploading to Firebase Storage...`);
        const uploaded = await uploadImageToStorage(imageUrl, 'home/background.jpg');
        backgroundImageUrl = uploaded.publicUrl;
        backgroundImageHash = uploaded.sha256;
        console.log(`   ✅ Uploaded: ${backgroundImageUrl}\n`);
        break;
      }
    }

    if (!backgroundImageUrl) {
      for (const objectId of parsed.positionedImageIds) {
        const positionedObject = doc.positionedObjects?.[objectId];
        const imageUrl = positionedObject?.positionedObjectProperties?.embeddedObject?.imageProperties?.contentUri;
        if (imageUrl) {
          console.log(`   🖼️  Found background image (positioned)`);
          console.log(`   📤 Uploading to Firebase Storage...`);
          const uploaded = await uploadImageToStorage(imageUrl, 'home/background.jpg');
          backgroundImageUrl = uploaded.publicUrl;
          backgroundImageHash = uploaded.sha256;
          console.log(`   ✅ Uploaded: ${backgroundImageUrl}\n`);
          break;
        }
      }
    }

    // Validation
    if (!title) {
      throw new Error('No H1 heading found for title');
    }
    if (!text) {
      throw new Error('No text content found');
    }
    if (!backgroundImageUrl) {
      throw new Error('No image found for background');
    }

    console.log('✅ Parsing complete\n');
    console.log('📝 Summary:');
    console.log(`   Title: ${title}`);
    console.log(`   Text: ${text.substring(0, 60)}...`);
    console.log(`   Background: ${backgroundImageUrl}`);
    if (metadata.bulkPricingUrl) console.log(`   Bulk Pricing URL: ${metadata.bulkPricingUrl}`);
    if (metadata.bulkPricingMessage) console.log(`   Bulk Pricing Msg: ${metadata.bulkPricingMessage}`);
    console.log();

    // Generate JSON
    const existingHomeConfig = await readExistingHomeConfig();
    const previousVersion = Number(existingHomeConfig?.backgroundImageVersion);
    const currentVersion = Number.isFinite(previousVersion) && previousVersion > 0 ? Math.floor(previousVersion) : 1;
    const hasPreviousHash = typeof existingHomeConfig?.backgroundImageHash === 'string' && existingHomeConfig.backgroundImageHash.length > 0;
    const imageChanged = existingHomeConfig?.backgroundImageHash !== backgroundImageHash;
    const nextVersion = imageChanged ? (hasPreviousHash ? currentVersion + 1 : currentVersion) : currentVersion;

    const homeConfig: Record<string, any> = {
      title,
      text,
      backgroundImage: backgroundImageUrl,
      backgroundImageVersion: nextVersion,
      backgroundImageHash,
      lastUpdated: new Date().toISOString(),
    };

    // Add optional metadata fields
    if (metadata.bulkPricingUrl) homeConfig.bulkPricingUrl = metadata.bulkPricingUrl;
    if (metadata.bulkPricingMessage) homeConfig.bulkPricingMessage = metadata.bulkPricingMessage;

    // Upload to Firebase Storage
    console.log('📤 Uploading home.json to Firebase Storage...');
    const bucket = admin.storage().bucket();
    const jsonPath = 'home/home.json';
    const file = bucket.file(jsonPath);

    await file.save(JSON.stringify(homeConfig, null, 2), {
      metadata: {
        contentType: 'application/json',
        cacheControl: 'public, max-age=0, must-revalidate',
      },
      public: true,
    });

    const jsonUrl = `https://storage.googleapis.com/${bucket.name}/${jsonPath}`;
    console.log(`✅ Uploaded: ${jsonUrl}\n`);

    console.log('🎉 Home document parsed successfully!\n');
  } catch (error: any) {
    console.error('\n❌ Error parsing home document:', error.message);
    throw error;
  }
}

// CLI execution
async function main() {
  const docId = process.argv[2];

  if (!docId) {
    console.error('❌ Usage: npm run parse:home -- <google-doc-id>\n');
    process.exit(1);
  }

  try {
    await parseHomeDoc(docId);
  } catch (error: any) {
    console.error('❌ Parse failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
