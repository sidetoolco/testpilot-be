import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseHttpClient } from '../lib/http/base-http.client';

@Injectable()
export class ScrapeCreatorsHttpClient extends BaseHttpClient {
  private readonly logger = new Logger(ScrapeCreatorsHttpClient.name);

  constructor(configService: ConfigService) {
    const apiKey = configService.get<string>('SCRAPE_CREATORS_API_KEY');

    if (!apiKey) {
      throw new Error(
        'SCRAPE_CREATORS_API_KEY is not defined in environment variables',
      );
    }

    super('https://api.scrapecreators.com/', {
      'x-api-key': apiKey,
    });
  }

  public async get<T>(
    path: string,
    config?: RequestInit & { params?: Record<string, string> },
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const urlPath = url.pathname;

    const existingParams: Record<string, string> = {};
    url.searchParams.forEach((value, key) => (existingParams[key] = value));

    const clientParams = (config as any)?.params ?? {};
    const params: Record<string, string> = {
      ...existingParams,
      ...clientParams,
    };

    return super.get<T>(urlPath, { ...config, params });
  }
}
