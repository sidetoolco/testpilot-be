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

      // Fetch detailed data for all new products in parallel (MUCH FASTER!)
      const newProductsToFetch = products.filter(product => !existingMap.has(product.walmart_id));
      
      if (newProductsToFetch.length > 0) {
        console.log(`Fetching detailed data for ${newProductsToFetch.length} products in parallel...`);
        
                    // Fetch detailed products in batches of 4 for better reliability
        const batchSize = 4;
        const detailedProductsResults = [];
        
        for (let i = 0; i < newProductsToFetch.length; i += batchSize) {
          const batch = newProductsToFetch.slice(i, i + batchSize);
          console.log(`Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} products`);
          
          // Process batch in parallel
          const batchPromises = batch.map(async (product) => {
            try {
              const detailedProduct = await this.getWalmartProductDetail(product.walmart_id);
              return {
                product,
                detailedProduct,
                success: true
              };
            } catch (error) {
              console.error(`Failed to fetch detailed data for ${product.walmart_id}:`, error);
              return {
                product,
                detailedProduct: null,
                success: false
              };
            }
          });
          
          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises);
          detailedProductsResults.push(...batchResults);
          
          // Add delay between batches to be safe
          if (i + batchSize < newProductsToFetch.length) {
            console.log(`Waiting 1 second before next batch...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
        
        // Process results
        for (const result of detailedProductsResults) {
          if (result.success && result.detailedProduct) {
            const enrichedProduct = {
              ...result.product,
              ...this.enrichProductWithDetails(result.product, result.detailedProduct),
              company_id: companyId,
            };
            newProductsToInsert.push(enrichedProduct);
            newProductsCount++;
          } else {
            // Fallback to basic product data if detailed fetch fails
            newProductsToInsert.push({
              ...result.product,
              company_id: companyId,
            });
            newProductsCount++;
          }
        }
      }
      
      // Add existing products
      for (const product of products) {
        const existingProduct = existingMap.get(product.walmart_id);
        if (existingProduct) {
          savedProducts.push(existingProduct);
          existingProductsCount++;
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

    // Fetch detailed data for all new products in parallel (MUCH FASTER!)
    const newProductsToFetch = products.filter(product => !existingMap.has(product.walmart_id));
    
    if (newProductsToFetch.length > 0) {
      console.log(`Preview: Fetching detailed data for ${newProductsToFetch.length} products in parallel...`);
      
      // Fetch detailed products in batches of 4 for better reliability
      const batchSize = 4;
      const detailedProductsResults = [];
      
      for (let i = 0; i < newProductsToFetch.length; i += batchSize) {
        const batch = newProductsToFetch.slice(i, i + batchSize);
        console.log(`Preview: Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} products`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (product) => {
          try {
            const detailedProduct = await this.getWalmartProductDetail(product.walmart_id);
            return {
              product,
              detailedProduct,
              success: true
            };
          } catch (error) {
            console.error(`Preview: Failed to fetch detailed data for ${product.walmart_id}:`, error);
            return {
              product,
              detailedProduct: null,
              success: false
            };
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        detailedProductsResults.push(...batchResults);
        
        // Add delay between batches to be safe
        if (i + batchSize < newProductsToFetch.length) {
          console.log(`Preview: Waiting 1 second before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      // Process results
      for (const result of detailedProductsResults) {
        if (result.success && result.detailedProduct) {
          const enrichedProduct = {
            ...result.product,
            ...this.enrichProductWithDetails(result.product, result.detailedProduct),
            company_id: companyId,
          };
          newProductsToInsert.push(enrichedProduct);
        } else {
          // Fallback to basic product data if detailed fetch fails
          newProductsToInsert.push({
            ...result.product,
            company_id: companyId,
          });
        }
      }
    }
    
    // Add existing products
    for (const product of products) {
      const existingProduct = existingMap.get(product.walmart_id);
      if (existingProduct) {
        savedProducts.push(existingProduct);
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
    // Pass the path with query parameters, ScraperHttpClient will handle premium=true automatically
    return this.scraperHttpClient.get<WalmartResponse>(`/structured/walmart/search?query=${encodeURIComponent(searchTerm)}&page=1`);
  }

  private queryProductDetailFromApi(productId: string) {
    // Pass the path with query parameters, ScraperHttpClient will handle premium=true automatically
    return this.scraperHttpClient.get<WalmartProductDetail>(`/structured/walmart/product?product_id=${productId}`);
  }

  private enrichProductWithDetails(basicProduct: WalmartProduct, detailedProduct: any) {
    // Extract additional fields from detailed product response
    const enriched = {
      // Handle images field - convert string to array if needed
      images: this.formatImagesField(detailedProduct.images),
      product_category: detailedProduct.product_category || null,
      product_short_description: detailedProduct.product_short_description || null,
      product_availability: detailedProduct.product_availability || null,
      sold_by: detailedProduct.sold_by || null,
      sku: detailedProduct.sku || null,
      gtin: detailedProduct.gtin || null,
      brand: detailedProduct.brand || null,
      bullet_points: detailedProduct.bullet_points || null,
      // Add any other fields you want to capture
    };
    
    // Log what we're capturing for debugging
    console.log(`Enriching product ${detailedProduct.sku || detailedProduct.id}:`);
    console.log(`  - Images: ${enriched.images ? enriched.images.length : 0} found`);
    console.log(`  - Description: ${enriched.product_short_description ? 'Yes' : 'No'}`);
    console.log(`  - Category: ${enriched.product_category || 'None'}`);
    
    return enriched;
  }

  private formatImagesField(images: any): string[] | null {
    if (!images) return null;
    
    let imageArray: string[] = [];
    
    // If images is already an array, use it
    if (Array.isArray(images)) {
      imageArray = images;
    }
    // If images is a string, convert to array with single item
    else if (typeof images === 'string') {
      imageArray = [images];
    }
    // If images is an object, try to extract URLs
    else if (typeof images === 'object') {
      if (images.thumbnail) imageArray = [images.thumbnail];
      else if (images.main) imageArray = [images.main];
    }
    
    // Filter out invalid URLs and limit to exactly 5 images
    const validImages = imageArray.filter(img => img && typeof img === 'string' && img.trim() !== '');
    
    if (validImages.length === 0) {
      console.log('No valid images found in:', images);
      return null;
    }
    
    // Limit to exactly 5 images
    const limitedImages = validImages.slice(0, 5);
    console.log(`Formatted images: ${limitedImages.length} out of ${validImages.length} total`);
    
    return limitedImages;
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
        product_type: 'walmart_product' // Add this line to fix foreign key constraint violation
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
