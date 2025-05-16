import { Injectable } from '@nestjs/common';
import { ScraperHttpClient } from './scraper-http.client';
import { ScraperResponse } from './interfaces';
import { formatScraperResult } from './formatters';

@Injectable()
export class AmazonService {
  constructor(private readonly scraperHttpClient: ScraperHttpClient) {}

  public async queryAmazonProducts(searchTerm: string) {
    const { results } = await this.queryProductsFromApi(searchTerm);
    return formatScraperResult(results, searchTerm);
  }

  private queryProductsFromApi(searchTerm: string) {
    return this.scraperHttpClient.get<ScraperResponse>(
      '/structured/amazon/search',
      {
        params: {
          query: searchTerm,
          country: 'US',
          tld: 'com',
          page: '1',
        },
      },
    );
  }
}
