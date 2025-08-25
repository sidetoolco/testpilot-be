import { Injectable } from '@nestjs/common';
import { ScraperHttpClient } from '../amazon/scraper-http.client';
import { WalmartResponse } from './interfaces/walmart-response.interface';
import { formatWalmartResult } from './formatters/walmart-result.formatter';
import { WalmartProduct } from './dto/walmart-product.dto';
import { WalmartProductDetail } from './dto/walmart-product-detail.dto';
import { SupabaseService } from 'supabase/supabase.service';
import { TableName } from 'lib/enums';

@Injectable()
export class WalmartService {
  constructor(
    private readonly scraperHttpClient: ScraperHttpClient,
    private readonly supabaseService: SupabaseService,
  ) {}

  public async queryWalmartProducts(searchTerm: string) {
    const { items } = await this.queryProductsFromApi(searchTerm);
    return formatWalmartResult(items, searchTerm);
  }

  public async getWalmartProductDetail(productId: string) {
    return this.queryProductDetailFromApi(productId);
  }

  public async getSavedProduct(id: string) {
    return this.supabaseService.findOne<WalmartProduct>(
      TableName.WALMART_PRODUCTS,
      { id },
    );
  }

  public async saveWalmartProducts(
    products: WalmartProduct[],
    testId: string,
    companyId: string,
  ) {
    try {
      // Batch check for existing products - use correct Supabase syntax
      const walmartIds = products.map(p => p.walmart_id);
      
      // Use individual queries if the 'in' operator doesn't work
      let existingProducts: WalmartProduct[] = [];
      for (const walmartId of walmartIds) {
        const existing = await this.supabaseService.findOne<WalmartProduct>(
          TableName.WALMART_PRODUCTS,
          { walmart_id: walmartId, company_id: companyId }
        );
        if (existing) {
          existingProducts.push(existing);
        }
      }
      
      // Create lookup map for faster access
      const existingMap = new Map(existingProducts.map(p => [p.walmart_id, p]));
      
      let savedProducts = [];
      let newProductsCount = 0;
      let existingProductsCount = 0;
      let newProductsToInsert = [];

      for (const product of products) {
        const existingProduct = existingMap.get(product.walmart_id);
        
        if (existingProduct) {
          // If product exists: skip insert, use existing product
          savedProducts.push(existingProduct);
          existingProductsCount++;
        } else {
          // If product is new: prepare for batch insert
          newProductsToInsert.push({
            ...product,
            company_id: companyId,
          });
          newProductsCount++;
        }
      }

      // Batch insert new products if any
      if (newProductsToInsert.length > 0) {
        const newProducts = await this.supabaseService.insert<WalmartProduct>(
          TableName.WALMART_PRODUCTS,
          newProductsToInsert
        );
        savedProducts.push(...newProducts);
      }

      console.log(`=== SAVE SUMMARY ===`);
      console.log(`Total products processed: ${savedProducts.length}`);
      console.log(`New products inserted: ${newProductsCount}`);
      console.log(`Existing products reused: ${existingProductsCount}`);
      
      const competitorResult = await this.saveProductsInCompetitorTable(testId, savedProducts);
      console.log(`Successfully saved ${savedProducts.length} products to test_competitors table`);
      
      return competitorResult;
    } catch (error) {
      console.error('Error in saveWalmartProducts:', error);
      throw error;
    }
  }

  public async saveWalmartProductPreview(
    products: WalmartProduct[],
    companyId: string,
  ) {
    // Batch check for existing products - use correct Supabase syntax
    const walmartIds = products.map(p => p.walmart_id);
    
    // Use individual queries if the 'in' operator doesn't work
    let existingProducts: WalmartProduct[] = [];
    for (const walmartId of walmartIds) {
      const existing = await this.supabaseService.findOne<WalmartProduct>(
        TableName.WALMART_PRODUCTS,
        { walmart_id: walmartId, company_id: companyId }
      );
      if (existing) {
        existingProducts.push(existing);
      }
    }
    
    // Create lookup map for faster access
    const existingMap = new Map(existingProducts.map(p => [p.walmart_id, p]));
    
    let savedProducts = [];
    let newProductsToInsert = [];

    for (const product of products) {
      const existingProduct = existingMap.get(product.walmart_id);
      
      if (existingProduct) {
        // If product exists: skip insert, use existing product
        savedProducts.push(existingProduct);
      } else {
        // If product is new: prepare for batch insert
        newProductsToInsert.push({
          ...product,
          company_id: companyId,
        });
      }
    }

    // Batch insert new products if any
    if (newProductsToInsert.length > 0) {
      const newProducts = await this.supabaseService.insert<WalmartProduct>(
        TableName.WALMART_PRODUCTS,
        newProductsToInsert
      );
      savedProducts.push(...newProducts);
    }

    console.log(`Preview: Successfully processed ${savedProducts.length} products (${existingProducts.length} existing, ${newProductsToInsert.length} new)`);
    return savedProducts;
  }

  private queryProductsFromApi(searchTerm: string) {
    const url = new URL('/structured/walmart/search', this.scraperHttpClient['baseUrl']);
    url.searchParams.append('query', searchTerm);
    url.searchParams.append('page', '1');
    
    return this.scraperHttpClient.get<WalmartResponse>(url.pathname + url.search);
  }

  private queryProductDetailFromApi(productId: string) {
    const url = new URL('/structured/walmart/product', this.scraperHttpClient['baseUrl']);
    url.searchParams.append('product_id', productId);
    
    return this.scraperHttpClient.get<WalmartProductDetail>(url.pathname + url.search);
  }

  private async saveProductsInCompetitorTable(
    testId: string,
    competitors: Array<WalmartProduct & { id: string }>,
  ) {
    try {
      console.log(`Attempting to save ${competitors.length} competitors to test_competitors table with testId: ${testId}`);
      
      const dto = competitors.map((competitor) => ({
        test_id: testId,
        product_id: competitor.id, // Use the database UUID from the saved product
      }));

      const result = await this.supabaseService.insert(TableName.TEST_COMPETITORS, dto);
      console.log(`Successfully inserted ${result.length} competitors to test_competitors table`);
      
      return result;
    } catch (error) {
      console.error('Error saving to test_competitors table:', error);
      console.error('testId:', testId);
      console.error('competitors count:', competitors.length);
      throw new Error(`Failed to save competitors to test_competitors table: ${error.message}`);
    }
  }
}
