import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';

@Injectable()
export class ScraperHttpClient extends BaseHttpClient {
  private readonly apiKey: string;
  private readonly logger = new Logger(ScraperHttpClient.name);

  constructor(configService: ConfigService) {
    const scraperApiKey = configService.get('SCRAPER_API_KEY');

    if (!scraperApiKey) {
      throw new Error(
        'SCRAPER_API_KEY is not defined in environment variables',
      );
    }

    super('https://api.scraperapi.com/', {});
    this.apiKey = scraperApiKey;
  }

  public async get<T>(path: string, config?: RequestInit & { params?: Record<string, string> }): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const urlPath = url.pathname;

    const existingParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => (existingParams[key] = value));

    const clientParams = (config as any)?.params ?? {};
    const params = {
      ...existingParams,
      ...clientParams, // allow caller to opt-in to ultra_premium
      api_key: this.apiKey,
    };

    return super.get<T>(urlPath, { ...config, params });
  }
}
