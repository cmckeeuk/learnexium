/**
 * List Google Docs in a specific folder
 * 
 * This script tests the Google Docs API connection by listing all documents
 * in a specified Google Drive folder.
 * 
 * Usage:
 *   npm run test:list-docs
 */

import { google } from 'googleapis';
import {
  getGoogleServiceAccount,
  resolveGoogleDriveFolderId,
  resolveServiceAccountPath,
} from './runtimeConfig';

interface GoogleDoc {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
}

/**
 * Initialize Google Drive API client with service account
 */
async function initializeDriveClient() {
  try {
    const serviceAccountPath = resolveServiceAccountPath();
    const serviceAccount = getGoogleServiceAccount();

    // Create JWT client
    const auth = new google.auth.JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly',
      ],
    });

    // Initialize Drive API
    const drive = google.drive({ version: 'v3', auth });

    console.log('✅ Google Drive API client initialized');
    console.log(`   Service account: ${serviceAccount.client_email}\n`);
    console.log(`   Key file: ${serviceAccountPath}\n`);

    return drive;
  } catch (error: any) {
    const message = error?.message || String(error);
    if (message.includes('service-account')) {
      console.error(`❌ ${message}`);
      console.log('\nTo set up authentication:');
      console.log('1. Go to Google Cloud Console: https://console.cloud.google.com');
      console.log('2. Create a new project or select existing one');
      console.log('3. Enable Google Drive API and Google Docs API');
      console.log('4. Create a Service Account');
      console.log('5. Download the JSON key file');
      console.log('6. Save it as "service-account.json" in the project root');
      console.log('7. Share your Google Drive folder with the service account email\n');
      process.exit(1);
    }
    console.error('❌ Error initializing Google Drive client:', error);
    throw error;
  }
}

/**
 * List all Google Docs in a specific folder
 */
async function listDocsInFolder(folderId: string): Promise<GoogleDoc[]> {
  const drive = await initializeDriveClient();

  try {
    console.log(`🔍 Searching for Google Docs in folder: ${folderId}\n`);

    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
      fields: 'files(id, name, mimeType, createdTime, modifiedTime)',
      orderBy: 'name',
    });

    const files = response.data.files || [];

    if (files.length === 0) {
      console.log('⚠️  No Google Docs found in this folder\n');
      console.log('Make sure:');
      console.log('1. The folder ID is correct');
      console.log('2. The service account has been granted access to the folder');
      console.log('3. There are Google Docs (not other file types) in the folder\n');
      return [];
    }

    return files.map(file => ({
      id: file.id!,
      name: file.name!,
      mimeType: file.mimeType!,
      createdTime: file.createdTime!,
      modifiedTime: file.modifiedTime!,
    }));
  } catch (error: any) {
    if (error.code === 404) {
      console.error('❌ Folder not found. Check the FOLDER_ID and permissions.\n');
    } else if (error.code === 403) {
      console.error('❌ Permission denied. Make sure the service account has access to the folder.\n');
    } else {
      console.error('❌ Error listing documents:', error.message);
    }
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('📚 Google Docs Lister\n');
  console.log('=' .repeat(60) + '\n');

  try {
    const folderId = resolveGoogleDriveFolderId();
    const docs = await listDocsInFolder(folderId);

    if (docs.length > 0) {
      console.log(`✅ Found ${docs.length} Google Doc(s):\n`);
      
      docs.forEach((doc, index) => {
        console.log(`${index + 1}. ${doc.name}`);
        console.log(`   ID: ${doc.id}`);
        console.log(`   Created: ${new Date(doc.createdTime).toLocaleDateString()}`);
        console.log(`   Modified: ${new Date(doc.modifiedTime).toLocaleDateString()}`);
        console.log();
      });

      console.log('=' .repeat(60));
      console.log(`✅ Successfully listed ${docs.length} document(s)\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('GOOGLE_DRIVE_FOLDER_ID')) {
      console.error(`❌ ${message}\n`);
      console.log('To find your folder ID:');
      console.log('1. Open the folder in Google Drive');
      console.log('2. Copy the ID from the URL: drive.google.com/drive/folders/FOLDER_ID\n');
      process.exit(1);
    }
    console.error('\n❌ Failed to list documents');
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { listDocsInFolder, initializeDriveClient };
