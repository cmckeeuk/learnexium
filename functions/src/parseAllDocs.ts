/**
 * Parse all Google Docs in a folder and generate course JSON files
 *
 * The course ID always comes from inside the document ("Course ID:" field),
 * never from the filename. Filenames are just for the content creator to
 * organise their Drive — they don't affect the app.
 *
 * How it works:
 *   1. List all Google Docs in the Drive folder
 *   2. For each doc, check if it needs re-parsing (timestamp comparison)
 *   3. Parse changed docs → courseId comes from parseGoogleDoc() return value
 *   4. Skipped docs → courseId comes from doc-mapping.json (saved in Storage)
 *   5. Build course index purely from those courseIds
 *
 * doc-mapping.json maps Google Doc IDs → courseIds, so we never need to
 * guess the courseId from the filename.
 *
 * Usage:
 *   npm run parse:all -- <folder-id>
 */

import { google } from 'googleapis';
import { parseGoogleDoc } from './parseGoogleDoc';
import { parseHomeDoc } from './parseHomeDoc';
import {
  ensureFirebaseAdminInitialized,
  getGoogleServiceAccount,
  resolveGoogleDriveFolderId,
} from './runtimeConfig';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GoogleDoc {
  id: string;
  name: string;
  modifiedTime: string;
}

interface ParseResult {
  name: string;
  courseId?: string;
  success: boolean;
  skipped: boolean;
  error?: string;
}

/** Maps Google Doc ID → courseId. Stored in Firebase Storage. */
type DocMapping = Record<string, string>;

// ─── Google Drive API ────────────────────────────────────────────────────────

async function initializeDriveClient() {
  const serviceAccount = getGoogleServiceAccount();

  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/documents.readonly',
    ],
  });

  return google.drive({ version: 'v3', auth });
}

async function listDocsInFolder(folderId: string): Promise<GoogleDoc[]> {
  const drive = await initializeDriveClient();

  console.log(`🔍 Scanning folder for course documents...\n`);

  const response = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'name',
  });

  const files = response.data.files || [];

  return files.map(file => ({
    id: file.id!,
    name: file.name!,
    modifiedTime: file.modifiedTime!,
  }));
}

// ─── Firebase Storage Helpers ────────────────────────────────────────────────

function getAdminBucket() {
  const admin = require('firebase-admin');
  return admin.storage().bucket();
}

/**
 * Read the doc-mapping.json from Firebase Storage.
 * This maps Google Doc IDs → courseIds so we know which courseId
 * belongs to which doc without parsing it again.
 */
async function readDocMapping(): Promise<DocMapping> {
  try {
    const bucket = getAdminBucket();
    const file = bucket.file('courses/doc-mapping.json');
    const [exists] = await file.exists();
    if (!exists) return {};

    const [content] = await file.download();
    return JSON.parse(content.toString());
  } catch {
    return {};
  }
}

/** Save the doc-mapping.json to Firebase Storage */
async function saveDocMapping(mapping: DocMapping): Promise<void> {
  const bucket = getAdminBucket();
  const file = bucket.file('courses/doc-mapping.json');
  await file.save(JSON.stringify(mapping, null, 2), {
    metadata: { contentType: 'application/json', cacheControl: 'private, max-age=0' },
  });
}

// ─── Timestamp Checks ────────────────────────────────────────────────────────

/**
 * Check if a course doc needs re-parsing.
 * Uses the doc-mapping to find the existing courseId, then checks the
 * summary's lastUpdated against the doc's modifiedTime.
 */
