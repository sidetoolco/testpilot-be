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
    const formattedResults = formatScraperResult(results, searchTerm);
    
    const enrichedResults = await Promise.all(
      formattedResults.map(async (product) => {
        try {
          const productDetail = await this.getProductDetail(product.asin);
          return {
            ...product,
            reviews_count: productDetail.total_reviews || 0,
          };
        } catch (error) {
          return product;
        }
      })
    );
    
    return enrichedResults;
  }

  public async saveAmazonProducts(
    products: AmazonProduct[],
    testId: string,
    companyId: string,
  ) {
    const savedProducts = [];

    for (const product of products) {
      const { feature_bullets, images } = await this.getProductDetail(
        product.asin,
      );

      // Check if product already exists by ASIN and company_id
      const existingProducts = await this.supabaseService.findMany(
        TableName.AMAZON_PRODUCTS,
        { asin: product.asin, company_id: companyId },
        'id, asin, title, price, rating, reviews_count, image_url, product_url, updated_at'
      );

      let savedProduct;

      if (existingProducts && existingProducts.length > 0) {
        // Update existing product - use the first match
        const existingProduct = existingProducts[0] as any;
        await this.supabaseService.update(
          TableName.AMAZON_PRODUCTS,
          {
            title: product.title,
            price: product.price,
            rating: product.rating,
            reviews_count: product.reviews_count,
            image_url: product.image_url,
            product_url: product.product_url,
            bullet_points: feature_bullets,
            images,
            updated_at: new Date().toISOString(),
          },
          [{ key: 'id' as any, value: existingProduct.id }]
        );
        savedProduct = existingProduct;
      } else {
        // Insert new product
        const newProducts = await this.supabaseService.insert(
          TableName.AMAZON_PRODUCTS,
          {
            ...product,
            bullet_points: feature_bullets,
            images,
            company_id: companyId,
          }
        );
        savedProduct = newProducts[0];
      }

      savedProducts.push(savedProduct);
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

    // Check if any of these products are already linked to this test (filter by product_type too)
    const existingLinks = await this.supabaseService.findMany(
      TableName.TEST_COMPETITORS,
      { test_id: testId, product_type: 'amazon_product' },
      'product_id'
    );

    const existingProductIds = new Set(existingLinks.map(link => (link as any).product_id));
    
    // Filter out products that are already linked to this test
    const newLinks = dto.filter(link => !existingProductIds.has(link.product_id));

    // Deduplicate within the current request to avoid duplicate inserts
    const uniqueNewLinks = [];
    const seen = new Set<string>();
    for (const link of newLinks) {
      if (!seen.has(link.product_id)) {
        seen.add(link.product_id);
        uniqueNewLinks.push(link);
      }
    }

    // Return empty array for consistency (not a different shape)
    if (uniqueNewLinks.length === 0) {
      return [];
    }

    return await this.supabaseService.insert(TableName.TEST_COMPETITORS, uniqueNewLinks);
  }
}
