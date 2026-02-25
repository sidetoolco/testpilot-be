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

  public async getSavedProductByWalmartId(walmartId: string, companyId?: string) {
    const query: any = { walmart_id: walmartId };
    if (companyId) {
      query.company_id = companyId;
    }
    return this.supabaseService.findOne<WalmartProduct>(
      TableName.WALMART_PRODUCTS,
      query,
    );
  }

  public async saveWalmartProducts(
    products: WalmartProduct[],
    testId: string,
    companyId: string,
  ) {
    try {
      // Batch check for existing products using single query
      const walmartIds = products.map(p => p.walmart_id);
      
      const existingProducts = await this.supabaseService.findMany<WalmartProduct>(
        TableName.WALMART_PRODUCTS,
        { 
          walmart_id: walmartIds,
          company_id: companyId 
        }
      );
      
      // Create lookup map for faster access
      const existingMap = new Map(existingProducts.map(p => [p.walmart_id, p]));
      
      let savedProducts = [];
      let newProductsCount = 0;
      let existingProductsCount = 0;
      let newProductsToInsert = [];

      // Fetch detailed data for new products in batches of 4
      const newProductsToFetch = products.filter(product => !existingMap.has(product.walmart_id));
      
      if (newProductsToFetch.length > 0) {
        console.log(`Fetching detailed data for ${newProductsToFetch.length} new products in batches of 4...`);
        
        const batchSize = 4;
        for (let i = 0; i < newProductsToFetch.length; i += batchSize) {
          const batch = newProductsToFetch.slice(i, i + batchSize);
          console.log(`Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} products`);
          
          // Process batch in parallel
          const batchPromises = batch.map(async (product) => {
            try {
              const detailedProduct = await this.getWalmartProductDetail(product.walmart_id);
              const enrichedProduct = {
                ...product,
                ...this.enrichProductWithDetails(product, detailedProduct),
                company_id: companyId,
              };
              return { product: enrichedProduct, success: true };
            } catch (error) {
              console.warn(`Failed to fetch detailed data for ${product.walmart_id}, using basic data:`, error.message);
              return { 
                product: { ...product, company_id: companyId }, 
                success: false 
              };
            }
          });
          
          // Wait for batch to complete
          const batchResults = await Promise.all(batchPromises);
          
          // Add results to insert list
          for (const result of batchResults) {
            newProductsToInsert.push(result.product);
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

      // Batch upsert new products if any
      if (newProductsToInsert.length > 0) {
        // Filter out products with null walmart_id to avoid constraint violations
        const validProductsToInsert = newProductsToInsert
          .filter(product => product.walmart_id && product.walmart_id.trim() !== '')
          .map(({ id, ...rest }) => ({ ...rest })); // strip client-provided id to avoid UUID errors
        
        if (validProductsToInsert.length > 0) {
          const newProducts = await this.supabaseService.upsertMany<WalmartProduct>(
            TableName.WALMART_PRODUCTS,
            validProductsToInsert,
            'walmart_id,company_id'
          );
          savedProducts.push(...newProducts);
        }
        
        // Log any products that were skipped due to missing walmart_id
        const skippedProducts = newProductsToInsert.filter(product => 
          !product.walmart_id || product.walmart_id.trim() === ''
        );
        if (skippedProducts.length > 0) {
          console.warn(`Skipped ${skippedProducts.length} products due to missing walmart_id:`, 
            skippedProducts.map(p => ({ title: p.title, walmart_id: p.walmart_id }))
          );
        }
      }

      console.log(`=== SAVE SUMMARY ===`);
      console.log(`Total products processed: ${savedProducts.length}`);
      console.log(`New products inserted: ${newProductsCount}`);
      console.log(`Existing products reused: ${existingProductsCount}`);
      
      const competitorResult = await this.saveProductsInCompetitorTable(testId, savedProducts);
      console.log(`Successfully saved ${savedProducts.length} products to test_competitors table`);
      
      // For Walmart tests, we only create competitors, not test variations
      // Test variations should be created separately for your own products
      console.log(`Walmart test: Created ${competitorResult.length} competitors. Test variations should be created separately for your own products.`);
      
      return {
        competitors: competitorResult,
        variations: [], // No variations created for competitor products
        totalProducts: savedProducts.length,
        message: "Walmart competitors saved. Create test variations separately for your own products."
      };
    } catch (error) {
      console.error('Error in saveWalmartProducts:', error);
      throw error;
    }
  }

  public async saveWalmartProductPreview(
    products: WalmartProduct[],
    companyId: string,
  ) {
    // Batch check for existing products using single query
    const walmartIds = products.map(p => p.walmart_id);
    
    const existingProducts = await this.supabaseService.findMany<WalmartProduct>(
      TableName.WALMART_PRODUCTS,
      { 
        walmart_id: walmartIds,
        company_id: companyId 
      }
    );
    
    // Create lookup map for faster access
    const existingMap = new Map(existingProducts.map(p => [p.walmart_id, p]));
    
    let savedProducts = [];
    let newProductsToInsert = [];

    // Fetch detailed data for new products in batches of 4
    const newProductsToFetch = products.filter(product => !existingMap.has(product.walmart_id));
    
    if (newProductsToFetch.length > 0) {
      console.log(`Preview: Fetching detailed data for ${newProductsToFetch.length} new products in batches of 4...`);
      
      const batchSize = 4;
      for (let i = 0; i < newProductsToFetch.length; i += batchSize) {
        const batch = newProductsToFetch.slice(i, i + batchSize);
        console.log(`Preview: Processing batch ${Math.floor(i/batchSize) + 1}: ${batch.length} products`);
        
        // Process batch in parallel
        const batchPromises = batch.map(async (product) => {
          try {
            const detailedProduct = await this.getWalmartProductDetail(product.walmart_id);
            const enrichedProduct = {
              ...product,
              ...this.enrichProductWithDetails(product, detailedProduct),
              company_id: companyId,
            };
            return { product: enrichedProduct, success: true };
          } catch (error) {
            console.warn(`Preview: Failed to fetch detailed data for ${product.walmart_id}, using basic data:`, error.message);
            return { 
              product: { ...product, company_id: companyId }, 
              success: false 
            };
          }
        });
        
        // Wait for batch to complete
        const batchResults = await Promise.all(batchPromises);
        
        // Add results to insert list
        for (const result of batchResults) {
          newProductsToInsert.push(result.product);
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

    // Batch upsert new products if any
    if (newProductsToInsert.length > 0) {
      // Filter out products with null walmart_id to avoid constraint violations
      const validProductsToInsert = newProductsToInsert
        .filter(product => product.walmart_id && product.walmart_id.trim() !== '')
        .map(({ id, ...rest }) => ({ ...rest })); // strip client-provided id
      
      if (validProductsToInsert.length > 0) {
        const newProducts = await this.supabaseService.upsertMany<WalmartProduct>(
          TableName.WALMART_PRODUCTS,
          validProductsToInsert,
          'walmart_id,company_id'
        );
        savedProducts.push(...newProducts);
      }
      
      // Log any products that were skipped due to missing walmart_id
      const skippedProducts = newProductsToInsert.filter(product => 
        !product.walmart_id || product.walmart_id.trim() === ''
      );
      if (skippedProducts.length > 0) {
        console.warn(`Preview: Skipped ${skippedProducts.length} products due to missing walmart_id:`, 
          skippedProducts.map(p => ({ title: p.title, walmart_id: p.walmart_id }))
        );
      }
    }

    console.log(`Preview: Successfully processed ${savedProducts.length} products (${existingProducts.length} existing, ${newProductsToInsert.length} new)`);
    return savedProducts;
  }

  private queryProductsFromApi(searchTerm: string) {
    return this.scraperHttpClient.get<WalmartResponse>(
      `/structured/walmart/search?query=${encodeURIComponent(searchTerm)}&page=1`,
      {
        params: {
          country_code: 'us',
          premium: 'true',
        },
      }
    );
  }

  private queryProductDetailFromApi(productId: string) {
    return this.scraperHttpClient.get<WalmartProductDetail>(
      `/structured/walmart/product?product_id=${productId}`,
      {
        params: {
          country_code: 'us',
          premium: 'true',
        },
      }
    );
  }

  private enrichProductWithDetails(basicProduct: WalmartProduct, detailedProduct: any) {
    // Extract only the essential fields from detailed product response
    const enriched = {
      // Handle images field - convert string to array if needed
      images: this.formatImagesField(detailedProduct.images),
      product_short_description: detailedProduct.product_short_description || null,
    };
    
    // Log what we're capturing for debugging
    console.log(`Enriching product ${detailedProduct.sku || detailedProduct.id}:`);
    console.log(`  - Images: ${enriched.images ? enriched.images.length : 0} found`);
    console.log(`  - Description: ${enriched.product_short_description ? 'Yes' : 'No'}`);
    
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
        product_type: 'walmart_product', // Set correct product type for Walmart
      }));

      const result = await this.supabaseService.insert(TableName.TEST_COMPETITORS, dto);
      console.log(`Successfully inserted ${result.length} competitors to test_competitors table with product_type: walmart_product`);
      
      return result;
    } catch (error) {
      console.error('Error saving to test_competitors table:', error);
      console.error('testId:', testId);
      console.error('competitors count:', competitors.length);
      throw new Error(`Failed to save competitors to test_competitors table: ${error.message}`);
    }
  }

}
