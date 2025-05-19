import { Injectable } from '@nestjs/common';
import { ScraperHttpClient } from './scraper-http.client';
import { ScraperResponse } from './interfaces';
import { formatScraperResult } from './formatters';
import { AmazonProduct } from './dto';
import { ProductDetail } from './interfaces/product-detail.interface';
import { SupabaseService } from 'supabase/supabase.service';
import { TableName } from 'lib/enums';

@Injectable()
export class AmazonService {
  constructor(
    private readonly scraperHttpClient: ScraperHttpClient,
    private readonly supabaseService: SupabaseService,
  ) {}

  public async queryAmazonProducts(searchTerm: string) {
    const { results } = await this.queryProductsFromApi(searchTerm);
    return formatScraperResult(results, searchTerm);
  }

  public async saveAmazonProducts(
    products: AmazonProduct[],
    testId: string,
    companyId: string,
  ) {
    let savedProducts = [];

    for (const product of products) {
      const { feature_bullets, images } = await this.getProductDetail(
        product.asin,
      );

      const savedProduct = await this.supabaseService.insert<AmazonProduct>(
        TableName.AMAZON_PRODUCTS,
        {
          ...product,
          bullet_points: feature_bullets,
          images,
          company_id: companyId,
        },
      );

      savedProducts = [...savedProducts, ...savedProduct];
    }

    return await this.saveProductsInCompetitorTable(testId, savedProducts);
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

  private getProductDetail(asin: string) {
    return this.scraperHttpClient.get<ProductDetail>(
      '/structured/amazon/product',
      {
        params: {
          country: 'US',
          tld: 'com',
          asin,
        },
      },
    );
  }

  private async saveProductsInCompetitorTable(
    testId: string,
    competitors: Array<AmazonProduct & { id: string }>,
  ) {
    const dto = competitors.map((competitor) => ({
      test_id: testId,
      product_id: competitor.id,
    }));

    return await this.supabaseService.insert(TableName.TEST_COMPETITORS, dto);
  }
}
