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

  public async get<T>(path: string, config?: RequestInit): Promise<T> {
    // Extract the path without query parameters
    const urlPath = path.split('?')[0];
    
    // Get existing query parameters from the path
    const url = new URL(path, this.baseUrl);
    const existingParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      existingParams[key] = value;
    });
    
    // Add our required parameters - using ultra_premium=true for protected domains like Walmart
    // ultra_premium=true costs 30 credits but guarantees access to protected domains
    const params = {
      ...existingParams,
      api_key: this.apiKey,
      ultra_premium: 'true', // 30 credits - required for protected domains like Walmart
    };
    
    // Use the base client's parameter system
    return super.get<T>(urlPath, { ...config, params });
  }
}
