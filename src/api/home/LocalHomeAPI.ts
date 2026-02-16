import { HomeAPI, HomeConfig } from './HomeAPI';
import homeConfigJson from '../../content/local/home/home.json';
import { resolveLocalImageToken } from '../../content/local/localImageRegistry';

export class LocalHomeAPI implements HomeAPI {
  async getHomeConfig(): Promise<HomeConfig> {
    return {
      ...(homeConfigJson as HomeConfig),
      backgroundImage:
        resolveLocalImageToken((homeConfigJson as HomeConfig).backgroundImage)
        ?? (homeConfigJson as HomeConfig).backgroundImage,
    };
  }
}
