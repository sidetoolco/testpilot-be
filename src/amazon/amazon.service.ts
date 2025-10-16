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

  public async saveAmazonProductPreview(
    products: AmazonProduct[],
    companyId: string,
  ) {
    let savedProducts = [];

    for (const product of products) {
      const existingProduct = await this.supabaseService.findMany<AmazonProduct>(
        TableName.AMAZON_PRODUCTS,
        {
          asin: product.asin,
          company_id: companyId,
        },
      );

      if (existingProduct && existingProduct.length > 0) {
        savedProducts = [...savedProducts, ...existingProduct];
        continue;
      }

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

    return savedProducts;
  }

  private queryProductsFromApi(searchTerm: string) {
    const url = new URL('/structured/amazon/search', this.scraperHttpClient['baseUrl']);
    url.searchParams.append('query', searchTerm);
    url.searchParams.append('country', 'US');
    url.searchParams.append('tld', 'com');
    url.searchParams.append('page', '1');
    
    return this.scraperHttpClient.get<ScraperResponse>(url.pathname + url.search);
  }

  public getProductDetail(asin: string) {
    const url = new URL('/structured/amazon/product', this.scraperHttpClient['baseUrl']);
    url.searchParams.append('country', 'US');
    url.searchParams.append('tld', 'com');
    url.searchParams.append('asin', asin);
    url.searchParams.append('render', 'true'); // Enable JavaScript rendering
    url.searchParams.append('wait', '3'); // Wait for content to load
    
    return this.scraperHttpClient.get<ProductDetail>(url.pathname + url.search);
  }

  private async saveProductsInCompetitorTable(
    testId: string,
    competitors: Array<AmazonProduct & { id: string }>,
  ) {
    const dto = competitors.map((competitor) => ({
      test_id: testId,
      product_id: competitor.id,
      product_type: 'amazon_product', // Set correct product type for Amazon
    }));

    return await this.supabaseService.insert(TableName.TEST_COMPETITORS, dto);
  }
}
