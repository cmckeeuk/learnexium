import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
}

let envLoaded = false;
let cachedServiceAccount: ServiceAccountKey | null = null;
let cachedServiceAccountPath: string | null = null;

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.filter(Boolean)));
}

function parseEnvContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ')
      ? line.slice('export '.length).trim()
      : line;

    const separatorIndex = withoutExport.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = withoutExport.slice(0, separatorIndex).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(separatorIndex + 1).trim();

    const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
    const hasSingleQuotes = value.startsWith('\'') && value.endsWith('\'');
    if (hasDoubleQuotes || hasSingleQuotes) {
      value = value.slice(1, -1);
    } else {
      const inlineCommentIndex = value.indexOf(' #');
      if (inlineCommentIndex >= 0) {
        value = value.slice(0, inlineCommentIndex).trim();
      }
    }

    parsed[key] = value;
  }

  return parsed;
}

function candidateEnvPaths(): string[] {
  const cwd = process.cwd();
  return uniquePaths([
    path.resolve(__dirname, '../.env.local'),
    path.resolve(__dirname, '../.env'),
    path.resolve(cwd, 'functions/.env.local'),
    path.resolve(cwd, 'functions/.env'),
    path.resolve(cwd, '.env.local'),
    path.resolve(cwd, '.env'),
    path.resolve(__dirname, '../../.env.local'),
    path.resolve(__dirname, '../../.env'),
  ]);
}

export function loadParserEnv(): void {
  if (envLoaded) return;

  for (const envPath of candidateEnvPaths()) {
    if (!fs.existsSync(envPath)) continue;

    const parsed = parseEnvContent(fs.readFileSync(envPath, 'utf8'));
    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  envLoaded = true;
}

function getEnv(name: string): string | undefined {
  loadParserEnv();
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function getRequiredEnv(name: string): string {
  const value = getEnv(name);
  if (!value) {
    throw new Error(`${name} is required. Set it in functions/.env or as an environment variable.`);
  }
  return value;
}

export function resolveServiceAccountPath(): string {
  if (cachedServiceAccountPath) return cachedServiceAccountPath;

  const configuredPath = getEnv('GOOGLE_SERVICE_ACCOUNT_PATH');
  const configuredAbsolutePath = configuredPath
    ? (path.isAbsolute(configuredPath) ? configuredPath : path.resolve(process.cwd(), configuredPath))
    : '';

  const fallbackPath = path.resolve(__dirname, '../../service-account.json');
  const cwdPath = path.resolve(process.cwd(), 'service-account.json');
  const functionsCwdPath = path.resolve(process.cwd(), 'functions/service-account.json');

  const candidates = uniquePaths([
    configuredAbsolutePath,
    fallbackPath,
    cwdPath,
    functionsCwdPath,
  ]);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      cachedServiceAccountPath = candidate;
      return candidate;
    }
  }

  if (configuredPath) {
    throw new Error(`Service account file not found at GOOGLE_SERVICE_ACCOUNT_PATH: ${configuredAbsolutePath}`);
  }

  throw new Error(
    `service-account.json not found. Set GOOGLE_SERVICE_ACCOUNT_PATH or place it at ${fallbackPath}.`,
  );
}

export function getGoogleServiceAccount(): ServiceAccountKey {
  if (cachedServiceAccount) return cachedServiceAccount;

  const serviceAccountPath = resolveServiceAccountPath();
  const raw = fs.readFileSync(serviceAccountPath, 'utf8');
  const parsed = JSON.parse(raw) as ServiceAccountKey;

  if (!parsed.client_email || !parsed.private_key) {
    throw new Error(`Invalid service account JSON at ${serviceAccountPath}`);
  }

  cachedServiceAccount = parsed;
  return parsed;
}

export function ensureFirebaseAdminInitialized(): void {
  loadParserEnv();

  if (admin.apps.length) return;

  const storageBucket = getRequiredEnv('FIREBASE_STORAGE_BUCKET');
  const serviceAccount = getGoogleServiceAccount();

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
    storageBucket,
  });

  console.log(`🔥 Firebase initialized with bucket: ${storageBucket}\n`);
}

export function resolveGoogleDriveFolderId(explicitFolderId?: string): string {
  const folderId = explicitFolderId?.trim() || getEnv('GOOGLE_DRIVE_FOLDER_ID');

  if (!folderId) {
    throw new Error(
      'GOOGLE_DRIVE_FOLDER_ID is required. Pass a folder ID argument or set GOOGLE_DRIVE_FOLDER_ID in functions/.env.',
    );
  }

  return folderId;
}