async function checkCourseNeedsUpdate(
  doc: GoogleDoc,
  docMapping: DocMapping,
): Promise<{ needsUpdate: boolean; courseId?: string }> {
  // Look up courseId from previous parse
  const courseId = docMapping[doc.id];
  if (!courseId) {
    console.log(`   📝 New course (not in doc-mapping), will parse`);
    return { needsUpdate: true };
  }

  try {
    const bucket = getAdminBucket();
    const file = bucket.file(`courses/${courseId}/course-summary.json`);
    const [exists] = await file.exists();

    if (!exists) {
      console.log(`   📝 Summary file missing for ${courseId}, will parse`);
      return { needsUpdate: true };
    }

    const [content] = await file.download();
    const summary = JSON.parse(content.toString());

    if (!summary.lastUpdated) {
      console.log(`   ⚠️  No lastUpdated in summary, will parse`);
      return { needsUpdate: true };
    }

    const docModifiedTime = new Date(doc.modifiedTime).getTime();
    const lastUploadTime = new Date(summary.lastUpdated).getTime();

    if (docModifiedTime > lastUploadTime) {
      console.log(`   🔄 Doc updated since last upload, will parse`);
      console.log(`      Doc modified: ${doc.modifiedTime}`);
      console.log(`      Last upload:  ${summary.lastUpdated}`);
      return { needsUpdate: true, courseId };
    }

    return { needsUpdate: false, courseId };
  } catch (error: any) {
    console.log(`   ⚠️  Error checking (${error.message}), will parse`);
    return { needsUpdate: true, courseId };
  }
}

