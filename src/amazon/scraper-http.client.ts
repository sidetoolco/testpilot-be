import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';
import { AxiosRequestConfig } from 'axios';

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

    super('https://api.scraperapi.com');
    this.apiKey = scraperApiKey;
  }

  private addApiKeyToConfig(config?: AxiosRequestConfig): AxiosRequestConfig {
    return {
      ...config,
      params: {
        ...config?.params,
        api_key: this.apiKey,
      },
    };
  }

  public async get<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
    return super.get<T>(path, this.addApiKeyToConfig(config));
  }
}
