export interface HomeConfig {
  title: string;
  text: string;
  backgroundImage: string | number;
  backgroundImageVersion?: number | string;
  backgroundImageHash?: string;
  bulkPricingUrl?: string;
  bulkPricingMessage?: string;
}

export interface HomeAPI {
  getHomeConfig(): Promise<HomeConfig>;
}