/** Check if the home doc needs re-parsing */
async function checkHomeNeedsUpdate(doc: GoogleDoc): Promise<boolean> {
  try {
    const bucket = getAdminBucket();
    const file = bucket.file('home/home.json');
    const [exists] = await file.exists();
    if (!exists) return true;

    const [content] = await file.download();
    const data = JSON.parse(content.toString());
    if (!data.lastUpdated) return true;

    const docModifiedTime = new Date(doc.modifiedTime).getTime();
    const lastUploadTime = new Date(data.lastUpdated).getTime();

    if (docModifiedTime > lastUploadTime) {
      console.log(`   🔄 Home doc updated since last upload`);
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function parseAllDocs(folderId: string, force = false) {
  console.log('📚 Parse All Course Documents' + (force ? ' (FORCE re-parse)' : '') + '\n');
  console.log('='.repeat(60) + '\n');

  try {
    ensureFirebaseAdminInitialized();

    // List all documents in folder
    const docs = await listDocsInFolder(folderId);

    if (docs.length === 0) {
      console.log('⚠️  No Google Docs found in folder');
      console.log('Make sure:');
      console.log('1. The folder ID is correct');
      console.log('2. The service account has access to the folder');
      console.log('3. The folder contains Google Docs\n');
      return;
    }

    console.log(`✅ Found ${docs.length} document(s):\n`);
    docs.forEach((doc, i) => console.log(`   ${i + 1}. ${doc.name} (${doc.id})`));
    console.log();

    // Load doc-mapping from previous runs (Google Doc ID → courseId)
    const docMapping = await readDocMapping();
    console.log(`📋 Loaded doc-mapping: ${Object.keys(docMapping).length} entries\n`);

    // ── Cleanup: remove orphaned courses (doc deleted from Drive) ──

    const driveDocIds = new Set(docs.map(d => d.id));
    const orphanedDocIds = Object.keys(docMapping).filter(id => !driveDocIds.has(id));

    if (orphanedDocIds.length > 0) {
      console.log(`🧹 Found ${orphanedDocIds.length} orphaned course(s) (doc deleted from Drive):\n`);
      const bucket = getAdminBucket();

      for (const orphanDocId of orphanedDocIds) {
        const courseId = docMapping[orphanDocId];
        console.log(`   🗑️  Removing: ${courseId} (doc ${orphanDocId})`);

        try {
          // Delete course files from Storage
          const prefix = `courses/${courseId}/`;
          const [files] = await bucket.getFiles({ prefix });

          if (files.length > 0) {
            await Promise.all(files.map((f: any) => f.delete()));
            console.log(`      Deleted ${files.length} file(s) from ${prefix}`);
          } else {
            console.log(`      No files found at ${prefix}`);
          }

          // Remove from doc-mapping
          delete docMapping[orphanDocId];
          console.log(`      Removed from doc-mapping`);
        } catch (error: any) {
          console.error(`      ⚠️  Error cleaning up ${courseId}: ${error.message}`);
          // Still remove from mapping so it doesn't keep failing
          delete docMapping[orphanDocId];
        }
      }
      console.log();
    }

    // ── Parse each document ──

    const results: ParseResult[] = [];

    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      console.log('='.repeat(60));
      console.log(`\n📄 ${i + 1}/${docs.length}: ${doc.name}\n`);
      console.log('='.repeat(60) + '\n');

      try {
        const isHomeDoc = doc.name.toLowerCase().includes('home');

        if (isHomeDoc) {
          // ── Home document ──
          const needsUpdate = force || await checkHomeNeedsUpdate(doc);

          if (!needsUpdate) {
            console.log(`⏭️  Skipping (up-to-date): ${doc.name}\n`);
            results.push({ name: doc.name, success: true, skipped: true });
            continue;
          }

          console.log('🏠 Parsing home document...\n');
          await parseHomeDoc(doc.id);
          results.push({ name: doc.name, success: true, skipped: false });
        } else {
          // ── Course document ──
          const check = force
            ? { needsUpdate: true, courseId: docMapping[doc.id] }
            : await checkCourseNeedsUpdate(doc, docMapping);

          if (!check.needsUpdate && check.courseId) {
            console.log(`⏭️  Skipping (up-to-date): ${doc.name}`);
            console.log(`   Course ID: ${check.courseId}\n`);
            results.push({ name: doc.name, courseId: check.courseId, success: true, skipped: true });
            continue;
          }

          console.log('📚 Parsing course document...\n');
          const { summary } = await parseGoogleDoc(doc.id);

          // courseId comes from inside the doc, not the filename
          const courseId = summary.courseId;
          docMapping[doc.id] = courseId; // Update mapping for next run
          results.push({ name: doc.name, courseId, success: true, skipped: false });
        }

        console.log(`✅ Done: ${doc.name}\n`);
      } catch (error: any) {
        results.push({ name: doc.name, success: false, skipped: false, error: error.message });
        console.error(`❌ Failed: ${doc.name} — ${error.message}\n`);
      }
    }

    // ── Save updated doc-mapping ──

    await saveDocMapping(docMapping);
    console.log(`💾 Saved doc-mapping (${Object.keys(docMapping).length} entries)\n`);

    // ── Print summary ──

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    console.log('='.repeat(60));
    console.log('📊 PARSING SUMMARY');
    console.log('='.repeat(60) + '\n');
    console.log(`Total: ${docs.length}  ✅ ${successCount}  ❌ ${failureCount}\n`);

    results.forEach((r, i) => {
      const icon = r.success ? '✅' : '❌';
      const tag = r.skipped ? ' (skipped)' : '';
      console.log(`${i + 1}. ${icon} ${r.name}${tag}`);
      if (r.courseId) console.log(`      → ${r.courseId}`);
      if (r.error) console.log(`      Error: ${r.error}`);
    });
    console.log();

    // ── Generate course index from courseIds (from inside docs) ──

    const courseIds = results.filter(r => r.success && r.courseId).map(r => r.courseId!);

    if (courseIds.length > 0) {
      console.log('📝 Generating course index...');
      const bucket = getAdminBucket();

      const indexFile = bucket.file('courses/index.json');
      await indexFile.save(JSON.stringify({ courses: courseIds, lastUpdated: new Date().toISOString() }, null, 2), {
        metadata: { contentType: 'application/json', cacheControl: 'public, max-age=300' },
        public: true,
      });

      console.log(`✅ Index: ${courseIds.join(', ')}\n`);
    }

    if (failureCount > 0) {
      console.log('⚠️  Some documents failed. Check errors above.\n');
      process.exit(1);
    } else {
      console.log('🎉 All documents parsed successfully!\n');
    }

  } catch (error: any) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const positional = args.filter(a => !a.startsWith('--'));
  const explicitFolderId = positional[0];

  try {
    const folderId = resolveGoogleDriveFolderId(explicitFolderId);
    console.log(`📁 Using folder: ${folderId}\n`);
    await parseAllDocs(folderId, force);
  } catch (error: any) {
    console.error(`❌ ${error.message}\n`);
    console.error('Usage: npm run parse:all -- [--force] [<folder-id>]\n');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { parseAllDocs };
