import { Injectable } from '@nestjs/common';
import { ScraperHttpClient } from './scraper-http.client';
import { ScraperResponse, ProductDetail, ReviewsResponse } from './interfaces';
import { formatScraperResult } from './formatters';
import { AmazonProduct } from './dto';
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
    let savedProducts = [];

    for (const product of products) {
      const productDetail = await this.getProductDetail(product.asin);
      
      const last10Reviews = (productDetail.reviews || []).slice(0, 10);

      const savedProduct = await this.supabaseService.insert<AmazonProduct>(
        TableName.AMAZON_PRODUCTS,
        {
          ...product,
          bullet_points: productDetail.feature_bullets,
          images: productDetail.images,
          reviews: last10Reviews,
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

      const productDetail = await this.getProductDetail(product.asin);
      
      const last10Reviews = (productDetail.reviews || []).slice(0, 10);

      const savedProduct = await this.supabaseService.insert<AmazonProduct>(
        TableName.AMAZON_PRODUCTS,
        {
          ...product,
          bullet_points: productDetail.feature_bullets,
          images: productDetail.images,
          reviews: last10Reviews,
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

  public async getSavedProduct(id: string) {
    return this.supabaseService.findOne<AmazonProduct>(
      TableName.AMAZON_PRODUCTS,
      { id },
    );
  }

  public async getProductReviews(productId: string): Promise<ReviewsResponse> {
    const product = await this.getSavedProduct(productId);
    
    if (!product || !product.asin) {
      throw new Error('Product not found or missing ASIN');
    }

    if (product.reviews && product.reviews.length > 0) {
      return {
        product_name: product.title,
        asin: product.asin,
        average_rating: product.rating,
        total_reviews: product.reviews_count,
        rating_breakdown: {
          five_star: 0,
          four_star: 0,
          three_star: 0,
          two_star: 0,
          one_star: 0,
        },
        reviews: product.reviews,
      };
    }

    const productDetail = await this.getProductDetail(product.asin);
    
    return {
      product_name: productDetail.name,
      asin: product.asin,
      average_rating: productDetail.average_rating,
      total_reviews: productDetail.total_reviews,
      rating_breakdown: {
        five_star: productDetail['5_star_percentage'] || 0,
        four_star: productDetail['4_star_percentage'] || 0,
        three_star: productDetail['3_star_percentage'] || 0,
        two_star: productDetail['2_star_percentage'] || 0,
        one_star: productDetail['1_star_percentage'] || 0,
      },
      reviews: productDetail.reviews || [],
    };
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
