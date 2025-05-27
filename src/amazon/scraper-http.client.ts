import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';

@Injectable()
export class ScraperHttpClient extends BaseHttpClient {
  private readonly apiKey: string;

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

  public async get<T>(path: string, config?: RequestInit): Promise<T> {
    const url = new URL(path, this.baseUrl);
    url.searchParams.append('api_key', this.apiKey);
    return super.get<T>(url.pathname + url.search, config);
  }
}
