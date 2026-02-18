import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'json-cache:v1:';

type CacheEnvelope<T> = {
  data: T;
  cachedAt: string;
};

const refreshInFlight = new Map<string, Promise<void>>();

function buildCacheKey(cacheKey: string): string {
  return `${CACHE_PREFIX}${cacheKey}`;
}

export async function readJsonCache<T>(cacheKey: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(buildCacheKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeJsonCache<T>(cacheKey: string, data: T): Promise<void> {
  const envelope: CacheEnvelope<T> = {
    data,
    cachedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(buildCacheKey(cacheKey), JSON.stringify(envelope));
}

function startBackgroundRefresh<T>(cacheKey: string, fetcher: () => Promise<T>): void {
  if (refreshInFlight.has(cacheKey)) return;

  const task = (async () => {
    const fresh = await fetcher();
    await writeJsonCache(cacheKey, fresh);
  })()
    .catch(() => {
      // Background refresh is best-effort; callers already have cached data.
    })
    .finally(() => {
      refreshInFlight.delete(cacheKey);
    });

  refreshInFlight.set(cacheKey, task);
}

/**
 * Returns cached data immediately when present, while refreshing cache in
 * the background. Falls back to network fetch when cache is empty.
 */
export async function getJsonWithOfflineCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
): Promise<T> {
  const cached = await readJsonCache<T>(cacheKey);
  if (cached !== null) {
    startBackgroundRefresh(cacheKey, fetcher);
    return cached;
  }

  const fresh = await fetcher();
  await writeJsonCache(cacheKey, fresh);
  return fresh;
}

