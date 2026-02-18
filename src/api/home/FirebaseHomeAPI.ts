import { HomeAPI, HomeConfig } from './HomeAPI';
import { getJsonWithOfflineCache } from '../../utils/offlineJsonCache';

const STORAGE_BASE = 'https://storage.googleapis.com/smiling-memory-427311-h3.firebasestorage.app';
const HOME_CACHE_KEY = 'home:config';

export class FirebaseHomeAPI implements HomeAPI {
  private async fetchHomeConfig(): Promise<HomeConfig> {
    const url = `${STORAGE_BASE}/home/home.json`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch home config: ${response.status} ${response.statusText}`);
    }
    return await response.json();
  }

  async getHomeConfig(): Promise<HomeConfig> {
    try {
      return await getJsonWithOfflineCache(HOME_CACHE_KEY, () => this.fetchHomeConfig());
    } catch (error) {
      console.error('[FirebaseHomeAPI] Error loading home config:', error);
      throw error;
    }
  }
}
